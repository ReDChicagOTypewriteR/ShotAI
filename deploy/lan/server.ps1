param(
  [string]$ConfigPath = ""
)

$ErrorActionPreference = "Stop"

function Send-Json {
  param(
    [System.Net.HttpListenerResponse]$Response,
    [int]$StatusCode,
    [object]$Body
  )

  $payload = [System.Text.Encoding]::UTF8.GetBytes(
    ($Body | ConvertTo-Json -Depth 6 -Compress)
  )
  $Response.StatusCode = $StatusCode
  $Response.ContentType = "application/json; charset=utf-8"
  $Response.ContentLength64 = $payload.Length
  $Response.Headers["Cache-Control"] = "no-store"
  $Response.OutputStream.Write($payload, 0, $payload.Length)
  $Response.OutputStream.Close()
}

function Test-RequestCanManage {
  param(
    [System.Net.HttpListenerContext]$Context,
    [bool]$AllowLanAdministration
  )

  if ($AllowLanAdministration) { return $true }
  $remoteAddress = $Context.Request.RemoteEndPoint.Address
  if ($remoteAddress.IsIPv4MappedToIPv6) {
    $remoteAddress = $remoteAddress.MapToIPv4()
  }
  if ([System.Net.IPAddress]::IsLoopback($remoteAddress)) { return $true }
  $localAddresses = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName())
  foreach ($localAddress in $localAddresses) {
    $normalized = if ($localAddress.IsIPv4MappedToIPv6) {
      $localAddress.MapToIPv4()
    }
    else {
      $localAddress
    }
    if ($normalized.Equals($remoteAddress)) { return $true }
  }
  return $false
}

function Get-ImageModelFileName {
  param([System.Net.HttpListenerRequest]$Request)

  $prefix = "/image-runtime/models/"
  if (-not $Request.Url.AbsolutePath.StartsWith($prefix)) { return "" }
  $decoded = [uri]::UnescapeDataString(
    $Request.Url.AbsolutePath.Substring($prefix.Length)
  )
  $fileName = [System.IO.Path]::GetFileName($decoded)
  $extension = [System.IO.Path]::GetExtension($fileName).ToLowerInvariant()
  if ($extension -notin @(".gguf", ".safetensors", ".sft", ".ckpt")) {
    return ""
  }
  return $fileName
}

