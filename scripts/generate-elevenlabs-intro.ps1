param(
  [string]$VoiceId = $env:ELEVENLABS_VOICE_ID,
  [string]$ApiKey = $env:ELEVENLABS_API_KEY
)

if (-not $ApiKey) {
  throw "ELEVENLABS_API_KEY is required."
}

if (-not $VoiceId) {
  throw "ELEVENLABS_VOICE_ID is required. Choose a high-energy Japanese-capable announcer voice in ElevenLabs."
}

$ErrorActionPreference = "Stop"
$outDir = Join-Path $PSScriptRoot "..\assets\audio"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$lines = @(
  @{ file = "intro-kebyou.mp3"; text = "仮病だ！" },
  @{ file = "intro-taionkei.mp3"; text = "体温計を！" },
  @{ file = "intro-kosure.mp3"; text = "こすれえええ！" },
  @{ file = "intro-start.mp3"; text = "スタート！" }
)

foreach ($line in $lines) {
  $body = @{
    text = $line.text
    model_id = "eleven_multilingual_v2"
    voice_settings = @{
      stability = 0.28
      similarity_boost = 0.82
      style = 0.92
      use_speaker_boost = $true
    }
  } | ConvertTo-Json -Depth 5

  $uri = "https://api.elevenlabs.io/v1/text-to-speech/$VoiceId"
  $target = Join-Path $outDir $line.file

  Invoke-WebRequest `
    -Uri $uri `
    -Method Post `
    -Headers @{
      "xi-api-key" = $ApiKey
      "Accept" = "audio/mpeg"
      "Content-Type" = "application/json"
    } `
    -Body $body `
    -OutFile $target
}
