$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ContainerName = "film-subtitle-lab"
$ImageName = "film-subtitle-lab:cuda128"

New-Item -ItemType Directory -Force -Path "$Root\data\jobs", "$Root\data\models" | Out-Null

cd $Root

if (-not $env:ELEVENLABS_API_KEY) {
  $env:ELEVENLABS_API_KEY = [System.Environment]::GetEnvironmentVariable("ELEVENLABS_API_KEY", "User")
}

if (-not $env:ELEVENLABS_API_KEY) {
  Write-Warning "ELEVENLABS_API_KEY is not set. ElevenLabs STT/TTS will fail until you set it in the environment."
}

Write-Host "Building Docker image..."
docker build -t $ImageName .

Write-Host "Starting STT web app on http://localhost:7860 ..."
$ExistingContainer = docker ps -a --filter "name=^/${ContainerName}$" --format "{{.Names}}"
if ($ExistingContainer -eq $ContainerName) {
  docker rm -f $ContainerName | Out-Null
}
docker run -d --name $ContainerName --gpus all --shm-size 8g `
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
  $ImageName | Out-Null

Start-Sleep -Seconds 4

$Cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $Cloudflared) {
    Write-Host "Installing cloudflared with winget..."
    winget install -e --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    $Cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
}

if (-not $Cloudflared) {
    throw "cloudflared was installed but is not in PATH yet. Open a new PowerShell and run this script again."
}

Write-Host ""
Write-Host "Starting Cloudflare Quick Tunnel. Copy the https://*.trycloudflare.com URL and open it on your Mac."
Write-Host "Keep this PowerShell window open while using the app. Ctrl+C stops the tunnel."
Write-Host ""

& $Cloudflared.Source tunnel --url http://localhost:7860
