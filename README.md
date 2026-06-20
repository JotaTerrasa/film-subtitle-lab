# Film Subtitle Lab

GPU-accelerated web app for repairing broken subtitle timing with WhisperX or ElevenLabs word timestamps.

Film Subtitle Lab takes a media file plus an optional broken `.srt`/`.vtt`, transcribes the audio, uses the word-level timeline as a timing source, and produces a new repaired subtitle file that preserves the original subtitle text whenever possible. The UI makes the repair visible with a waveform, timing lanes, cue-by-cue shift badges, and word-level timestamps.

The app is designed for a Windows workstation with an NVIDIA RTX GPU, Docker Desktop, and CUDA-enabled containers. It provides a local browser UI, a FastAPI backend, persistent model/job storage, and an optional Cloudflare Quick Tunnel so the UI can be used remotely from another machine.

## Features

- Drag-and-drop media upload for video or audio files.
- Optional broken subtitle upload in `.srt` or `.vtt` format.
- Selectable STT provider: local WhisperX on the workstation GPU or ElevenLabs hosted STT.
- WhisperX transcription inside a CUDA 12.8 Docker image.
- ElevenLabs Scribe transcription through the Speech to Text API.
- One-click hackathon presenter voiceover using ElevenLabs Text to Speech.
- Configurable language, Whisper model, batch size, and compute type.
- Raw STT downloads in SRT, VTT, JSON, TXT, and TSV formats.
- Repaired subtitle downloads in `NEW SRT`, `NEW VTT`, and `NEW TSV` formats when a broken subtitle is uploaded.
- Side-by-side review of the new repaired subtitle against the broken original.
- Word-level timestamp table for both WhisperX and ElevenLabs jobs.
- Embedded media player with synchronized subtitle overlay.
- Human-readable live progress stages during upload, transcription, alignment, and export.
- Automatic broken-subtitle alignment using offset and timing scale estimation.
- Word-level subtitle repair: when an original subtitle file is uploaded, the app can preserve its text and replace its timings from the STT word timeline.
- Visual waveform timeline showing new repaired cues, broken original cues, and cue-to-cue shifts.
- Manual broken-original offset controls for review and diagnosis without retranscribing.
- Persistent job/model folders mounted from the host.
- Optional Cloudflare tunnel for remote access.

## Requirements

- Windows 10 or Windows 11.
- Docker Desktop with Linux containers enabled.
- NVIDIA GPU with recent drivers.
- NVIDIA Container Toolkit support through Docker Desktop.
- PowerShell.
- `winget` if you want `run-with-tunnel.ps1` to install `cloudflared` automatically.
- An ElevenLabs API key if you want to use the ElevenLabs provider.
- Enough disk space for CUDA, PyTorch, WhisperX, model weights, and job artifacts. The Docker image can be tens of GB.

Verify Docker GPU access before running the app:

```powershell
docker run --rm --gpus all nvidia/cuda:12.8.1-base-ubuntu22.04 nvidia-smi
```

You should see your NVIDIA GPU listed in the output.

## Project Layout

```text
.
|-- app/
|   |-- main.py                # FastAPI backend and job orchestration
|   `-- static/
|       |-- index.html          # Browser UI
|       |-- app.js              # Upload, polling, review, offset controls
|       `-- styles.css          # UI styling
|-- data/
|   |-- jobs/                   # Uploads, repaired subtitles, raw STT output, job metadata
|   `-- models/                 # Hugging Face, Torch, and WhisperX model caches
|-- Dockerfile                  # CUDA 12.8 + PyTorch + WhisperX image
|-- docker-compose.yml          # Compose definition for local GPU runtime
|-- run.ps1                     # Local-only runner
`-- run-with-tunnel.ps1         # Local runner plus Cloudflare Quick Tunnel
```

`data/` is intentionally ignored by Git. It may contain uploads, repaired subtitles, raw STT output, downloaded model weights, logs, and local runtime files.

## Quick Start On Windows

Clone the repository:

```powershell
git clone https://github.com/JotaTerrasa/film-subtitle-lab.git C:\stt-subtitles-web
cd C:\stt-subtitles-web
```

If you are installing from the original zip instead:

