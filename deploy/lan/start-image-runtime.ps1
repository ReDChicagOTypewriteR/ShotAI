param(
  [string]$ConfigPath = ""
)

$ErrorActionPreference = "Stop"

function Resolve-ShotAIPath {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ""
  }
  if ([System.IO.Path]::IsPathRooted($Value)) {
    return [System.IO.Path]::GetFullPath($Value)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot $Value))
}

function Quote-Argument {
  param([string]$Value)
  return '"' + $Value.Replace('"', '\"') + '"'
}

function Test-ImageService {
  param([int]$Port)
  try {
    Invoke-RestMethod -TimeoutSec 2 "http://127.0.0.1:$Port/v1/models" |
      Out-Null
    return $true
  }
  catch {
    return $false
  }
}

if (-not $ConfigPath) {
  $ConfigPath = Join-Path $PSScriptRoot "lan.config.json"
}

$config = Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
$imageConfig = $config.imageRuntime
$runtimeDirectory = Join-Path $PSScriptRoot "runtime\image"
$modelDirectory = Join-Path $PSScriptRoot "models\image"
$executable = Join-Path $runtimeDirectory "sd-server.exe"
$port = 1234

if ($imageConfig.url) {
  try {
    $port = ([uri][string]$imageConfig.url).Port
  }
  catch {
    Write-Host "[ShotAI 图片] 图片服务地址无效，将使用端口 1234。" -ForegroundColor Yellow
  }
}

if (Test-ImageService $port) {
  Write-Host "[ShotAI 图片] 图片创作服务已经运行。" -ForegroundColor Green
  exit 0
}

if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  Write-Host "[ShotAI 图片] 尚未找到图片运行组件。" -ForegroundColor Yellow
  Write-Host "[ShotAI 图片] 请先双击 prepare-image-runtime.bat，或把官方 Windows CUDA 文件放入 runtime\image。"
  exit 3
}

if (-not (Test-Path -LiteralPath $modelDirectory -PathType Container)) {
  New-Item -ItemType Directory -Path $modelDirectory -Force | Out-Null
}

$arguments = @(
  "--listen-ip", "127.0.0.1",
  "--listen-port", [string]$port
)
$mode = if ($imageConfig.mode) { [string]$imageConfig.mode } else { "auto" }
$fullModelPath = Resolve-ShotAIPath ([string]$imageConfig.model)
$diffusionModelPath = Resolve-ShotAIPath ([string]$imageConfig.diffusionModel)
$textEncoderPath = Resolve-ShotAIPath ([string]$imageConfig.textEncoder)
$vaePath = Resolve-ShotAIPath ([string]$imageConfig.vae)

if ($mode -eq "auto" -and -not $fullModelPath -and -not $diffusionModelPath) {
  $files = @(Get-ChildItem -LiteralPath $modelDirectory -File)
  $fullModel = $files |
    Where-Object {
      $_.Extension -eq ".gguf" -and
      $_.Name -match "flux.?2.*klein" -and
      $_.Name -notmatch "qwen|vae|ae\."
    } |
    Sort-Object Length |
    Select-Object -First 1

  if ($fullModel) {
    $fullModelPath = $fullModel.FullName
    $mode = "full"
  }
  else {
    $diffusionModel = $files |
      Where-Object {
        $_.Name -match "(?:z.?image.*turbo|flux.?2.*klein)" -and
        $_.Name -notmatch "qwen|vae|ae\."
      } |
      Sort-Object Length -Descending |
      Select-Object -First 1
    $textEncoder = $files |
      Where-Object { $_.Name -match "qwen.*(?:3|4b)" } |
      Sort-Object Length -Descending |
      Select-Object -First 1
    $vae = $files |
      Where-Object {
        $_.Name -match "(?:flux2.*ae|vae|ae(?:\.|_).*(?:sft|safetensors))" -or
        ($_.Name -eq "diffusion_pytorch_model.safetensors" -and $_.Length -lt 1000000000)
      } |
      Sort-Object Length -Descending |
      Select-Object -First 1

    if ($diffusionModel) { $diffusionModelPath = $diffusionModel.FullName }
    if ($textEncoder) { $textEncoderPath = $textEncoder.FullName }
    if ($vae) { $vaePath = $vae.FullName }
    $mode = "split"
  }
}

if ($fullModelPath -and (Test-Path -LiteralPath $fullModelPath -PathType Leaf)) {
  $arguments += @("--model", (Quote-Argument $fullModelPath))
  $mode = "full"
}
elseif (
  $diffusionModelPath -and
  $textEncoderPath -and
  $vaePath -and
  (Test-Path -LiteralPath $diffusionModelPath -PathType Leaf) -and
  (Test-Path -LiteralPath $textEncoderPath -PathType Leaf) -and
  (Test-Path -LiteralPath $vaePath -PathType Leaf)
) {
  $arguments += @(
    "--diffusion-model", (Quote-Argument $diffusionModelPath),
    "--llm", (Quote-Argument $textEncoderPath),
    "--vae", (Quote-Argument $vaePath)
  )
  $mode = "split"
}
else {
  Write-Host "[ShotAI 图片] 模型文件尚未准备完整。" -ForegroundColor Yellow
  Write-Host "[ShotAI 图片] 单文件版：把约 4.96GB 的 flux2-klein-4b.q4_k.gguf 放入 models\image。"
  Write-Host "[ShotAI 图片] Z-Image Turbo：需要主模型、Qwen3 4B 文字理解文件和图片解码文件。"
  exit 4
}

$steps = if ($imageConfig.steps) { [int]$imageConfig.steps } else { 4 }
$cfgScale = if ($null -ne $imageConfig.cfgScale) {
  [string]$imageConfig.cfgScale
}
else {
  "1"
}
$arguments += @(
  "--steps", [string]$steps,
  "--cfg-scale", $cfgScale,
  "--offload-to-cpu",
  "--diffusion-fa"
)

$stdoutLog = Join-Path $runtimeDirectory "image-runtime.log"
$stderrLog = Join-Path $runtimeDirectory "image-runtime-error.log"
Write-Host "[ShotAI 图片] 正在启动图片创作服务（$mode 模式）..."
$process = Start-Process `
  -FilePath $executable `
  -ArgumentList $arguments `
  -WorkingDirectory $runtimeDirectory `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru

Set-Content -LiteralPath (Join-Path $runtimeDirectory "image-runtime.pid") -Value $process.Id

for ($index = 0; $index -lt 15; $index += 1) {
  Start-Sleep -Seconds 1
  if (Test-ImageService $port) {
    Write-Host "[ShotAI 图片] 图片创作服务已就绪。" -ForegroundColor Green
    exit 0
  }
  if ($process.HasExited) {
    Write-Host "[ShotAI 图片] 图片创作服务启动失败，请查看 runtime\image\image-runtime-error.log。" -ForegroundColor Red
    exit 5
  }
}

Write-Host "[ShotAI 图片] 模型仍在载入，工作台启动后可点击“重新检查”。" -ForegroundColor Yellow
exit 0
