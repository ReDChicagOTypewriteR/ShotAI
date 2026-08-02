@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

rem The old launcher used "net session" for elevation detection. That command
rem can fail on valid administrator accounts when the Server service is absent,
rem which caused the launcher to elevate itself repeatedly.
set "SHOTAI_ELEVATED=0"
if /I "%~1"=="--elevated" set "SHOTAI_ELEVATED=1"
set "SHOTAI_PORT=9090"
set "SHOTAI_LAUNCHER=%~f0"

for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "try { $c=Get-Content -Raw '.\lan.config.json'|ConvertFrom-Json; [int]$c.port } catch { 9090 }"`) do set "SHOTAI_PORT=%%p"

powershell -NoProfile -Command "$identity=[Security.Principal.WindowsIdentity]::GetCurrent(); $principal=New-Object Security.Principal.WindowsPrincipal($identity); if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){exit 0}; exit 1"
if errorlevel 1 (
  if "%SHOTAI_ELEVATED%"=="1" (
    echo.
    echo [ShotAI] 未能获得管理员权限，无法继续启动内网服务。
    echo [ShotAI] 请右键点击 start-windows.bat，然后选择“以管理员身份运行”。
    echo.
    pause
    exit /b 1
  )

  echo [ShotAI] 正在请求管理员权限以开放内网端口 %SHOTAI_PORT% ...
  powershell -NoProfile -Command "try { $commandLine=([char]34 + [char]34 + $env:SHOTAI_LAUNCHER + [char]34 + ' --elevated'); Start-Process -FilePath $env:ComSpec -Verb RunAs -ArgumentList @('/k',$commandLine); exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
  if errorlevel 1 (
    echo.
    echo [ShotAI] 管理员权限请求被取消或启动失败。
    echo [ShotAI] 请右键点击 start-windows.bat，然后选择“以管理员身份运行”。
    echo.
    pause
  )
  exit /b
)

echo.
echo [ShotAI] 内网服务端口：%SHOTAI_PORT%

netsh advfirewall firewall show rule name="ShotAI LAN %SHOTAI_PORT%" >nul 2>nul
if errorlevel 1 (
  netsh advfirewall firewall add rule name="ShotAI LAN %SHOTAI_PORT%" dir=in action=allow protocol=TCP localport=%SHOTAI_PORT% >nul 2>nul
  if errorlevel 1 (
    echo [ShotAI] 无法自动添加防火墙规则，其他电脑可能无法访问该端口。
  )
)

call :TestOllama
if errorlevel 1 (
  if exist "%~dp0runtime\ollama\ollama.exe" (
    echo [ShotAI] 正在启动随包 Ollama 运行时...
    start "ShotAI Ollama" /min "%~dp0runtime\ollama\ollama.exe" serve
    call :WaitForOllama
  ) else (
    where ollama >nul 2>nul
    if not errorlevel 1 (
      echo [ShotAI] 正在启动本机 Ollama...
      start "ShotAI Ollama" /min "%ComSpec%" /c "ollama serve"
      call :WaitForOllama
    ) else (
      echo [ShotAI] 未找到 Ollama。网页仍会启动，但模型服务将显示离线。
      echo [ShotAI] 可安装 Ollama，或将 ollama.exe 放入 runtime\ollama。
    )
  )
)

echo.
echo [ShotAI 图片] 正在检查图片创作组件...
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-image-runtime.ps1"
if errorlevel 1 (
  echo [ShotAI 图片] 图片功能尚未就绪，聊天和资料功能仍可正常使用。
)

echo.
echo [ShotAI] 正在启动免 Node.js 内网网页版...
echo [ShotAI] 请保持此窗口开启；按 Ctrl+C 可停止服务。
echo.
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
set "SHOTAI_EXIT=%ERRORLEVEL%"

echo.
if not "%SHOTAI_EXIT%"=="0" (
  echo [ShotAI] 服务启动失败或已异常停止，错误信息见上方。
  echo [ShotAI] 常见原因：端口被占用、权限不足、web 文件缺失或配置文件格式错误。
) else (
  echo [ShotAI] 服务已停止。
)
pause
exit /b %SHOTAI_EXIT%

:TestOllama
powershell -NoProfile -Command "try { Invoke-RestMethod -TimeoutSec 2 'http://127.0.0.1:11434/api/version' | Out-Null; exit 0 } catch { exit 1 }"
exit /b %ERRORLEVEL%

:WaitForOllama
for /L %%i in (1,1,8) do (
  timeout /t 1 /nobreak >nul
  call :TestOllama
  if not errorlevel 1 (
    echo [ShotAI] Ollama 已就绪。
    exit /b 0
  )
)
echo [ShotAI] Ollama 尚未就绪，稍后可在工作台“设置 - 系统与连接”中重新检测。
exit /b 0