```powershell
$Zip = "$env:USERPROFILE\Downloads\stt-compare-web-4090.zip"
$Dest = "C:\stt-subtitles-web"

Remove-Item $Dest -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Expand-Archive $Zip -DestinationPath $Dest -Force

if (Test-Path "$Dest\stt-compare-web-4090") {
  Move-Item "$Dest\stt-compare-web-4090\*" $Dest -Force
  Remove-Item "$Dest\stt-compare-web-4090" -Recurse -Force
}

cd $Dest
```

Confirm the expected files exist:

```powershell
Test-Path .\Dockerfile
Test-Path .\app\main.py
Test-Path .\app\static\index.html
Test-Path .\app\static\app.js
Test-Path .\run-with-tunnel.ps1
```

If PowerShell blocks local scripts in your current session:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
```

Run locally:

```powershell
cd C:\stt-subtitles-web
.\run.ps1
```

Open:

```text
http://localhost:7860
```

The first build and first transcription can take a while because Docker layers, PyTorch wheels, WhisperX dependencies, and model weights must be downloaded.

## Remote Access With Cloudflare Tunnel

Use this when the RTX workstation and the client computer are not on the same network.

```powershell
cd C:\stt-subtitles-web
Set-ExecutionPolicy -Scope Process Bypass -Force
.\run-with-tunnel.ps1
```

The script will:

1. Build the Docker image if needed.
2. Start the app container on `localhost:7860`.
3. Install `cloudflared` with `winget` if it is not available.
4. Start a Cloudflare Quick Tunnel.
5. Print a public `https://*.trycloudflare.com` URL.

Keep the PowerShell process open while using the app. Closing it stops the tunnel.

By default, the tunnel script does not enable Basic Auth. Treat the printed URL as public while the tunnel is running.

## Using The App

1. Open the local or tunneled URL in a browser.
2. Use `Explain project` if you want the app to narrate a short hackathon pitch with ElevenLabs TTS.
3. Drop a video/audio file into the upload area.
4. Optionally drop an existing broken `.srt` or `.vtt` file to repair.
5. Select the STT provider.
6. Select language, model, batch size, and compute type. Model, batch, and compute apply to local WhisperX.
7. Click the transcription button.
8. Wait for upload and transcription to finish.
9. Review the new repaired subtitle beside the broken original in the repair comparison view.
10. Inspect word-level timestamps and click a word row to jump the player to that point.
11. If you uploaded an existing subtitle file, download the `NEW_*` files to keep the original text with corrected timings.
12. Download the raw STT files if you also want the unmerged transcript output.

## STT Providers

### Local WhisperX

Local WhisperX runs inside the CUDA Docker container and uses the workstation GPU.

Use this when:

- You want local processing.
- You want to avoid external STT API costs.
- You have a powerful NVIDIA GPU available.

The local provider uses the UI's Whisper model, batch size, and compute type controls.

For English jobs, the backend also applies an accuracy-oriented WhisperX profile by default:

- `large-v3`, English, `float16`, batch `8`.
- Local audio is first extracted to mono 16 kHz WAV and level-normalized for cleaner speech recognition.
- Deterministic decoding with temperature `0`.
- Beam search increased to `10` with patience `2.0`.
- Previous-text conditioning disabled to reduce repeated or hallucinated phrases.
- Sensitive VAD settings for quiet film dialogue.
- Higher no-speech threshold and no random fallback sampling to reduce strange text in silence.
- Linear interpolation for more stable subtitle timing.

### ElevenLabs

The ElevenLabs provider uploads the media file from the backend container to the ElevenLabs Speech to Text API and converts the response into the same SRT, VTT, JSON, TXT, TSV, and frontend word timestamp views used by the local provider.

When `ElevenLabs API` is selected, the UI switches away from local WhisperX controls and shows ElevenLabs-specific options:

- Scribe model: `scribe_v2` or `scribe_v1`.
- Timestamp granularity: `word` or `character`.
- Speaker diarization and optional speaker count.
- Audio event tagging.
- Clean filler mode through `no_verbatim`.
- Temperature and seed.
- Optional keyterms for names, places, and technical vocabulary.

`Clean filler` maps to ElevenLabs `no_verbatim` and is only sent when `scribe_v2` is selected.

The default ElevenLabs preset is `scribe_v2`, word timestamps, diarization on, audio events off, clean filler on, temperature `0`, and seed `42`.

