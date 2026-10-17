@echo off
rem Opens the tablet viewer in this PC's browser (only this computer can see it). Close this window to stop.
setlocal
set "LIB=%~dp0..\Research"
set "PY=%LIB%\_scripts\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" "%~dp0_build\serve.py" --port 8765 --library "%LIB%" --open
pause
