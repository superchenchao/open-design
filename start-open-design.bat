@echo off
setlocal

cd /d "%~dp0"

echo Starting Open Design...
pnpm tools-dev start web --daemon-port 17456 --web-port 17573

if errorlevel 1 (
  echo.
  echo Open Design failed to start. Check the error above.
  pause
  exit /b 1
)

echo.
echo Open Design is running at http://127.0.0.1:17573
start "" "http://127.0.0.1:17573"

endlocal