Before starting the app, set your API key in the PowerShell session:

```powershell
$env:ELEVENLABS_API_KEY = "your-api-key"
```

Optional model override:

```powershell
$env:ELEVENLABS_STT_MODEL = "scribe_v2"
```

Then start either runner:

```powershell
.\run.ps1
```

or:

```powershell
.\run-with-tunnel.ps1
```

Never commit your API key. `.env` files and runtime data are ignored by Git.

### Supported Inputs

- Video files accepted by the browser and FFmpeg.
- Audio files accepted by the browser and FFmpeg.
- Reference subtitle files in `.srt` or `.vtt` format.

### Main Options

- `Language`: `en`, `es`, `auto`, `fr`, `de`, `it`.
- `Model`: `large-v3`, `large-v2`, `medium`.
- `Batch`: default `16`; lower this if you hit GPU memory issues.
- `Compute`: default `float16`; use `int8` for lower memory usage, or `float32` if needed for debugging.

## Outputs

Each job is stored under:

```text
C:\stt-subtitles-web\data\jobs\<job_id>\
```

Typical files:

```text
uploads/                 # Original media and optional broken subtitle
output/*.srt             # Raw STT SRT
output/*.vtt             # Raw STT VTT
output/*.json            # Provider JSON with timing metadata
output/*.txt             # Plain text transcript
output/*.tsv             # Raw STT segment table
output/*.reference-resynced.srt  # New repaired subtitle preserving uploaded text
output/*.reference-resynced.vtt  # New repaired VTT
output/*.reference-resynced.tsv  # New repaired timing table
job.json                 # Job metadata
job.log                  # Provider command/API output
```

Model caches are stored under:

```text
C:\stt-subtitles-web\data\models\
```

This avoids re-downloading model weights on every container run.

## API Overview

The web UI uses these backend endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Serve the web UI |
| `POST` | `/api/jobs` | Upload media/broken subtitle files and enqueue transcription |
| `GET` | `/api/jobs/{job_id}/status` | Poll job status and log tail |
| `GET` | `/api/jobs/{job_id}/result` | Fetch cues, alignment, downloads, and review metadata |
| `GET` | `/api/jobs/{job_id}/video` | Stream the uploaded media file |
| `GET` | `/api/jobs/{job_id}/download/{kind}` | Download raw STT `srt`, `vtt`, `json`, `txt`, or `tsv` output |
| `GET` | `/api/jobs/{job_id}/download-reference/{kind}` | Download repaired subtitle `srt`, `vtt`, or `tsv` output |

When `APP_PASSWORD` is set, all endpoints are protected with HTTP Basic Auth.

## Docker Commands

Build manually:

```powershell
cd C:\stt-subtitles-web
docker build -t film-subtitle-lab:cuda128 .
```

Run manually:

```powershell
docker run --rm --gpus all --shm-size 8g `
  -p 7860:7860 `
  -v "C:\stt-subtitles-web\data\jobs:/data/jobs" `
  -v "C:\stt-subtitles-web\data\models:/models" `
  -e "HF_HOME=/models/huggingface" `
  -e "TORCH_HOME=/models/torch" `
  -e "XDG_CACHE_HOME=/models" `
  -e ELEVENLABS_API_KEY `
  -e ELEVENLABS_STT_MODEL `
  -e ELEVENLABS_TTS_MODEL `
  -e ELEVENLABS_TTS_VOICE_ID `
  film-subtitle-lab:cuda128
```

Run with Docker Compose:

```powershell
cd C:\stt-subtitles-web
docker compose up --build
```

## Configuration

Important environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `DATA_DIR` | `/data/jobs` | Job metadata, uploads, logs, and generated files inside the container |
| `MODEL_DIR` | `/models` | Model cache root inside the container |
| `HF_HOME` | `/models/huggingface` | Hugging Face cache |
| `TORCH_HOME` | `/models/torch` | Torch cache |
| `XDG_CACHE_HOME` | `/models` | General model/tool cache |
| `APP_USER` | `jaime` | Basic Auth username when password auth is enabled |
| `APP_PASSWORD` | empty | Basic Auth password; if empty, auth is disabled |
| `ELEVENLABS_API_KEY` | empty | Required only when using the ElevenLabs STT provider |
| `ELEVENLABS_STT_MODEL` | `scribe_v2` | ElevenLabs STT model ID |
| `ELEVENLABS_TTS_MODEL` | `eleven_multilingual_v2` | ElevenLabs TTS model used by the hackathon pitch button |
| `ELEVENLABS_TTS_VOICE_ID` | `21m00Tcm4TlvDq8ikWAM` | ElevenLabs voice ID used by the hackathon pitch button |

## Troubleshooting

### PowerShell Blocks The Script

Run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
```

