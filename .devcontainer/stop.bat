@echo off
REM Stop the persistent container
cd /d "%~dp0"

echo Stopping builder-block-persistent...
docker stop builder-block-persistent 2>nul

echo.
echo Container stopped. Data preserved in volumes.
echo Use start.bat to restart
