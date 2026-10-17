@echo off
rem Rebuilds the viewer's data (item list, Cooking School order, search index, card pictures) from the library.
rem Run this after adding or deleting things in Library Manager, then copy to the SD card again.
setlocal
set "LIB=%~dp0..\Research"
set "PY=%LIB%\_scripts\.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo Could not find the library's Python at:
  echo   %PY%
  echo The LibraryViewer folder must sit next to the Research folder, and Library Manager must be set up.
  pause
  exit /b 1
)
"%PY%" "%~dp0_build\build_viewer.py" --library "%LIB%"
echo.
pause
