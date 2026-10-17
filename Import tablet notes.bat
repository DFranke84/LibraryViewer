@echo off
rem Copies notes typed on the tablet into the library's notes (shown in Library Manager). Never overwrites a note.
rem On the tablet first: Favorites -> "Save favorites & notes to a file", then copy that file to this PC.
setlocal
set "LIB=%~dp0..\Research"
set "PY=%LIB%\_scripts\.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo Could not find the library's Python at %PY%
  pause
  exit /b 1
)
"%PY%" "%~dp0_build\import_tablet_notes.py" %* --library "%LIB%"
echo.
pause
