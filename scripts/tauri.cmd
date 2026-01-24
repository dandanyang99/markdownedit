@echo off
setlocal

REM Ensure Rust toolchain is reachable for Tauri (fixes: "cargo metadata ... program not found").
set "CARGO_BIN=%USERPROFILE%\.cargo\bin"
if exist "%CARGO_BIN%\cargo.exe" (
  set "PATH=%CARGO_BIN%;%PATH%"
)

where cargo.exe >nul 2>nul
if errorlevel 1 (
  echo [error] cargo.exe not found. Please install Rust and restart your terminal.
  echo         https://www.rust-lang.org/tools/install
  exit /b 1
)

REM Best-effort load MSVC build environment if Visual Studio Build Tools are installed.
set "VSDEVCMD="
if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" (
  set "VSDEVCMD=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
) else if exist "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" (
  set "VSDEVCMD=C:\Program Files\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
) else if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat" (
  set "VSDEVCMD=C:\Program Files (x86)\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat"
) else if exist "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat" (
  set "VSDEVCMD=C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat"
)

if not "%VSDEVCMD%"=="" (
  call "%VSDEVCMD%" -arch=amd64 -host_arch=amd64 >nul
)

if not exist "%~dp0..\node_modules\.bin\tauri.cmd" (
  echo [error] Tauri CLI not found. Run: npm install
  exit /b 1
)

call "%~dp0..\node_modules\.bin\tauri.cmd" %*
exit /b %ERRORLEVEL%
