@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 online.py
  goto end
)
where python >nul 2>nul
if not errorlevel 1 (
  python online.py
  goto end
)
echo Installa Python 3.10 o successivo da python.org, poi riapri questo file.
:end
pause
