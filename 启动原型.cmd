@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 写字星交互原型
echo 浏览器地址：http://127.0.0.1:5173/
echo 请保持此窗口开启；结束时按 Ctrl+C。
if not exist node_modules (
  echo 正在安装依赖...
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 (
    echo 安装失败，请检查 Node.js 和网络连接。
    pause
    exit /b 1
  )
)
call npm.cmd run dev
if errorlevel 1 echo 如果 5173 端口已被本原型占用，请直接打开上述地址。
pause
