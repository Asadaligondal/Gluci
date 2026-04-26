# Run from backend/ if Prisma throws EPERM when generating (file lock on the query engine).
# 1) Stops Node  2) Removes .prisma cache  3) Regenerates client
$ErrorActionPreference = "Stop"
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
$prisma = Join-Path $PSScriptRoot "..\node_modules\.prisma"
if (Test-Path $prisma) {
  Remove-Item -Recurse -Force $prisma
}
Set-Location (Join-Path $PSScriptRoot "..")
npx prisma generate
Write-Host "OK. Now run: npm run dev" -ForegroundColor Green
