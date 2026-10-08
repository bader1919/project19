# RefVault PC helper - Windows installer (no admin needed).
# Copy the command from RefVault -> Settings -> PC helper; it sets RV_HELPER_URL and runs this.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$url = $env:RV_HELPER_URL
$app = if ($env:RV_APP) { $env:RV_APP.TrimEnd('/') } else { 'https://refvault-bader.netlify.app' }
if (-not $url) { throw 'RV_HELPER_URL is missing. Copy the full install command from RefVault -> Settings -> PC helper.' }

$dir = Join-Path $env:LOCALAPPDATA 'RefVault'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Write-Host 'RefVault helper: installing into' $dir

# uv runs the helper with its own Python and keeps youtube-transcript-api up to date.
$uv = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uv) {
  Write-Host 'Installing uv (Python runner, from astral.sh)...'
  Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
  $env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
  $uv = Get-Command uv -ErrorAction Stop
}
$uvPath = $uv.Source
$uvw = Join-Path (Split-Path $uvPath) 'uvw.exe'   # same as uv, without a console window
if (-not (Test-Path $uvw)) { $uvw = $uvPath }

# Stop an older copy before replacing it.
Get-CimInstance Win32_Process -Filter "Name like 'python%'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*refvault_helper.py*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$script = Join-Path $dir 'refvault_helper.py'
Invoke-WebRequest "$app/helper/refvault_helper.py" -OutFile $script -UseBasicParsing
# UTF-8 without a byte-order mark (Windows PowerShell's -Encoding UTF8 adds one).
$json = @{ url = $url; uv = $uvPath } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $dir 'config.json'), $json, (New-Object Text.UTF8Encoding $false))

Write-Host 'Checking the connection (first run downloads Python, ~1 minute)...'
$ErrorActionPreference = 'Continue'   # uv prints progress on stderr; that is not an error
& $uvPath run --upgrade --script $script --check
$code = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($code -ne 0) { throw "The helper check failed (exit code $code). Nothing was set to start automatically." }

# Start with Windows: a shortcut in your Startup folder (remove it to uninstall).
$startup = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $startup 'RefVault helper.lnk'))
$lnk.TargetPath = $uvw
$lnk.Arguments = "run --script `"$script`""
$lnk.WorkingDirectory = $dir
$lnk.WindowStyle = 7
$lnk.Description = 'RefVault PC helper: fetches YouTube captions for your library'
$lnk.Save()

Start-Process -FilePath $uvw -ArgumentList @('run', '--script', "`"$script`"") -WorkingDirectory $dir -WindowStyle Hidden
Write-Host ''
Write-Host 'Done. The RefVault helper is running and will start with Windows.' -ForegroundColor Green
Write-Host "Log: $dir\helper.log   Uninstall: delete 'RefVault helper' from $startup and the folder $dir"
