@echo off
chcp 65001 > nul
echo.
echo ╔══════════════════════════════════════╗
echo ║   Arena Card Gen - Windows 打包工具  ║
echo ╚══════════════════════════════════════╝
echo.

echo [1/3] 安裝必要套件...
pip install pillow pyinstaller --quiet
if errorlevel 1 (
    echo 錯誤：套件安裝失敗，請確認已安裝 Python
    pause
    exit /b 1
)

echo [2/3] 開始打包...
pyinstaller --onefile --windowed ^
  --name "Arena_titlecard_gen" ^
  --hidden-import PIL ^
  --hidden-import PIL._tkinter_finder ^
  --hidden-import tkinter ^
  main.py

if errorlevel 1 (
    echo 錯誤：打包失敗
    pause
    exit /b 1
)

echo [3/3] 完成！
echo.
echo ✓ 輸出位置：dist\Arena_titlecard_gen.exe
echo   把這個 exe 傳給 Windows 用戶，點兩下就能開啟！
echo.
pause
