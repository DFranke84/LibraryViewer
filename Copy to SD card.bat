@echo off
rem Copies the library, this viewer and (optionally) the offline archives to an SD card (or any drive), side by side:
rem     X:\Research        the library, without _sources, _work and _scripts (not needed for viewing)
rem     X:\LibraryViewer   this viewer
rem     X:\Kiwix           the offline archives (.zim files: Wikipedia, Gutenberg, iFixit, MedlinePlus...) for the Kiwix app
rem Run it again after "Build viewer data.bat" to update the card - only changed files are copied, and files that were
rem deleted from the library are removed from the card's copy too.
rem Optional: "Copy to SD card.bat" F Y   (drive letter, and Y/N for the archives) skips those two questions.
setlocal
set "LIB=%~dp0..\Research"
set "VIEW=%~dp0."
set "ZIM=%LIB%\_sources\zim"
if not exist "%LIB%\CATALOG.json" (
  echo The Research folder was not found next to LibraryViewer.
  pause
  exit /b 1
)
echo.
echo  Copy the Research Library to an SD card
echo  ---------------------------------------
echo  Put the SD card in the PC first.
echo  Measuring the library...
rem sizes of what is copied (whole GB, rounded up) and the largest single file - FAT32 cards cannot hold files over 4 GB
set "LIBGB=0" & set "LIBMAX=0" & set "ZIMGB=0" & set "ZIMMAX=0"
for /f "usebackq tokens=1-4" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_build\card_sizes.ps1" -Lib "%LIB%" -Zim "%ZIM%" -Viewer "%VIEW%"`) do (set "LIBGB=%%A" & set "LIBMAX=%%B" & set "ZIMGB=%%C" & set "ZIMMAX=%%D")
echo  The library and viewer need about %LIBGB% GB on the card.
if exist "%ZIM%\*.zim" echo  The offline archives would add about %ZIMGB% GB.
echo.
set "D=%~1"
if "%D%"=="" set /p "D=Drive letter of the SD card (for example F): "
set "D=%D::=%"
set "D=%D:\=%"
if "%D%"=="" exit /b 1
if /i "%D%"=="C" (echo C: is the computer's own drive - choose the SD card. & pause & exit /b 1)
if /i "%~d0"=="%D%:" (echo That is the drive the library is on - choose the SD card. & pause & exit /b 1)
if not exist "%D%:\" (echo There is no drive %D%: - check the letter in File Explorer. & pause & exit /b 1)

set "ARCH=%~2"
if "%ARCH%"=="" if exist "%ZIM%\*.zim" set /p "ARCH=Also copy the offline archives for the Kiwix app (about %ZIMGB% GB)? Type Y or N: "
if "%ARCH%"=="" set "ARCH=N"

rem the card's file system and free space
set "FS="
set "FREE="
for /f "usebackq delims=" %%F in (`powershell -NoProfile -Command "(Get-Volume -DriveLetter %D% -ErrorAction SilentlyContinue).FileSystem" 2^>nul`) do set "FS=%%F"
for /f "usebackq delims=" %%G in (`powershell -NoProfile -Command "[math]::Floor((Get-PSDrive %D%).Free/1GB)"`) do set "FREE=%%G"
echo.
echo  Card %D%: file system %FS%, %FREE% GB free.
set "MAXGB=%LIBMAX%"
if /i "%ARCH%"=="Y" if %ZIMMAX% GTR %MAXGB% set "MAXGB=%ZIMMAX%"
if /i "%FS%"=="FAT32" if %MAXGB% GEQ 4 (
  echo.
  echo  This card is formatted FAT32, which cannot hold files bigger than 4 GB - the largest file to copy is about %MAXGB% GB.
  echo  Re-format the card as exFAT first ^(this erases it^) - Windows: right-click the card, Format, File system exFAT.
  pause
  exit /b 1
)
set /a NEED=LIBGB+1
if /i "%ARCH%"=="Y" set /a NEED=LIBGB+ZIMGB+1
if defined FREE if %FREE% LSS %NEED% (
  echo  Note: a first copy needs about %NEED% GB. If the card already holds an earlier copy, less is needed.
)
echo.
echo  This will make these folders on %D%: match the PC:
echo     %D%:\Research
echo     %D%:\LibraryViewer
if /i "%ARCH%"=="Y" echo     %D%:\Kiwix
echo  Anything else in those folders on the card is removed. Nothing else on the card is touched.
echo.
set /p "OK=Type Y and press Enter to start: "
if /i not "%OK%"=="Y" exit /b 0
echo.
echo Copying the library (the first time this takes a long while)...
robocopy "%LIB%" "%D%:\Research" /MIR /FFT /R:1 /W:1 /NDL /NP /XD "%LIB%\_sources" "%LIB%\_work" "%LIB%\_scripts" "%LIB%\starter" /XF "Setup.bat" "Library Manager.vbs" "Get Archives.bat" "Build Starter Library.bat"
if %ERRORLEVEL% GEQ 8 (echo. & echo Copying the library had errors - see above. & pause & exit /b 1)
echo.
echo Copying the viewer...
robocopy "%VIEW%" "%D%:\LibraryViewer" /MIR /FFT /R:1 /W:1 /NFL /NDL /NP /XD "%VIEW%\_build"
if %ERRORLEVEL% GEQ 8 (echo. & echo Copying the viewer had errors - see above. & pause & exit /b 1)
if /i "%ARCH%"=="Y" (
  echo.
  echo Copying the offline archives ^(the first time this takes several hours^)...
  robocopy "%ZIM%" "%D%:\Kiwix" /MIR /FFT /R:1 /W:1 /NDL /XF "*.done" "*.part" "*.tmp" "*.bad"
  if errorlevel 8 (echo. & echo Copying the archives had errors - see above. & pause & exit /b 1)
)
echo.
echo Done. On the tablet, point the web-server app at the SD card's top folder (the one holding Research and LibraryViewer),
echo then open  http://localhost:8080/LibraryViewer/  in Chrome.  (Use the port number your server app shows.)
if /i "%ARCH%"=="Y" echo For the offline archives, open the Kiwix app and add the files in the card's Kiwix folder ^(see the README^).
pause
