# PowerShell script to create .env file for Jitsi Docker setup
# Run this script from the jitsi directory

$envContent = @"
# ===== BASIC CONFIGURATION =====
CONFIG=C:/Users/prati/Desktop/VCApp/jitsi/config
PUBLIC_URL=http://localhost:8088
HTTP_PORT=8088
HTTPS_PORT=8443
DISABLE_HTTPS=1
ENABLE_LETSENCRYPT=0
ENABLE_HTTP_REDIRECT=0

# ===== TIMEZONE =====
TZ=Asia/Kolkata

# ===== IMAGE VERSION (use stable, not unstable) =====
JITSI_IMAGE_VERSION=stable

# ===== JVB PORT MAPPING (avoid 8080 conflict) =====
JVB_COLIBRI_PORT=8080
JVB_PORT=10000

# ===== DISABLE WEBSOCKET (use BOSH instead for better compatibility) =====
ENABLE_XMPP_WEBSOCKET=0
ENABLE_COLIBRI_WEBSOCKET=0

# ===== PASSWORDS (REQUIRED - Generate random strings) =====
# These MUST be non-empty random strings
JICOFO_AUTH_PASSWORD=changeMeJicofoAuth123
JVB_AUTH_PASSWORD=changeMeJvbAuth123
JICOFO_COMPONENT_SECRET=changeMeJicofoComp123
JIGASI_XMPP_PASSWORD=changeMeJigasi123
JIGASI_TRANSCRIBER_PASSWORD=changeMeTranscriber123
JIBRI_RECORDER_PASSWORD=changeMeRecorder123
JIBRI_XMPP_PASSWORD=changeMeJibri123

# ===== RESTART POLICY =====
RESTART_POLICY=unless-stopped

# ===== OPTIONAL: Disable features we don't need =====
ENABLE_AUTH=0
ENABLE_GUESTS=1
ENABLE_RECORDING=0
"@

# Create .env file
$envContent | Out-File -FilePath ".env" -Encoding utf8 -NoNewline

Write-Host "Created .env file successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: If this is a new setup, you should:" -ForegroundColor Yellow
Write-Host "1. Review the .env file and update CONFIG path if needed"
Write-Host "2. Generate strong random passwords (especially for production)"
Write-Host "3. Run: docker compose pull"
Write-Host "4. Run: docker compose up -d"
Write-Host ""
Write-Host "To generate random passwords, you can use:" -ForegroundColor Cyan
Write-Host "  [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((New-Guid).ToString()))"

