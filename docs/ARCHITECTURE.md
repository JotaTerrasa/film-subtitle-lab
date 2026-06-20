# Architecture

Film Subtitle Lab is a small single-machine web app. It assumes a trusted operator running Docker on a GPU workstation and one or more browser clients connecting locally or through a temporary Cloudflare tunnel.

## Components

```text
Browser
  |
  | HTTP
  v
FastAPI app
  |
  | selected STT provider
  v
WhisperX CLI or ElevenLabs Speech to Text API
  |
  | CUDA for WhisperX, HTTPS for ElevenLabs
  v
NVIDIA GPU or hosted STT
```

The browser UI is static HTML, CSS, and JavaScript served by FastAPI. The backend accepts uploads, creates job folders, runs WhisperX, stores metadata, and exposes generated artifacts.

## Backend

`app/main.py` owns:

- Basic Auth middleware.
- Upload handling.
- Job metadata persistence.
- WhisperX command construction.
- ElevenLabs Speech to Text request construction.
- Log capture.
- Human-readable job stage reporting for the browser progress UI.
- Subtitle parsing.
- Reference subtitle alignment.
- Download and media streaming endpoints.

Jobs are stored in memory while the app is running and persisted to `job.json` so completed jobs can be loaded again after a restart. Jobs that were still running when the container stopped are marked as interrupted on the next startup.

## Job Execution

The backend uses a single worker:

```python
ThreadPoolExecutor(max_workers=1)
```

This is deliberate. WhisperX can consume a large amount of GPU memory, especially with `large-v3` and higher batch sizes. Running one job at a time keeps resource usage predictable on a workstation.

## Storage

Host folders are mounted into the container:

```text
host data/jobs   -> container /data/jobs
host data/models -> container /models
```

`/data/jobs` contains uploads, job metadata, logs, raw STT outputs, and repaired subtitle files.

`/models` contains Hugging Face, Torch, and WhisperX caches. Keeping this on the host avoids repeated downloads.

## Transcription Flow

1. The browser uploads media and an optional broken subtitle file.
2. FastAPI creates a job folder and writes `job.json`.
3. A background worker runs either the `whisperx` CLI or the ElevenLabs API request.
4. Transcription progress and provider output are appended to `job.log`.
5. A high-level stage is updated for the browser, such as voice detection, transcription, alignment, hosted API processing, or subtitle export.
6. When transcription succeeds, output paths are stored in job metadata.
7. The browser fetches `/api/jobs/{job_id}/result`.
8. Raw STT cues, repaired cues, and broken original cues are parsed and returned with alignment metadata.
9. Provider-specific word timestamp shapes are normalized into `word_timestamps` for the browser UI.
10. When word-level repair is available, the UI compares the new repaired subtitle against the broken original cue by cue.

## Provider Behavior

Local WhisperX:

- Runs in the Docker container.
- Uses CUDA and the workstation GPU.
- Extracts local media to normalized mono 16 kHz WAV before transcription.
- Produces WhisperX native outputs directly.
- Exposes word timings from `word_segments` or `segments[].words`.
- Applies an English quality profile with deterministic decoding, larger beam search, disabled previous-text conditioning, sensitive VAD, stricter no-speech handling, and linear interpolation when `language=en`.

ElevenLabs:

- Requires `ELEVENLABS_API_KEY` in the container environment.
- Sends the uploaded media file to `https://api.elevenlabs.io/v1/speech-to-text`.
- Uses the UI-selected Scribe model, timestamp granularity, diarization, speaker count, audio event, no-verbatim, temperature, seed, and keyterm options.
- Defaults to `scribe_v2`, word timestamps, diarization on, clean filler on, temperature `0`, and seed `42`.
- Converts the returned word timestamps into local SRT, VTT, JSON, TXT, and TSV outputs.
- Exposes returned word timings through the same frontend table as WhisperX.

## Repair Flow

The repair pipeline uses the STT output as a timing source and the uploaded subtitle as the text source:

1. Parse raw STT cues and uploaded broken subtitle cues.
2. Extract word-level timestamps from WhisperX or ElevenLabs.
3. Tokenize the broken subtitle text and align it to the STT word timeline.
4. Preserve the uploaded subtitle text whenever a cue can be aligned.
5. Replace broken cue timings with word-derived timings.
6. Export repaired `reference-resynced` SRT, VTT, and TSV files.
7. Return both the repaired cues and broken original cues for visual review.

If word-level repair is not available, the app falls back to global offset and scale estimation so the user can still compare raw STT output against the uploaded subtitle.

## Authentication

If `APP_PASSWORD` is empty, authentication is disabled.

If `APP_PASSWORD` is set, every request is protected by HTTP Basic Auth using:

```text
APP_USER
APP_PASSWORD
```

The tunnel runner does not set `APP_PASSWORD` by default, so tunneled access is open to anyone with the public URL while the tunnel is running.

## Network Modes

Local mode:

```text
Browser -> localhost:7860 -> FastAPI container
```

Tunnel mode:

```text
Remote browser -> trycloudflare.com -> cloudflared -> localhost:7860 -> FastAPI container
```

Cloudflare Quick Tunnels are temporary and account-less. They are useful for remote personal access but should not be treated as durable production infrastructure.
