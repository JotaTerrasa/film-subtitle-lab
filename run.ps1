$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
New-Item -ItemType Directory -Force -Path "$Root\data\jobs", "$Root\data\models" | Out-Null
cd $Root

if (-not $env:ELEVENLABS_API_KEY) {
  $env:ELEVENLABS_API_KEY = [System.Environment]::GetEnvironmentVariable("ELEVENLABS_API_KEY", "User")
}

if (-not $env:ELEVENLABS_API_KEY) {
  Write-Warning "ELEVENLABS_API_KEY is not set. ElevenLabs STT/TTS will fail until you set it in the environment."
}

docker build -t film-subtitle-lab:cuda128 .
docker run --rm --gpus all --shm-size 8g `
  -p 7860:7860 `
  -v "${Root}\data\jobs:/data/jobs" `
  -v "${Root}\data\models:/models" `
  -e "HF_HOME=/models/huggingface" `
  -e "TORCH_HOME=/models/torch" `
  -e "XDG_CACHE_HOME=/models" `
  -e ELEVENLABS_API_KEY `
  -e ELEVENLABS_STT_MODEL `
  -e ELEVENLABS_TTS_MODEL `
  -e ELEVENLABS_TTS_VOICE_ID `
  film-subtitle-lab:cuda128