This only changes the policy for the current PowerShell process.

### Docker Cannot See The GPU

Verify:

```powershell
docker run --rm --gpus all nvidia/cuda:12.8.1-base-ubuntu22.04 nvidia-smi
```

If this fails, fix Docker Desktop GPU support or NVIDIA drivers before debugging the app.

### Port 7860 Is Already In Use

Find the process:

```powershell
netstat -ano | findstr :7860
```

Stop the conflicting process or change the `-p 7860:7860` mapping in the run script.

### Cloudflared Is Missing

`run-with-tunnel.ps1` tries to install it with:

```powershell
winget install -e --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
```

If `winget` cannot install it, install `cloudflared` manually from Cloudflare's releases and make sure `cloudflared.exe` is on `PATH`.

### Container Started But The App Does Not Load

Check the container:

```powershell
docker ps --filter name=film-subtitle-lab
docker logs --tail 100 film-subtitle-lab
```

Check the local endpoint:

```powershell
Invoke-WebRequest http://localhost:7860 -UseBasicParsing
```

If you are using the tunnel script, no browser login is required by default.

### GPU Memory Errors

Try:

- Lower `Batch` from `16` to `8`, `4`, or `2`.
- Use `int8` compute type.
- Close other GPU-heavy apps.
- Use a smaller model such as `medium`.

### First Transcription Is Slow

This is expected. The first run may download WhisperX/faster-whisper model weights into `data\models`. Later runs should reuse the local cache.

### ElevenLabs Job Fails Immediately

Make sure the API key exists in the PowerShell session before starting the container:

```powershell
$env:ELEVENLABS_API_KEY
```

If it prints nothing, set the key and restart the runner.

## Security Notes

- Cloudflare Quick Tunnels are convenient for personal/temporary access, not production hosting.
- Keep the tunnel process open only while you need the app.
- Do not commit `data/`, model caches, uploads, job logs, repaired subtitles, or raw STT outputs.
- Do not commit `ELEVENLABS_API_KEY`, `.env`, or any other local secret.
- Anyone with the public tunnel URL can access the app while the tunnel is running.
- The ElevenLabs provider sends uploaded media to ElevenLabs for transcription.

## Hackathon Credits

Film Subtitle Lab was built during the Forja hackathon organized by Marcos Valera with Sergio Sillero.

Core hackathon team:

- Jaime Terrasa
- [Nikola Rahman](https://www.linkedin.com/in/ACoAAA5hW94BYWZv8nlBGCuQ85Hm9L_lqLjmScY)
- [Juan Alberto Raya](https://www.linkedin.com/in/juan-alberto-raya/)

## Development Notes

The backend runs one transcription job at a time:

```python
ThreadPoolExecutor(max_workers=1)
```

This avoids saturating the GPU with concurrent WhisperX jobs. Increase with care only after testing GPU memory behavior.

The subtitle repair flow is:

1. Parse raw STT cues and the uploaded broken subtitle cues.
2. Extract word-level timestamps from WhisperX or ElevenLabs.
3. Match the broken subtitle text against the word timeline.
4. Preserve the uploaded subtitle text where possible.
5. Replace broken cue timings with repaired word-derived timings.
6. Return both the new repaired cues and the broken original cues for visual review.
7. Export raw STT files plus repaired `NEW_*` subtitle files.

## Cleanup

Remove old jobs:

```powershell
Remove-Item C:\stt-subtitles-web\data\jobs\* -Recurse -Force
```

Remove model caches:

```powershell
Remove-Item C:\stt-subtitles-web\data\models\* -Recurse -Force
```

Remove the Docker image:

```powershell
docker rmi film-subtitle-lab:cuda128
```
