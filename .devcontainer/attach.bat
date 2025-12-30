@echo off
REM Attach to the persistent container
cd /d "%~dp0"

REM Check if running
docker ps --format "{{.Names}}" | findstr /C:"builder-block-persistent" >nul 2>&1
if %errorlevel% neq 0 (
    echo Container not running. Starting it first...
    call start.bat
)

echo Attaching to builder-block-persistent...
echo Tip: Use 'tmux' for persistent sessions inside the container
echo.

docker exec -it builder-block-persistent bash