function Save-ImageModelFile {
  param(
    [System.Net.HttpListenerContext]$Context,
    [string]$ModelDirectory
  )

  $fileName = Get-ImageModelFileName $Context.Request
  if (-not $fileName) {
    Send-Json -Response $Context.Response -StatusCode 400 -Body @{
      error = "请选择有效的图片模型文件"
    }
    return
  }
  $contentLength = $Context.Request.ContentLength64
  if ($contentLength -le 0 -or $contentLength -gt 30GB) {
    Send-Json -Response $Context.Response -StatusCode 413 -Body @{
      error = "模型文件大小无效或超过 30 GB"
    }
    return
  }
  if (-not (Test-Path -LiteralPath $ModelDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $ModelDirectory -Force | Out-Null
  }
  $destination = Join-Path $ModelDirectory $fileName
  $temporary = "$destination.uploading"
  $output = [System.IO.FileStream]::new(
    $temporary,
    [System.IO.FileMode]::Create,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::None,
    1MB,
    [System.IO.FileOptions]::SequentialScan
  )
  try {
    $Context.Request.InputStream.CopyTo($output, 1MB)
  }
  finally {
    $output.Dispose()
  }
  if ((Get-Item -LiteralPath $temporary).Length -ne $contentLength) {
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    Send-Json -Response $Context.Response -StatusCode 400 -Body @{
      error = "文件上传不完整，请重新选择"
    }
    return
  }
  Move-Item -LiteralPath $temporary -Destination $destination -Force
  Send-Json -Response $Context.Response -StatusCode 201 -Body @{
    fileName = $fileName
    size = $contentLength
  }
}

function Remove-ImageModelFile {
  param(
    [System.Net.HttpListenerContext]$Context,
    [string]$ModelDirectory
  )

  $fileName = Get-ImageModelFileName $Context.Request
  $destination = if ($fileName) { Join-Path $ModelDirectory $fileName } else { "" }
  if (-not $destination -or -not (Test-Path -LiteralPath $destination -PathType Leaf)) {
    Send-Json -Response $Context.Response -StatusCode 404 -Body @{
      error = "模型文件已经不存在"
    }
    return
  }
  Remove-Item -LiteralPath $destination -Force
  Send-Json -Response $Context.Response -StatusCode 200 -Body @{
    fileName = $fileName
    deleted = $true
  }
}

function Restart-ImageRuntime {
  param([string]$ConfigPath)

  $pidPath = Join-Path $PSScriptRoot "runtime\image\image-runtime.pid"
  if (Test-Path -LiteralPath $pidPath -PathType Leaf) {
    $runtimePid = 0
    [int]::TryParse(
      [string](Get-Content -LiteralPath $pidPath -ErrorAction SilentlyContinue),
      [ref]$runtimePid
    ) | Out-Null
    if ($runtimePid -gt 0) {
      Stop-Process -Id $runtimePid -Force -ErrorAction SilentlyContinue
    }
  }
  $scriptPath = Join-Path $PSScriptRoot "start-image-runtime.ps1"
  Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @(
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", ('"' + $scriptPath + '"'),
      "-ConfigPath", ('"' + $ConfigPath + '"')
    ) `
    -WorkingDirectory $PSScriptRoot `
    -WindowStyle Hidden | Out-Null
}

function Get-ContentType {
  param([string]$Extension)

  $types = @{
    ".css" = "text/css; charset=utf-8"
    ".gif" = "image/gif"
    ".html" = "text/html; charset=utf-8"
    ".ico" = "image/x-icon"
    ".jpeg" = "image/jpeg"
    ".jpg" = "image/jpeg"
    ".js" = "text/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".mjs" = "text/javascript; charset=utf-8"
    ".pdf" = "application/pdf"
    ".png" = "image/png"
    ".svg" = "image/svg+xml"
    ".txt" = "text/plain; charset=utf-8"
    ".wasm" = "application/wasm"
    ".webp" = "image/webp"
    ".woff" = "font/woff"
    ".woff2" = "font/woff2"
  }

  if ($types.ContainsKey($Extension)) {
    return $types[$Extension]
  }
  return "application/octet-stream"
}

function Invoke-OllamaVersion {
  param([uri]$OllamaUri)

  $target = [uri]::new($OllamaUri, "api/version")
  $request = [System.Net.HttpWebRequest]::CreateHttp($target)
  $request.Method = "GET"
  $request.Timeout = 3000
  $request.ReadWriteTimeout = 3000
  $response = $request.GetResponse()
  try {
    $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
    return ($reader.ReadToEnd() | ConvertFrom-Json)
  }
  finally {
    $response.Dispose()
  }
}

function Proxy-LocalService {
  param(
    [System.Net.HttpListenerContext]$Context,
    [uri]$TargetUri,
    [string]$PublicPrefix,
    [string]$ServiceLabel,
    [string]$ProxyName
  )

  $request = $Context.Request
  $response = $Context.Response
  $relativePath = $request.Url.AbsolutePath.Substring($PublicPrefix.Length).TrimStart("/")
  $target = [uri]::new($TargetUri, $relativePath + $request.Url.Query)
  $proxyRequest = [System.Net.HttpWebRequest]::CreateHttp($target)
  $proxyRequest.Method = $request.HttpMethod
  $proxyRequest.AllowAutoRedirect = $false
  $proxyRequest.Timeout = 3600000
  $proxyRequest.ReadWriteTimeout = 3600000
  $proxyRequest.Accept = $request.Headers["Accept"]
  $proxyRequest.ContentType = $request.ContentType
  $proxyRequest.UserAgent = "ShotAI-Portable/1.0"
  # Do not forward Origin/Referer from LAN browsers. Ollama only allows
  # loopback origins by default and otherwise rejects POST requests with 403.
  # HttpWebRequest creates a new local request, so these headers stay removed.
  $proxyRequest.Headers["X-ShotAI-Proxy"] = $ProxyName

  if ($request.HasEntityBody) {
    $shouldBufferBody = $relativePath -eq "api/chat"
    if ($shouldBufferBody) {
      # Image messages contain a large Base64 value. Buffering this one endpoint
      # gives Ollama an exact Content-Length and avoids chunked-body corruption
      # seen with some Windows browsers and HttpListener combinations.
      $bodyBuffer = [System.IO.MemoryStream]::new()
      try {
        $request.InputStream.CopyTo($bodyBuffer)
        if ($bodyBuffer.Length -gt 100MB) {
          $proxyRequest.Abort()
          Send-Json -Response $response -StatusCode 413 -Body @{
            error = "上传的图片内容过大，请减少图片数量或重新选择较小的图片。"
          }
          return
        }
        $bodyBytes = $bodyBuffer.ToArray()
      }
      finally {
        $bodyBuffer.Dispose()
      }
      $proxyRequest.AllowWriteStreamBuffering = $true
      $proxyRequest.SendChunked = $false
      $proxyRequest.ContentLength = $bodyBytes.Length
      $targetStream = $proxyRequest.GetRequestStream()
      try {
        $targetStream.Write($bodyBytes, 0, $bodyBytes.Length)
      }
      finally {
        $targetStream.Dispose()
      }
    }
    else {
      # Model imports can be several GB, so those requests remain streamed.
      $proxyRequest.AllowWriteStreamBuffering = $false
      $proxyRequest.SendChunked = $request.SendChunked
      if ($request.ContentLength64 -ge 0) {
        $proxyRequest.ContentLength = $request.ContentLength64
      }
      $targetStream = $proxyRequest.GetRequestStream()
      try {
        $request.InputStream.CopyTo($targetStream)
      }
      finally {
        $targetStream.Dispose()
      }
    }
  }

  $proxyResponse = $null
  try {
    $proxyResponse = $proxyRequest.GetResponse()
  }
  catch [System.Net.WebException] {
    if ($_.Exception.Response) {
      $proxyResponse = $_.Exception.Response
    }
    else {
      Send-Json -Response $response -StatusCode 502 -Body @{
        error = "无法连接主机上的${ServiceLabel}：$($_.Exception.Message)"
      }
      return
    }
  }

  try {
    $response.StatusCode = [int]$proxyResponse.StatusCode
    $response.ContentType = $proxyResponse.ContentType
    if ($proxyResponse.ContentLength -ge 0) {
      $response.ContentLength64 = $proxyResponse.ContentLength
    }
    else {
      $response.SendChunked = $true
    }
    $response.Headers["Cache-Control"] = "no-store"

    $source = $proxyResponse.GetResponseStream()
    try {
      $buffer = New-Object byte[] 65536
      while (($read = $source.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $response.OutputStream.Write($buffer, 0, $read)
        $response.OutputStream.Flush()
      }
    }
    finally {
      $source.Dispose()
      $response.OutputStream.Close()
    }
  }
  finally {
    $proxyResponse.Dispose()
  }
}

function Get-ImageRuntimeStatus {
  param(
    [uri]$ImageRuntimeUri,
    [string]$ModelDirectory,
    [string]$RuntimeDirectory,
    [string]$ModelLabel
  )

  $modelFiles = @()
  if (Test-Path -LiteralPath $ModelDirectory -PathType Container) {
    $modelFiles = @(
      Get-ChildItem -LiteralPath $ModelDirectory -File |
        Where-Object { $_.Extension -match "^\.(gguf|safetensors|sft|ckpt)$" } |
        Sort-Object Name |
        ForEach-Object { $_.Name }
    )
  }

  $runtimeFound =
    (Test-Path -LiteralPath (Join-Path $RuntimeDirectory "sd-server.exe") -PathType Leaf) -or
    (Test-Path -LiteralPath (Join-Path $RuntimeDirectory "sd-server") -PathType Leaf)
  $detectedModelLabel = $ModelLabel
  if ($modelFiles | Where-Object { $_ -match "z.?image.*turbo" }) {
    $detectedModelLabel = "Z-Image Turbo"
  }
  elseif ($modelFiles | Where-Object { $_ -match "flux.?2.*klein.*9b" }) {
    $detectedModelLabel = "FLUX.2 Klein 9B"
  }
  elseif ($modelFiles | Where-Object { $_ -match "flux.?2.*klein" }) {
    $detectedModelLabel = "FLUX.2 Klein 4B"
  }
  $serviceOnline = $false
  $serviceStatus = 0
  try {
    $target = [uri]::new($ImageRuntimeUri, "v1/models")
    $request = [System.Net.HttpWebRequest]::CreateHttp($target)
    $request.Method = "GET"
    $request.Timeout = 2000
    $request.ReadWriteTimeout = 2000
    $response = $request.GetResponse()
    try {
      $serviceStatus = [int]$response.StatusCode
      $serviceOnline = $serviceStatus -ge 200 -and $serviceStatus -lt 300
    }
    finally {
      $response.Dispose()
    }
  }
  catch [System.Net.WebException] {
    if ($_.Exception.Response) {
      $serviceStatus = [int]$_.Exception.Response.StatusCode
      $_.Exception.Response.Dispose()
    }
  }

  return @{
    available = $serviceOnline
    serviceOnline = $serviceOnline
    serviceStatus = $serviceStatus
    runtimeFound = $runtimeFound
    modelConfigured = $modelFiles.Count -gt 0
    modelLabel = $detectedModelLabel
    modelFiles = $modelFiles
    modelDirectory = "models/image"
    runtimeDirectory = "runtime/image"
  }
}

function Send-StaticFile {
  param(
    [System.Net.HttpListenerContext]$Context,
    [string]$WebRoot
  )

  $request = $Context.Request
  $response = $Context.Response

  if ($request.HttpMethod -ne "GET" -and $request.HttpMethod -ne "HEAD") {
    Send-Json -Response $response -StatusCode 405 -Body @{ error = "Method Not Allowed" }
    return
  }

  $relativePath = [uri]::UnescapeDataString($request.Url.AbsolutePath).TrimStart("/")
  if ([string]::IsNullOrWhiteSpace($relativePath)) {
    $relativePath = "index.html"
  }

  $candidate = [System.IO.Path]::GetFullPath((Join-Path $WebRoot $relativePath))
  $rootPath = [System.IO.Path]::GetFullPath($WebRoot)
  if (-not $candidate.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    Send-Json -Response $response -StatusCode 403 -Body @{ error = "Forbidden" }
    return
  }

  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    $acceptsHtml = ($request.Headers["Accept"] -like "*text/html*")
    if ($acceptsHtml -and -not [System.IO.Path]::GetExtension($relativePath)) {
      $candidate = Join-Path $WebRoot "index.html"
    }
    else {
      Send-Json -Response $response -StatusCode 404 -Body @{ error = "Not Found" }
      return
    }
  }

  $file = [System.IO.FileInfo]::new($candidate)
  $response.StatusCode = 200
  $response.ContentType = Get-ContentType $file.Extension.ToLowerInvariant()
  $response.ContentLength64 = $file.Length
  $response.Headers["Cache-Control"] = if ($file.Extension -eq ".html") {
    "no-store"
  }
  elseif ($candidate -like "*\assets\*") {
    "public, max-age=31536000, immutable"
  }
  else {
    "public, max-age=3600"
  }

  if ($request.HttpMethod -eq "HEAD") {
    $response.OutputStream.Close()
    return
  }

  $stream = [System.IO.File]::OpenRead($candidate)
  try {
    $stream.CopyTo($response.OutputStream)
  }
  finally {
    $stream.Dispose()
    $response.OutputStream.Close()
  }
}

$webCandidates = @(
  (Join-Path $PSScriptRoot "web"),
  (Join-Path $PSScriptRoot "..\..\dist")
)
$webRoot = $webCandidates |
  Where-Object { Test-Path (Join-Path $_ "index.html") } |
  Select-Object -First 1

if (-not $webRoot) {
  throw "未找到网页构建产物，请确认 web/index.html 存在。"
}
$webRoot = [System.IO.Path]::GetFullPath($webRoot)

if (-not $ConfigPath) {
  $configCandidates = @(
    (Join-Path $PSScriptRoot "lan.config.json"),
    (Join-Path $PSScriptRoot "..\..\lan.config.json")
  )
  $ConfigPath = $configCandidates |
    Where-Object { Test-Path $_ } |
    Select-Object -First 1
}

$config = if ($ConfigPath -and (Test-Path $ConfigPath)) {
  Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
}
else {
  [pscustomobject]@{
    port = 9090
    version = "1.0.0"
    allowLanAdministration = $false
    ollamaUrl = "http://127.0.0.1:11434/"
    imageRuntime = [pscustomobject]@{
      url = "http://127.0.0.1:1234/"
      modelLabel = "FLUX.2 Klein 4B"
    }
  }
}

$port = [int]$config.port
$releaseVersion = if ($config.version) { [string]$config.version } else { "1.0.0" }
$allowLanAdministration = $config.allowLanAdministration -eq $true
$ollamaUrl = [string]$config.ollamaUrl
if (-not $ollamaUrl.EndsWith("/")) {
  $ollamaUrl += "/"
}
$ollamaUri = [uri]$ollamaUrl
$imageRuntimeUrl = if ($config.imageRuntime.url) {
  [string]$config.imageRuntime.url
}
else {
  "http://127.0.0.1:1234/"
}
if (-not $imageRuntimeUrl.EndsWith("/")) {
  $imageRuntimeUrl += "/"
}
$imageRuntimeUri = [uri]$imageRuntimeUrl
$imageModelLabel = if ($config.imageRuntime.modelLabel) {
  [string]$config.imageRuntime.modelLabel
}
else {
  "本地图片模型"
}
$imageModelDirectory = Join-Path $PSScriptRoot "models\image"
$imageRuntimeDirectory = Join-Path $PSScriptRoot "runtime\image"

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://+:$port/")

try {
  $listener.Start()
}
catch {
  Write-Host ""
  Write-Host "[ShotAI] 无法监听端口 $port。" -ForegroundColor Red
  Write-Host "请右键以管理员身份运行 start-windows.bat，或检查端口是否被占用。"
  throw
}

Write-Host ""
Write-Host "ShotAI 免 Node.js 内网服务已启动" -ForegroundColor Green
Write-Host "本机访问：http://127.0.0.1:$port"
Write-Host "Ollama 代理：$ollamaUrl"
Write-Host "按 Ctrl+C 停止服务"
Write-Host ""

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $path = $context.Request.Url.AbsolutePath
      if ($path -eq "/shotai/system") {
        $canManage = Test-RequestCanManage `
          -Context $context `
          -AllowLanAdministration $allowLanAdministration
        Send-Json -Response $context.Response -StatusCode 200 -Body @{
          version = $releaseVersion
          isHost = $canManage -and -not $allowLanAdministration
          canManage = $canManage
          port = $port
        }
      }
      elseif ($path -eq "/healthz") {
        $imageRuntime = Get-ImageRuntimeStatus `
          -ImageRuntimeUri $imageRuntimeUri `
          -ModelDirectory $imageModelDirectory `
          -RuntimeDirectory $imageRuntimeDirectory `
          -ModelLabel $imageModelLabel
        try {
          $version = Invoke-OllamaVersion $ollamaUri
          Send-Json -Response $context.Response -StatusCode 200 -Body @{
            status = "ok"
            service = "ShotAI Portable"
            web = @{ ok = $true }
            proxy = @{ ok = $true; stripsBrowserOrigin = $true }
            ollama = @{ ok = $true; version = $version.version }
            imageRuntime = $imageRuntime
          }
        }
        catch {
          Send-Json -Response $context.Response -StatusCode 503 -Body @{
            status = "degraded"
            service = "ShotAI Portable"
            web = @{ ok = $true }
            proxy = @{ ok = $true; stripsBrowserOrigin = $true }
            ollama = @{ ok = $false; error = $_.Exception.Message }
            imageRuntime = $imageRuntime
          }
        }
      }
      elseif ($path -eq "/image-runtime/status") {
        $imageRuntime = Get-ImageRuntimeStatus `
          -ImageRuntimeUri $imageRuntimeUri `
          -ModelDirectory $imageModelDirectory `
          -RuntimeDirectory $imageRuntimeDirectory `
          -ModelLabel $imageModelLabel
        Send-Json -Response $context.Response -StatusCode 200 -Body $imageRuntime
      }
      elseif ($path.StartsWith("/image-runtime/models/")) {
        if (-not (Test-RequestCanManage `
          -Context $context `
          -AllowLanAdministration $allowLanAdministration)) {
          Send-Json -Response $context.Response -StatusCode 403 -Body @{
            error = "请在运行 ShotAI 的主机上管理图片模型"
          }
        }
        elseif ($context.Request.HttpMethod -eq "PUT") {
          Save-ImageModelFile `
            -Context $context `
            -ModelDirectory $imageModelDirectory
        }
        elseif ($context.Request.HttpMethod -eq "DELETE") {
          Remove-ImageModelFile `
            -Context $context `
            -ModelDirectory $imageModelDirectory
        }
        else {
          Send-Json -Response $context.Response -StatusCode 405 -Body @{
            error = "不支持这项操作"
          }
        }
      }
      elseif ($path -eq "/image-runtime/restart") {
        if (-not (Test-RequestCanManage `
          -Context $context `
          -AllowLanAdministration $allowLanAdministration)) {
          Send-Json -Response $context.Response -StatusCode 403 -Body @{
            error = "请在运行 ShotAI 的主机上重新载入图片模型"
          }
        }
        else {
          Restart-ImageRuntime -ConfigPath $ConfigPath
          Send-Json -Response $context.Response -StatusCode 202 -Body @{
            accepted = $true
            message = "图片服务正在重新载入"
          }
        }
      }
      elseif ($path -eq "/ollama" -or $path.StartsWith("/ollama/")) {
        $protectedOperation = (
          $context.Request.HttpMethod -eq "DELETE" -or
          $path -match "^/ollama/api/(?:create|pull|push|copy|blobs)(?:/|$)"
        )
        if ($protectedOperation -and -not (Test-RequestCanManage `
          -Context $context `
          -AllowLanAdministration $allowLanAdministration)) {
          Send-Json -Response $context.Response -StatusCode 403 -Body @{
            error = "模型由主机管理员统一管理"
          }
        }
        else {
          Proxy-LocalService `
            -Context $context `
            -TargetUri $ollamaUri `
            -PublicPrefix "/ollama" `
            -ServiceLabel "AI 服务" `
            -ProxyName "lan"
        }
      }
      elseif ($path -eq "/image" -or $path.StartsWith("/image/")) {
        Proxy-LocalService `
          -Context $context `
          -TargetUri $imageRuntimeUri `
          -PublicPrefix "/image" `
          -ServiceLabel "图片创作服务" `
          -ProxyName "shotai-image"
      }
      else {
        Send-StaticFile -Context $context -WebRoot $webRoot
      }
    }
    catch {
      if ($context.Response.OutputStream.CanWrite) {
        Send-Json -Response $context.Response -StatusCode 500 -Body @{
          error = "ShotAI 服务异常：$($_.Exception.Message)"
        }
      }
    }
  }
}
finally {
  $listener.Stop()
  $listener.Close()
}
