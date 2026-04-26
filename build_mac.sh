#!/bin/bash
echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Arena Card Gen - Mac 打包工具      ║"
echo "╚══════════════════════════════════════╝"
echo ""

echo "[1/3] 安裝必要套件..."
pip3 install pillow pyinstaller --quiet
if [ $? -ne 0 ]; then
    echo "錯誤：套件安裝失敗"
    exit 1
fi

echo "[2/3] 開始打包..."
pyinstaller --onefile --windowed \
  --name "Arena_titlecard_gen" \
  --hidden-import PIL \
  --hidden-import PIL._tkinter_finder \
  --hidden-import tkinter \
  main.py

if [ $? -ne 0 ]; then
    echo "錯誤：打包失敗"
    exit 1
fi

echo "[3/3] 完成！"
echo ""
echo "✓ 輸出位置：dist/Arena_titlecard_gen"
echo "  把這個檔案傳給 Mac 用戶，點兩下就能開啟！"
echo ""
echo "注意：如果 Mac 顯示「無法開啟」"
echo "  → 系統設定 > 隱私權與安全性 > 點「仍要開啟」"
echo ""
