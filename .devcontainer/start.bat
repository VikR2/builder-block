@echo off
REM Start the persistent container
cd /d "%~dp0"

echo === Builder Block Persistent Container ===
echo.

REM Check if running
docker ps --format "{{.Names}}" | findstr /C:"builder-block-persistent" >nul 2>&1
if %errorlevel% equ 0 (
    echo Container already running. Use attach.bat to connect.
    exit /b 0
)

REM Check if exists but stopped
docker ps -a --format "{{.Names}}" | findstr /C:"builder-block-persistent" >nul 2>&1
if %errorlevel% equ 0 (
    echo Starting existing container...
    docker start builder-block-persistent
) else (
    echo Building and starting new container...
    docker-compose up -d --build claude-persistent

    echo.
    echo Running first-time setup...
    docker exec -it builder-block-persistent bash /workspace/.devcontainer/setup.sh
)

echo.
echo Container is running!
echo Use attach.bat to connect
echo Use stop.bat to stop
