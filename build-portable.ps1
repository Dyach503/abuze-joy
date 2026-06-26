# Builds the portable Abuze Joy folder: AbuzeJoy.exe + resources/ in dist-portable/.
# Requires the runtime binaries to already be present in resources/ (see RELEASE_BINARIES.md).

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$out = Join-Path $root "dist-portable\AbuzeJoy"

Write-Host "[1/4] Installing dependencies..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

Write-Host "[2/4] Building frontend..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "frontend build failed" }

Write-Host "[3/4] Building Tauri executable (no installer)..." -ForegroundColor Cyan
npm run tauri build -- --no-bundle
if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }

Write-Host "[4/4] Assembling portable folder..." -ForegroundColor Cyan
# Tauri names the binary after the Cargo package (abuze-joy.exe); we ship it as AbuzeJoy.exe.
$exe = Join-Path $root "src-tauri\target\release\abuze-joy.exe"
if (-not (Test-Path $exe)) { throw "Executable not found: $exe" }

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force -Path $out | Out-Null

Copy-Item $exe -Destination (Join-Path $out "AbuzeJoy.exe")
Copy-Item (Join-Path $root "resources") -Destination $out -Recurse

Write-Host ""
Write-Host "Done. Portable build is in:" -ForegroundColor Green
Write-Host "  $out"
Write-Host ""
Write-Host "Zip that folder and attach it to a GitHub release." -ForegroundColor Green
