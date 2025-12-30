@echo off
REM Option 2: Run container with interactive terminal popup
REM This starts a fresh container and opens a bash terminal immediately

cd /d "%~dp0"

echo Starting builder-block container with interactive terminal...
echo.

docker-compose --profile terminal run --rm claude-terminal
