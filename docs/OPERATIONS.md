# Operations Guide

This guide covers day-to-day operation on the Windows GPU workstation.

## Start Local App

```powershell
cd C:\stt-subtitles-web
Set-ExecutionPolicy -Scope Process Bypass -Force
.\run.ps1
```

Open:

```text
http://localhost:7860
```

Stop with `Ctrl+C`.

## Enable ElevenLabs STT

Set the API key in the same PowerShell session before starting the runner:

```powershell
$env:ELEVENLABS_API_KEY = "your-api-key"
```

Optional model override:

```powershell
$env:ELEVENLABS_STT_MODEL = "scribe_v2"
```

Then start `run.ps1` or `run-with-tunnel.ps1` normally and select `ElevenLabs API` in the browser UI.

Do not write the API key into tracked files.

## Start Public Tunnel

```powershell
cd C:\stt-subtitles-web
Set-ExecutionPolicy -Scope Process Bypass -Force
.\run-with-tunnel.ps1
```

Copy the printed:

- `https://*.trycloudflare.com` URL.

No browser login is required by default. Keep the PowerShell process running. Stop with `Ctrl+C` only when remote access is no longer needed.

## Check Running Processes

Container:

```powershell
docker ps --filter name=film-subtitle-lab
```

Container logs:

```powershell
docker logs --tail 100 film-subtitle-lab
```

Cloudflared process:

```powershell
Get-Process cloudflared -ErrorAction SilentlyContinue
```

PowerShell runner:

```powershell
Get-CimInstance Win32_Process -Filter "name = 'powershell.exe'" |
  Where-Object { $_.CommandLine -like '*run-with-tunnel.ps1*' } |
  Select-Object ProcessId,CommandLine
```

## Verify Local Health

```powershell
Invoke-WebRequest http://localhost:7860 -UseBasicParsing
```

## Rebuild Image

```powershell
cd C:\stt-subtitles-web
docker build --no-cache -t film-subtitle-lab:cuda128 .
```

## Clean Jobs

```powershell
Remove-Item C:\stt-subtitles-web\data\jobs\* -Recurse -Force
```

## Clean Model Cache

Only do this if you intentionally want WhisperX/model files to be downloaded again.

```powershell
Remove-Item C:\stt-subtitles-web\data\models\* -Recurse -Force
```

## Common Failures

### Docker build is slow

Expected on the first run. CUDA, PyTorch, WhisperX, and model dependencies are large.

### `No such container: film-subtitle-lab`

The tunnel script handles this by only removing an existing container when one is present. If you see this error on an older script, update `run-with-tunnel.ps1`.

### `cloudflared` installed but not found

Open a new PowerShell window so `PATH` is refreshed, or call the full `cloudflared.exe` path returned by `winget`.

### ElevenLabs provider says the API key is missing

The key must be present before the container starts:

```powershell
$env:ELEVENLABS_API_KEY
```

If it is empty, set it and restart the runner.

### Upload works but transcription fails

Inspect the job log in:

```text
C:\stt-subtitles-web\data\jobs\<job_id>\job.log
```

Then check container logs:

```powershell
docker logs --tail 200 film-subtitle-lab
```

Most failures are caused by unsupported media files, insufficient GPU memory, interrupted model downloads, or Docker GPU access problems.
