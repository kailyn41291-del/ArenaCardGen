# Arena Card Generator

**演唱會字卡生成器** — 把雜亂的 Rundown 變成 1920×1080 PNG 字卡，專為演唱會 VJ 設計。

![version](https://img.shields.io/badge/version-0.3.0--beta1-blue)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey)
![license](https://img.shields.io/badge/license-MIT-green)

---

## 這是什麼

演唱會開始前，VJ 需要把每首歌的歌名、歌手、特殊提示整理成一張張字卡在舞台螢幕上顯示。傳統做法是手動在 Keynote / PowerPoint 一張張排，費時又容易出錯。

Arena Card Generator 讓你：
1. 貼上 Rundown（或上傳 PDF）
2. AI 自動解析成結構化字卡
3. 調整樣式、順序、文字
4. 一鍵 ZIP 匯出全部 1920×1080 PNG

---

## 下載安裝

前往 [Releases](https://github.com/kailyn41291-del/ArenaCardGen/releases) 下載最新版本。

### Windows
下載 `arena-card-gen-vX.X.X-portable.zip`，解壓後雙擊 `Arena Card Generator.exe`。

> ⚠️ **SmartScreen 警告**：點「其他資訊 → 仍要執行」。未做 code signing，非病毒。

### macOS
| 機型 | 下載 |
|------|------|
| Apple Silicon (M1/M2/M3/M4) | `Arena.Card.Generator-X.X.X-arm64.dmg` |
| Intel Mac | `Arena.Card.Generator-X.X.X.dmg` |

雙擊 `.dmg` → 拖到 Applications 資料夾。

> ⚠️ **Gatekeeper 警告**：在 Finder 對 `.app` **右鍵 → 打開 → 打開**。未做 Apple notarization，非惡意程式。

---

## 主要功能

| 功能 | 說明 |
|------|------|
| **三欄式 UI** | Setlist 輸入 / 字卡 Grid 預覽 / 編輯 Panel |
| **動態字級** | Canvas measureText 自動縮放，字不會超框 |
| **Rundown Parser** | 規則解析 + Gemini AI 智慧辨識 + PDF 上傳 |
| **多選 Bulk Edit** | 批次套用顏色、類型 |
| **拖曳排序** | 卡片順序與 text 雙向同步 |
| **Undo / Redo** | Ctrl+Z / Ctrl+Y，50 步 |
| **ZIP 匯出** | 1920×1080 PNG × N，含匯出前 checklist |
| **自動存檔** | localStorage 即時儲存，關掉重開不怕遺失 |

---

## Gemini API Key 設定

Rundown Parser 的 AI 解析功能需要 Gemini API key：

1. 前往 [Google AI Studio](https://aistudio.google.com/apikey) 取得免費 key（1500 次/天）
2. 在 app 內開啟「Rundown Parser」
3. 底部 input 貼入 key → 按 Enter 或點其他地方儲存

> Key 用 OS 原生加密（Windows DPAPI / macOS Keychain）儲存，不會明文寫入磁碟，也無法跨機器使用。

---

## 開發者

### 環境需求
- Node.js >= 18
- macOS build 需要 Xcode Command Line Tools

### 本地執行
```bash
cd app
npm install
npm run dev
```

### Build
```bash
# Windows
npm run build:win

# macOS
npm run build:mac
```

產出在 `app/dist/`。

---

## 已知限制

- 沒有 code signing / notarization，Win/Mac 首次開啟都有系統警告
- 重複內容的卡片（如兩個歌名相同）reorder 後 override 對齊以內容為準，不保證位置完全還原
- Auto-update 目前只有 toast 通知，不自動下載安裝

---

## 回報問題

[GitHub Issues](https://github.com/kailyn41291-del/ArenaCardGen/issues) 或直接聯絡 phang。

---

## License

MIT © phang + kailyn41291-del
