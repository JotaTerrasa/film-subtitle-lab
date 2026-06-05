from __future__ import annotations

import json
import os
import re
import textwrap
import subprocess
import threading
import time
import uuid
from base64 import b64decode
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from starlette.responses import Response
from fastapi.staticfiles import StaticFiles
import requests


APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("DATA_DIR", "/data/jobs"))
MODEL_DIR = Path(os.getenv("MODEL_DIR", "/models"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Film Subtitle Lab")
app.mount("/static", StaticFiles(directory=APP_DIR / "static"), name="static")

ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text"

executor = ThreadPoolExecutor(max_workers=1)
jobs_lock = threading.Lock()
jobs: Dict[str, Dict[str, Any]] = {}


@app.middleware("http")
async def basic_auth(request: Request, call_next):
    password = os.getenv("APP_PASSWORD")
    if not password:
        return await call_next(request)

    username = os.getenv("APP_USER", "jaime")
    header = request.headers.get("authorization", "")
    valid = False
    if header.lower().startswith("basic "):
        try:
            decoded = b64decode(header.split(" ", 1)[1]).decode("utf-8")
            user, supplied = decoded.split(":", 1)
            valid = user == username and supplied == password
        except Exception:
            valid = False

    if valid:
        return await call_next(request)

    return Response(
        "Authentication required",
        status_code=401,
        headers={"WWW-Authenticate": 'Basic realm="Film Subtitle Lab"'},
    )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_name(name: str, fallback: str) -> str:
    base = Path(name or fallback).name
    base = re.sub(r"[^A-Za-z0-9._ -]+", "_", base).strip(" ._")
    return base or fallback


def job_dir(job_id: str) -> Path:
    return DATA_DIR / job_id


def job_meta_path(job_id: str) -> Path:
    return job_dir(job_id) / "job.json"


def write_job(job: Dict[str, Any]) -> None:
    job_meta_path(job["id"]).write_text(json.dumps(job, indent=2, ensure_ascii=False), encoding="utf-8")


def set_job(job_id: str, **changes: Any) -> None:
    with jobs_lock:
        job = jobs[job_id]
        job.update(changes)
        job["updated_at"] = now_iso()
        write_job(job)


def append_log(job_id: str, line: str) -> None:
    log_path = job_dir(job_id) / "job.log"
    with log_path.open("a", encoding="utf-8", errors="replace") as handle:
        handle.write(line.rstrip() + "\n")


def log_tail(job_id: str, max_lines: int = 80) -> List[str]:
    log_path = job_dir(job_id) / "job.log"
    if not log_path.exists():
        return []
    lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    return lines[-max_lines:]


async def save_upload(upload: UploadFile, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("wb") as handle:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)


def timestamp_to_seconds(value: str) -> float:
    value = value.strip().replace(",", ".")
    parts = value.split(":")
    if len(parts) == 3:
        hours, minutes, seconds = parts
    elif len(parts) == 2:
        hours, minutes, seconds = "0", parts[0], parts[1]
    else:
        raise ValueError(f"Bad timestamp: {value}")
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def strip_subtitle_markup(value: str) -> str:
    value = re.sub(r"<[^>]+>", "", value)
    return re.sub(r"\s+", " ", value).strip()


def normalize_caption_text(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9áéíóúüñçàèìòùâêîôûäëïöü\s]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def parse_subtitle_file(path: Optional[Path]) -> List[Dict[str, Any]]:
    if not path or not path.exists():
        return []

    text = path.read_text(encoding="utf-8-sig", errors="replace")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    blocks = re.split(r"\n\s*\n", text)
    cues: List[Dict[str, Any]] = []

    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines:
            continue
        if lines[0].upper().startswith("WEBVTT"):
            lines = lines[1:]
        if not lines:
            continue

        timing_index = next((idx for idx, line in enumerate(lines) if "-->" in line), -1)
        if timing_index < 0:
            continue

        timing = lines[timing_index]
        left, right = timing.split("-->", 1)
        start_raw = left.strip().split()[-1]
        end_raw = right.strip().split()[0]
        try:
            start = timestamp_to_seconds(start_raw)
            end = timestamp_to_seconds(end_raw)
        except ValueError:
            continue

        cue_text = strip_subtitle_markup(" ".join(lines[timing_index + 1 :]))
        if cue_text:
            cues.append(
                {
                    "index": len(cues) + 1,
                    "start": round(start, 3),
                    "end": round(end, 3),
                    "text": cue_text,
                }
            )

    return cues


def median(values: List[float]) -> float:
    ordered = sorted(values)
    midpoint = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[midpoint]
    return (ordered[midpoint - 1] + ordered[midpoint]) / 2.0


def estimate_reference_alignment(
    generated: List[Dict[str, Any]],
    reference: List[Dict[str, Any]],
) -> Dict[str, Any]:
    if not generated or not reference:
        return {"offset_sec": 0.0, "scale": 1.0, "matches": 0, "quality": "none"}

    generated_norm = [(cue, normalize_caption_text(cue["text"])) for cue in generated]
    reference_norm = [(cue, normalize_caption_text(cue["text"])) for cue in reference]
    generated_norm = [(cue, text) for cue, text in generated_norm if len(text) >= 8]
    reference_norm = [(cue, text) for cue, text in reference_norm if len(text) >= 8]
    if not generated_norm or not reference_norm:
        return {"offset_sec": 0.0, "scale": 1.0, "matches": 0, "quality": "none"}

    max_pairs = 500_000
    step = max(1, (len(generated_norm) * len(reference_norm)) // max_pairs)
    sampled_reference = reference_norm[::step]
    matches: List[Dict[str, float]] = []

    for ref_cue, ref_text in sampled_reference:
        ref_words = set(ref_text.split())
        best_score = 0.0
        best_gen: Optional[Dict[str, Any]] = None

        for gen_cue, gen_text in generated_norm:
            gen_words = set(gen_text.split())
            overlap = len(ref_words & gen_words)
            if overlap == 0:
                continue
            rough = overlap / max(len(ref_words), len(gen_words))
            if rough < 0.18:
                continue
            score = SequenceMatcher(None, ref_text, gen_text).ratio()
            if score > best_score:
                best_score = score
                best_gen = gen_cue

        if best_gen and best_score >= 0.42:
            matches.append(
                {
                    "ref_start": float(ref_cue["start"]),
                    "gen_start": float(best_gen["start"]),
                    "delta": float(best_gen["start"]) - float(ref_cue["start"]),
                    "score": best_score,
                }
            )

    if len(matches) < 3:
        return {"offset_sec": 0.0, "scale": 1.0, "matches": len(matches), "quality": "low"}

    offset = median([match["delta"] for match in matches])

    scale = 1.0
    if len(matches) >= 8:
        xs = [match["ref_start"] for match in matches]
        ys = [match["gen_start"] for match in matches]
        mean_x = sum(xs) / len(xs)
        mean_y = sum(ys) / len(ys)
        variance = sum((x - mean_x) ** 2 for x in xs)
        if variance > 1:
            candidate_scale = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / variance
            if 0.95 <= candidate_scale <= 1.05:
                scale = candidate_scale
                offset = mean_y - (scale * mean_x)

    quality = "high" if len(matches) >= 12 else "medium"
    return {
        "offset_sec": round(offset, 3),
        "scale": round(scale, 8),
        "matches": len(matches),
        "quality": quality,
    }


def find_output(job: Dict[str, Any], suffix: str) -> Optional[Path]:
    output_dir = Path(job["output_dir"])
    stem = Path(job["video_path"]).stem
    direct = output_dir / f"{stem}.{suffix}"
    if direct.exists():
        return direct
    matches = sorted(output_dir.glob(f"*.{suffix}"))
    return matches[0] if matches else None


def format_subtitle_timestamp(seconds: float, separator: str) -> str:
    value = max(0.0, float(seconds))
    hours = int(value // 3600)
    minutes = int((value % 3600) // 60)
    secs = int(value % 60)
    millis = int(round((value - int(value)) * 1000))
    if millis == 1000:
        secs += 1
        millis = 0
    if secs == 60:
        minutes += 1
        secs = 0
    if minutes == 60:
        hours += 1
        minutes = 0
    return f"{hours:02}:{minutes:02}:{secs:02}{separator}{millis:03}"


def append_caption_token(text: str, token: str) -> str:
    if not text:
        return token
    if token in {".", ",", "!", "?", ":", ";", "%", ")", "]", "}"}:
        return text + token
    if token.startswith("'"):
        return text + token
    return f"{text} {token}"


def wrap_caption_text(text: str) -> List[str]:
    return textwrap.wrap(text, width=42, break_long_words=False) or [text]


def elevenlabs_words_to_cues(words: List[Dict[str, Any]], fallback_text: str) -> List[Dict[str, Any]]:
    cues: List[Dict[str, Any]] = []
    cue_start: Optional[float] = None
    cue_end: Optional[float] = None
    cue_text = ""
    cue_words = 0

    def flush() -> None:
        nonlocal cue_start, cue_end, cue_text, cue_words
        text = cue_text.strip()
        if text and cue_start is not None and cue_end is not None:
            cues.append(
                {
                    "index": len(cues) + 1,
                    "start": round(cue_start, 3),
                    "end": round(max(cue_end, cue_start + 0.2), 3),
                    "text": text,
                }
            )
        cue_start = None
        cue_end = None
        cue_text = ""
        cue_words = 0

    for item in words:
        token = str(item.get("text", "")).strip()
        if not token:
            continue
        start = item.get("start")
        end = item.get("end")
        if start is None or end is None:
            continue

        start_f = float(start)
        end_f = float(end)
        next_text = append_caption_token(cue_text, token)
        duration = (end_f - cue_start) if cue_start is not None else 0
        if cue_text and (len(next_text) > 84 or cue_words >= 18 or duration >= 6.0):
            flush()

        if cue_start is None:
            cue_start = start_f
        cue_end = end_f
        cue_text = append_caption_token(cue_text, token)
        cue_words += 1

        if token.endswith((".", "!", "?")) and cue_words >= 4 and cue_start is not None and (cue_end - cue_start) >= 1.2:
            flush()

    flush()

    if not cues and fallback_text.strip():
        cues.append({"index": 1, "start": 0.0, "end": 0.2, "text": fallback_text.strip()})
    return cues


def write_srt(path: Path, cues: List[Dict[str, Any]]) -> None:
    blocks = []
    for cue in cues:
        lines = wrap_caption_text(cue["text"])
        blocks.append(
            "\n".join(
                [
                    str(cue["index"]),
                    f"{format_subtitle_timestamp(cue['start'], ',')} --> {format_subtitle_timestamp(cue['end'], ',')}",
                    *lines,
                ]
            )
        )
    path.write_text("\n\n".join(blocks) + ("\n" if blocks else ""), encoding="utf-8")


def write_vtt(path: Path, cues: List[Dict[str, Any]]) -> None:
    blocks = ["WEBVTT\n"]
    for cue in cues:
        lines = wrap_caption_text(cue["text"])
        blocks.append(
            "\n".join(
                [
                    f"{format_subtitle_timestamp(cue['start'], '.')} --> {format_subtitle_timestamp(cue['end'], '.')}",
                    *lines,
                ]
            )
        )
    path.write_text("\n\n".join(blocks) + ("\n" if len(blocks) > 1 else ""), encoding="utf-8")


def write_tsv(path: Path, cues: List[Dict[str, Any]]) -> None:
    rows = ["start\tend\ttext"]
    rows.extend(f"{cue['start']}\t{cue['end']}\t{cue['text'].replace(chr(9), ' ')}" for cue in cues)
    path.write_text("\n".join(rows) + "\n", encoding="utf-8")


def extract_word_timestamps(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    candidates: List[Dict[str, Any]] = []
    if isinstance(payload.get("word_segments"), list):
        candidates.extend(payload["word_segments"])
    elif isinstance(payload.get("words"), list):
        candidates.extend(payload["words"])
    elif isinstance(payload.get("segments"), list):
        for segment_index, segment in enumerate(payload["segments"]):
            for item in segment.get("words") or []:
                if isinstance(item, dict):
                    candidates.append({**item, "segment_index": segment_index})

    words: List[Dict[str, Any]] = []
    for item in candidates:
        if not isinstance(item, dict):
            continue
        text = str(item.get("word") or item.get("text") or "").strip()
        start = item.get("start")
        end = item.get("end")
        if not text or start is None or end is None:
            continue

        word: Dict[str, Any] = {
            "index": len(words) + 1,
            "start": round(float(start), 3),
            "end": round(float(end), 3),
            "text": text,
        }
        if item.get("score") is not None:
            word["score"] = round(float(item["score"]), 4)
        if item.get("speaker") is not None:
            word["speaker"] = item["speaker"]
        if item.get("segment_index") is not None:
            word["segment_index"] = item["segment_index"]
        words.append(word)

    return words


def load_json_payload(path: Optional[Path]) -> Dict[str, Any]:
    if not path or not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return {}


def format_elevenlabs_error(response: requests.Response) -> str:
    base = f"ElevenLabs returned HTTP {response.status_code}"
    try:
        payload = response.json()
    except Exception:
        body = response.text.strip()
        return f"{base}: {body[:500]}" if body else base

    detail = payload.get("detail") if isinstance(payload, dict) else None
    status = ""
    message = ""
    if isinstance(detail, dict):
        status = str(detail.get("status") or "")
        message = str(detail.get("message") or "")
    elif isinstance(detail, str):
        message = detail
    elif isinstance(payload, dict):
        status = str(payload.get("status") or "")
        message = str(payload.get("message") or payload.get("error") or "")

    if status == "missing_permissions" and "speech_to_text" in message:
        return (
            "ElevenLabs API key is missing the speech_to_text permission. "
            "Edit or recreate the key in ElevenLabs with Speech to Text access enabled."
        )

    parts = [part for part in [status, message] if part]
    return f"{base}: {' - '.join(parts)}" if parts else base


def write_elevenlabs_outputs(job: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, str]:
    output_dir = Path(job["output_dir"])
    stem = Path(job["video_path"]).stem
    cues = elevenlabs_words_to_cues(payload.get("words") or [], payload.get("text") or "")

    srt_path = output_dir / f"{stem}.srt"
    vtt_path = output_dir / f"{stem}.vtt"
    json_path = output_dir / f"{stem}.json"
    txt_path = output_dir / f"{stem}.txt"
    tsv_path = output_dir / f"{stem}.tsv"

    write_srt(srt_path, cues)
    write_vtt(vtt_path, cues)
    txt_path.write_text((payload.get("text") or "").strip() + "\n", encoding="utf-8")
    write_tsv(tsv_path, cues)

    enriched = {
        "provider": "elevenlabs",
        "model_id": job.get("elevenlabs_model"),
        "language": payload.get("language_code"),
        "language_probability": payload.get("language_probability"),
        "text": payload.get("text"),
        "words": payload.get("words") or [],
        "segments": cues,
        "raw": payload,
    }
    json_path.write_text(json.dumps(enriched, indent=2, ensure_ascii=False), encoding="utf-8")

    return {
        "srt": str(srt_path),
        "vtt": str(vtt_path),
        "json": str(json_path),
        "txt": str(txt_path),
        "tsv": str(tsv_path),
    }


def run_whisperx_transcription(job_id: str) -> None:
    job = jobs[job_id]
    output_dir = Path(job["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env.update(
        {
            "HF_HOME": str(MODEL_DIR / "huggingface"),
            "TORCH_HOME": str(MODEL_DIR / "torch"),
            "XDG_CACHE_HOME": str(MODEL_DIR),
        }
    )

    cmd = [
        "whisperx",
        job["video_path"],
        "--model",
        job["model"],
        "--device",
        "cuda",
        "--compute_type",
        job["compute_type"],
        "--batch_size",
        str(job["batch_size"]),
        "--output_dir",
        str(output_dir),
        "--output_format",
        "all",
        "--max_line_width",
        "42",
        "--max_line_count",
        "2",
        "--segment_resolution",
        "sentence",
        "--print_progress",
        "True",
    ]

    if job["language"] != "auto":
        cmd.extend(["--language", job["language"]])

    set_job(job_id, status="running", started_at=now_iso(), command=cmd)
    append_log(job_id, "+ " + " ".join(cmd))

    start = time.time()
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env,
        )
        assert process.stdout is not None
        for line in process.stdout:
            append_log(job_id, line)
        return_code = process.wait()
        elapsed = round(time.time() - start, 2)

        if return_code != 0:
            set_job(job_id, status="error", error=f"whisperx exited with code {return_code}", elapsed_sec=elapsed)
            return

        generated = {
            "srt": str(find_output(job, "srt") or ""),
            "vtt": str(find_output(job, "vtt") or ""),
            "json": str(find_output(job, "json") or ""),
            "txt": str(find_output(job, "txt") or ""),
            "tsv": str(find_output(job, "tsv") or ""),
        }
        set_job(job_id, status="done", finished_at=now_iso(), elapsed_sec=elapsed, generated=generated)
    except Exception as exc:
        append_log(job_id, f"ERROR: {exc}")
        set_job(job_id, status="error", error=str(exc))


def run_elevenlabs_transcription(job_id: str) -> None:
    job = jobs[job_id]
    output_dir = Path(job["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not api_key:
        set_job(
            job_id,
            status="error",
            error="ELEVENLABS_API_KEY is not set in the container environment.",
        )
        append_log(job_id, "ERROR: ELEVENLABS_API_KEY is not set.")
        return

    model_id = os.getenv("ELEVENLABS_STT_MODEL", "scribe_v2").strip() or "scribe_v2"
    job["elevenlabs_model"] = model_id
    data: Dict[str, Any] = {
        "model_id": model_id,
        "timestamps_granularity": "word",
        "diarize": "false",
        "tag_audio_events": "false",
    }
    if job["language"] != "auto":
        data["language_code"] = job["language"]

    command_meta = {
        "provider": "elevenlabs",
        "endpoint": ELEVENLABS_STT_URL,
        "model_id": model_id,
        "language": job["language"],
        "file": Path(job["video_path"]).name,
    }
    set_job(job_id, status="running", started_at=now_iso(), command=command_meta)
    append_log(
        job_id,
        f"+ ElevenLabs STT model={model_id} language={job['language']} file={Path(job['video_path']).name}",
    )

    start = time.time()
    try:
        with Path(job["video_path"]).open("rb") as handle:
            response = requests.post(
                ELEVENLABS_STT_URL,
                headers={"xi-api-key": api_key},
                data=data,
                files={"file": (Path(job["video_path"]).name, handle, "application/octet-stream")},
                timeout=None,
            )

        elapsed = round(time.time() - start, 2)
        append_log(job_id, f"ElevenLabs response: HTTP {response.status_code}")
        if response.status_code >= 400:
            error_message = format_elevenlabs_error(response)
            append_log(job_id, error_message)
            append_log(job_id, response.text[:2000])
            set_job(job_id, status="error", error=error_message, elapsed_sec=elapsed)
            return

        payload = response.json()
        generated = write_elevenlabs_outputs(job, payload)
        set_job(job_id, status="done", finished_at=now_iso(), elapsed_sec=elapsed, generated=generated)
    except Exception as exc:
        append_log(job_id, f"ERROR: {exc}")
        set_job(job_id, status="error", error=str(exc))


def run_transcription(job_id: str) -> None:
    provider = jobs[job_id].get("stt_provider", "whisperx")
    if provider == "elevenlabs":
        run_elevenlabs_transcription(job_id)
    else:
        run_whisperx_transcription(job_id)


def load_existing_jobs() -> None:
    for meta in DATA_DIR.glob("*/job.json"):
        try:
            job = json.loads(meta.read_text(encoding="utf-8"))
        except Exception:
            continue
        if job.get("status") == "running":
            job["status"] = "error"
            job["error"] = "Interrupted while the container was stopped."
        jobs[job["id"]] = job


load_existing_jobs()


@app.get("/")
def index() -> FileResponse:
    return FileResponse(APP_DIR / "static" / "index.html")


@app.post("/api/jobs")
async def create_job(
    video: UploadFile = File(...),
    reference: Optional[UploadFile] = File(None),
    stt_provider: str = Form("whisperx"),
    language: str = Form("en"),
    model: str = Form("large-v3"),
    batch_size: int = Form(16),
    compute_type: str = Form("float16"),
) -> Dict[str, Any]:
    if not video.filename:
        raise HTTPException(status_code=400, detail="Video file is required.")
    if stt_provider not in {"whisperx", "elevenlabs"}:
        raise HTTPException(status_code=400, detail="Unsupported STT provider.")

    job_id = uuid.uuid4().hex[:12]
    root = job_dir(job_id)
    upload_dir = root / "uploads"
    output_dir = root / "output"
    upload_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    video_name = safe_name(video.filename, "input.mp4")
    video_path = upload_dir / video_name
    await save_upload(video, video_path)

    reference_path = ""
    if reference and reference.filename:
        reference_name = safe_name(reference.filename, "reference.srt")
        reference_target = upload_dir / reference_name
        await save_upload(reference, reference_target)
        reference_path = str(reference_target)

    job = {
        "id": job_id,
        "status": "queued",
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "video_name": video_name,
        "video_path": str(video_path),
        "reference_path": reference_path,
        "output_dir": str(output_dir),
        "stt_provider": stt_provider,
        "language": language,
        "model": model,
        "batch_size": batch_size,
        "compute_type": compute_type,
        "generated": {},
        "error": "",
    }

    with jobs_lock:
        jobs[job_id] = job
        write_job(job)

    executor.submit(run_transcription, job_id)
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/jobs/{job_id}/status")
def job_status(job_id: str) -> Dict[str, Any]:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return {
        "id": job_id,
        "status": job["status"],
        "stt_provider": job.get("stt_provider", "whisperx"),
        "error": job.get("error", ""),
        "created_at": job.get("created_at"),
        "started_at": job.get("started_at"),
        "finished_at": job.get("finished_at"),
        "elapsed_sec": job.get("elapsed_sec"),
        "log_tail": log_tail(job_id),
    }


@app.get("/api/jobs/{job_id}/result")
def job_result(job_id: str) -> Dict[str, Any]:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job["status"] != "done":
        raise HTTPException(status_code=409, detail=f"Job is {job['status']}.")

    generated_srt = find_output(job, "srt")
    generated_vtt = find_output(job, "vtt")
    generated_json = find_output(job, "json")
    generated_txt = find_output(job, "txt")
    generated_tsv = find_output(job, "tsv")
    reference_path = Path(job["reference_path"]) if job.get("reference_path") else None
    generated_cues = parse_subtitle_file(generated_srt or generated_vtt)
    reference_cues = parse_subtitle_file(reference_path)
    word_timestamps = extract_word_timestamps(load_json_payload(generated_json))
    alignment = estimate_reference_alignment(generated_cues, reference_cues)

    return {
        "id": job_id,
        "stt_provider": job.get("stt_provider", "whisperx"),
        "video_name": job["video_name"],
        "video_url": f"/api/jobs/{job_id}/video",
        "generated_cues": generated_cues,
        "word_timestamps": word_timestamps,
        "reference_cues": reference_cues,
        "alignment": alignment,
        "downloads": {
            "srt": f"/api/jobs/{job_id}/download/srt" if generated_srt else "",
            "vtt": f"/api/jobs/{job_id}/download/vtt" if generated_vtt else "",
            "json": f"/api/jobs/{job_id}/download/json" if generated_json else "",
            "txt": f"/api/jobs/{job_id}/download/txt" if generated_txt else "",
            "tsv": f"/api/jobs/{job_id}/download/tsv" if generated_tsv else "",
        },
        "log_tail": log_tail(job_id),
    }


@app.get("/api/jobs/{job_id}/video")
def job_video(job_id: str) -> FileResponse:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    path = Path(job["video_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Video not found.")
    return FileResponse(path, filename=path.name)


@app.get("/api/jobs/{job_id}/download/{kind}")
def download_output(job_id: str, kind: str) -> FileResponse:
    if kind not in {"srt", "vtt", "json", "txt", "tsv"}:
        raise HTTPException(status_code=404, detail="Unknown file type.")
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    path = find_output(job, kind)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Output not found.")
    return FileResponse(path, filename=path.name)
