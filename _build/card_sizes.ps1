# Sizes for "Copy to SD card.bat": prints "<library GB> <largest library file GB> <archives GB> <largest archive GB>"
# (totals rounded up, largest files rounded down). Counts only what is copied: the library without its work folders,
# plus the viewer without _build.
param([string]$Lib, [string]$Zim, [string]$Viewer)
$skip = '\\(_sources|_work|_scripts|starter)\\'
$l = Get-ChildItem -LiteralPath $Lib -Recurse -File -ErrorAction SilentlyContinue |
     Where-Object { $_.FullName -notmatch $skip }
if ($Viewer) { $l = @($l) + @(Get-ChildItem -LiteralPath $Viewer -Recurse -File -ErrorAction SilentlyContinue |
                              Where-Object { $_.FullName -notmatch '\\_build\\' }) }
$l = $l | Measure-Object Length -Sum -Maximum
$z = Get-ChildItem -LiteralPath $Zim -Filter *.zim -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum -Maximum
'{0} {1} {2} {3}' -f [math]::Ceiling([double]$l.Sum / 1GB), [math]::Floor([double]$l.Maximum / 1GB),
                     [math]::Ceiling([double]$z.Sum / 1GB), [math]::Floor([double]$z.Maximum / 1GB)
