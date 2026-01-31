# PowerShell script to verify Jitsi Docker setup
# Run this script from the jitsi directory

Write-Host "=== Jitsi Docker Setup Verification ===" -ForegroundColor Cyan
Write-Host ""

# Check Docker
Write-Host "1. Checking Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version
    Write-Host "   [OK] Docker installed: $dockerVersion" -ForegroundColor Green
    
    $dockerPs = docker ps 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   [OK] Docker daemon is running" -ForegroundColor Green
    } else {
        Write-Host "   [ERROR] Docker daemon is NOT running!" -ForegroundColor Red
        Write-Host "     Please start Docker Desktop" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   [ERROR] Docker is not installed or not in PATH!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Check .env file
Write-Host "2. Checking .env file..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-Host "   [OK] .env file exists" -ForegroundColor Green
    
    $envContent = Get-Content ".env" -Raw
    $requiredVars = @(
        "PUBLIC_URL",
        "HTTP_PORT",
        "JVB_AUTH_PASSWORD",
        "JICOFO_AUTH_PASSWORD",
        "JITSI_IMAGE_VERSION"
    )
    
    $missing = @()
    foreach ($var in $requiredVars) {
        if ($envContent -notmatch "$var=") {
            $missing += $var
        }
    }
    
    if ($missing.Count -eq 0) {
        Write-Host "   [OK] Required variables found" -ForegroundColor Green
        
        # Check specific values
        if ($envContent -match "PUBLIC_URL=http://localhost:8088") {
            Write-Host "   [OK] PUBLIC_URL is set correctly" -ForegroundColor Green
        } else {
            Write-Host "   [WARNING] PUBLIC_URL might not be set correctly" -ForegroundColor Yellow
        }
        
        if ($envContent -match "ENABLE_XMPP_WEBSOCKET=0") {
            Write-Host "   [OK] WebSocket is disabled (using BOSH)" -ForegroundColor Green
        } else {
            Write-Host "   [WARNING] WebSocket might be enabled (may cause issues)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   [ERROR] Missing required variables: $($missing -join ', ')" -ForegroundColor Red
    }
} else {
    Write-Host "   [ERROR] .env file does not exist!" -ForegroundColor Red
    Write-Host "     Run create-env.ps1 to create it" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Check config directory
Write-Host "3. Checking config directory..." -ForegroundColor Yellow
if (Test-Path "config") {
    Write-Host "   [OK] config directory exists" -ForegroundColor Green
} else {
    Write-Host "   [WARNING] config directory does not exist (will be created by Docker)" -ForegroundColor Yellow
}
Write-Host ""

# Check docker-compose.override.yml
Write-Host "4. Checking docker-compose.override.yml..." -ForegroundColor Yellow
if (Test-Path "docker-compose.override.yml") {
    Write-Host "   [OK] docker-compose.override.yml exists" -ForegroundColor Green
    
    $overrideContent = Get-Content "docker-compose.override.yml" -Raw
    if ($overrideContent -match "9090:8080") {
        Write-Host "   [OK] JVB port mapping is configured (9090:8080)" -ForegroundColor Green
    }
} else {
    Write-Host "   [WARNING] docker-compose.override.yml does not exist" -ForegroundColor Yellow
    Write-Host "     Creating it now..." -ForegroundColor Yellow
    @"
services:
  jvb:
    ports:
      - "9090:8080"
"@ | Out-File -FilePath "docker-compose.override.yml" -Encoding utf8
    Write-Host "     [OK] Created docker-compose.override.yml" -ForegroundColor Green
}
Write-Host ""

# Check ports
Write-Host "5. Checking if ports are available..." -ForegroundColor Yellow
$ports = @(8088, 8443, 10000, 9090, 8888)
$portsInUse = @()

foreach ($port in $ports) {
    $result = netstat -ano | Select-String ":$port "
    if ($result) {
        $portsInUse += $port
        Write-Host "   [ERROR] Port $port is in use!" -ForegroundColor Red
        Write-Host "     Process: $($result -join ', ')" -ForegroundColor Red
    } else {
        Write-Host "   [OK] Port $port is available" -ForegroundColor Green
    }
}

if ($portsInUse.Count -gt 0) {
    Write-Host ""
    Write-Host "   WARNING: Some ports are in use!" -ForegroundColor Red
    Write-Host "   You may need to:" -ForegroundColor Yellow
    Write-Host "   - Stop services using these ports" -ForegroundColor Yellow
    Write-Host "   - Or change HTTP_PORT in .env to a different port" -ForegroundColor Yellow
} else {
    Write-Host "   [OK] All required ports are available" -ForegroundColor Green
}
Write-Host ""

# Check Docker images
Write-Host "6. Checking Docker images..." -ForegroundColor Yellow
$requiredImages = @(
    "jitsi/web",
    "jitsi/prosody",
    "jitsi/jicofo",
    "jitsi/jvb"
)

$images = docker images --format "{{.Repository}}:{{.Tag}}"
$missingImages = @()

foreach ($img in $requiredImages) {
    if ($images -match $img) {
        $matching = $images | Select-String $img
        Write-Host "   [OK] $img image found: $($matching -split "`n" | Select-Object -First 1)" -ForegroundColor Green
    } else {
        $missingImages += $img
        Write-Host "   [WARNING] $img image not found (will be pulled)" -ForegroundColor Yellow
    }
}

if ($missingImages.Count -gt 0) {
    Write-Host ""
    Write-Host "   To pull missing images, run:" -ForegroundColor Cyan
    Write-Host "   docker compose pull" -ForegroundColor Cyan
}
Write-Host ""

# Check running containers
Write-Host "7. Checking running containers..." -ForegroundColor Yellow
$containers = docker ps --format "{{.Names}}"
$jitsiContainers = $containers | Select-String "jitsi"

if ($jitsiContainers) {
    Write-Host "   [OK] Jitsi containers are running:" -ForegroundColor Green
    $jitsiContainers | ForEach-Object { Write-Host "     - $_" -ForegroundColor Green }
    
    # Check container health
    $webContainer = docker ps --filter "name=jitsi-web" --format "{{.Status}}"
    if ($webContainer) {
        Write-Host "   Web container status: $webContainer" -ForegroundColor Cyan
    }
} else {
    Write-Host "   [WARNING] No Jitsi containers are running" -ForegroundColor Yellow
    Write-Host "     To start containers, run:" -ForegroundColor Cyan
    Write-Host "     docker compose up -d" -ForegroundColor Cyan
}
Write-Host ""

# Summary
Write-Host "=== Verification Summary ===" -ForegroundColor Cyan
if ($portsInUse.Count -eq 0 -and $missingImages.Count -eq 0) {
    Write-Host "[OK] Setup looks good! You can proceed with:" -ForegroundColor Green
    Write-Host "  docker compose pull" -ForegroundColor Cyan
    Write-Host "  docker compose up -d" -ForegroundColor Cyan
} else {
    Write-Host "[WARNING] Please fix the issues above before proceeding" -ForegroundColor Yellow
}
