@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    python -m venv .venv
    if errorlevel 1 goto failed
)
".venv\Scripts\python.exe" -c "import fastapi, uvicorn, numpy, spiceypy"
if errorlevel 1 (
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt
    if errorlevel 1 goto failed
)
".venv\Scripts\python.exe" -m backend.download_kernels
if errorlevel 1 goto failed
if not exist "frontend\dist\index.html" (
    pushd frontend
    if not exist "node_modules\vite\bin\vite.js" (
        call npm ci
        if errorlevel 1 goto buildfailed
    )
    call npm run build
    if errorlevel 1 goto buildfailed
    popd
)
echo.
echo Open http://127.0.0.1:8000 in your browser once the server starts.
echo Press Ctrl+C in this window to stop NASA-APP.
".venv\Scripts\python.exe" -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
if errorlevel 1 goto failed
exit /b 0
:buildfailed
popd
:failed
echo.
echo NASA-APP could not start. Check the error above. Python and Node.js must be installed.
pause
exit /b 1
