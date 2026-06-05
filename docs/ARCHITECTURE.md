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

`/data/jobs` contains uploads, job metadata, logs, and generated subtitles.

`/models` contains Hugging Face, Torch, and WhisperX caches. Keeping this on the host avoids repeated downloads.

## Transcription Flow

1. The browser uploads media and an optional reference subtitle file.
2. FastAPI creates a job folder and writes `job.json`.
3. A background worker runs either the `whisperx` CLI or the ElevenLabs API request.
4. Transcription progress and provider output are appended to `job.log`.
5. When transcription succeeds, output paths are stored in job metadata.
6. The browser fetches `/api/jobs/{job_id}/result`.
7. Generated and reference cues are parsed and returned with alignment metadata.
8. Provider-specific word timestamp shapes are normalized into `word_timestamps` for the browser UI.

## Provider Behavior

Local WhisperX:

- Runs in the Docker container.
- Uses CUDA and the workstation GPU.
- Produces WhisperX native outputs directly.
- Exposes word timings from `word_segments` or `segments[].words`.
- Applies an English quality profile with deterministic decoding, larger beam search, disabled previous-text conditioning, stricter hallucination thresholds, and smaller chunks when `language=en`.

ElevenLabs:

- Requires `ELEVENLABS_API_KEY` in the container environment.
- Sends the uploaded media file to `https://api.elevenlabs.io/v1/speech-to-text`.
- Uses the UI-selected Scribe model, timestamp granularity, diarization, speaker count, audio event, no-verbatim, temperature, seed, and keyterm options.
- Converts the returned word timestamps into local SRT, VTT, JSON, TXT, and TSV outputs.
- Exposes returned word timings through the same frontend table as WhisperX.

## Alignment Flow

The alignment estimator compares generated cues against reference cues:

1. Parse SRT/VTT cues into start, end, and text.
2. Strip subtitle markup.
3. Normalize text for approximate matching.
4. Score cue pairs with word overlap and `SequenceMatcher`.
5. Estimate median offset from matched cue timestamps.
6. Estimate timing scale when enough matches are available.

The browser applies the returned offset and scale to the reference subtitles. The operator can then adjust the reference offset manually without starting a new transcription job.

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
