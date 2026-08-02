param()

$ErrorActionPreference = "Stop"
$runtimeDirectory = Join-Path $PSScriptRoot "runtime\image"
$downloadDirectory = Join-Path $runtimeDirectory ".download"

New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $downloadDirectory -Force | Out-Null

Write-Host ""
Write-Host "[ShotAI 图片] 正在读取官方 Windows CUDA 运行组件..." -ForegroundColor Cyan
$release = Invoke-RestMethod `
  -Headers @{ "User-Agent" = "ShotAI-Image-Setup" } `
  -Uri "https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/latest"

$programAsset = $release.assets |
  Where-Object { $_.name -like "sd-*-bin-win-cuda12-x64.zip" } |
  Select-Object -First 1
$cudaAsset = $release.assets |
  Where-Object { $_.name -like "cudart-sd-bin-win-cu12-x64.zip" } |
  Select-Object -First 1

if (-not $programAsset) {
  throw "官方最新版本中没有找到 Windows CUDA 12 运行文件。"
}

$assets = @($programAsset)
if ($cudaAsset) {
  $assets += $cudaAsset
}

foreach ($asset in $assets) {
  $archivePath = Join-Path $downloadDirectory $asset.name
  $extractPath = Join-Path $downloadDirectory ([System.IO.Path]::GetFileNameWithoutExtension($asset.name))
  Write-Host "[ShotAI 图片] 下载 $($asset.name)"
  Invoke-WebRequest -UseBasicParsing -Uri $asset.browser_download_url -OutFile $archivePath
  if (Test-Path -LiteralPath $extractPath) {
    Remove-Item -LiteralPath $extractPath -Recurse -Force
  }
  Expand-Archive -LiteralPath $archivePath -DestinationPath $extractPath -Force
  Get-ChildItem -LiteralPath $extractPath -File -Recurse |
    ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $runtimeDirectory $_.Name) -Force
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $runtimeDirectory "sd-server.exe"))) {
  throw "下载已完成，但没有找到 sd-server.exe。请从官方发布页手动下载 Windows CUDA 12 版本。"
}

Write-Host ""
Write-Host "[ShotAI 图片] 图片运行组件准备完成。" -ForegroundColor Green
Write-Host "[ShotAI 图片] 接下来把下载好的模型文件放入 models\image，然后重新运行 start-windows.bat。"
Write-Host ""
