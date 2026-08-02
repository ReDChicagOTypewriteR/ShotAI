@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo [ShotAI 图片] 将从 stable-diffusion.cpp 官方 GitHub 下载 Windows CUDA 12 运行组件。
echo [ShotAI 图片] 下载完成后无需安装 Python 或 ComfyUI。
echo.

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare-image-runtime.ps1"
set "SHOTAI_IMAGE_EXIT=%ERRORLEVEL%"

echo.
if not "%SHOTAI_IMAGE_EXIT%"=="0" (
  echo [ShotAI 图片] 准备失败，请检查网络后重试。
) else (
  echo [ShotAI 图片] 准备完成。
)
pause
exit /b %SHOTAI_IMAGE_EXIT%
