# Quick start script for Jitsi Docker setup
# This script will verify, setup, and start Jitsi

Write-Host "=== Jitsi Docker Quick Start ===" -ForegroundColor Cyan
Write-Host ""

# Navigate to jitsi directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "Current directory: $(Get-Location)" -ForegroundColor Gray
Write-Host ""

# Step 1: Check Docker
Write-Host "Step 1: Checking Docker..." -ForegroundColor Yellow
try {
    docker ps | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Docker is running" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Docker is not running!" -ForegroundColor Red
        Write-Host "Please start Docker Desktop and try again" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[ERROR] Docker is not installed!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 2: Create .env if needed
Write-Host "Step 2: Checking .env file..." -ForegroundColor Yellow
if (!(Test-Path ".env")) {
    Write-Host "Creating .env file..." -ForegroundColor Gray
    & ".\create-env.ps1"
} else {
    Write-Host "[OK] .env file exists" -ForegroundColor Green
}
Write-Host ""

# Step 3: Verify setup
Write-Host "Step 3: Verifying setup..." -ForegroundColor Yellow
& ".\verify-setup.ps1"
Write-Host ""

# Step 4: Pull images if needed
Write-Host "Step 4: Pulling Docker images (if needed)..." -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Gray
docker compose pull
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Images pulled successfully" -ForegroundColor Green
} else {
    Write-Host "[WARNING] Some images may have failed to pull" -ForegroundColor Yellow
    Write-Host "Continuing anyway..." -ForegroundColor Gray
}
Write-Host ""

# Step 5: Start containers
Write-Host "Step 5: Starting containers..." -ForegroundColor Yellow
docker compose up -d
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Containers started" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Failed to start containers!" -ForegroundColor Red
    Write-Host "Check logs with: docker compose logs" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Step 6: Wait a bit for containers to initialize
Write-Host "Step 6: Waiting for services to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
Write-Host ""

# Step 7: Check status
Write-Host "Step 7: Checking container status..." -ForegroundColor Yellow
$containers = docker ps --filter "name=jitsi" --format "{{.Names}}\t{{.Status}}"
if ($containers) {
    Write-Host "Running containers:" -ForegroundColor Green
    $containers | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
} else {
    Write-Host "[WARNING] No containers are running!" -ForegroundColor Yellow
    Write-Host "Check logs: docker compose logs" -ForegroundColor Cyan
}
Write-Host ""

# Step 8: Test web endpoint
Write-Host "Step 8: Testing web endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8088" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "[OK] Jitsi web interface is accessible!" -ForegroundColor Green
        Write-Host "  URL: http://localhost:8088" -ForegroundColor Cyan
    }
} catch {
    Write-Host "[WARNING] Web interface not responding yet" -ForegroundColor Yellow
    Write-Host "  This is normal if containers just started" -ForegroundColor Gray
    Write-Host "  Wait 10-20 seconds and try: http://localhost:8088" -ForegroundColor Gray
}
Write-Host ""

# Summary
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Open http://localhost:8088 in your browser" -ForegroundColor Cyan
Write-Host "2. Update client/.env with: VITE_JITSI_DOMAIN=localhost:8088" -ForegroundColor Cyan
Write-Host "3. Restart your client dev server" -ForegroundColor Cyan
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Yellow
Write-Host "  docker compose logs          - View logs" -ForegroundColor Gray
Write-Host "  docker compose logs -f       - Follow logs" -ForegroundColor Gray
Write-Host "  docker compose restart       - Restart containers" -ForegroundColor Gray
Write-Host "  docker compose down          - Stop containers" -ForegroundColor Gray
Write-Host "  docker compose ps            - Check status" -ForegroundColor Gray
