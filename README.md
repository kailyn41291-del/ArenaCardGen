<div align="center">

# Arena Card Generator

**演唱會字卡產生器** — 把雜亂 RD(rundown / 流程表)轉成 1920×1080 PNG 字卡,給 VJ 在 Resolume / 大螢幕上即時切。

[![Latest Release](https://img.shields.io/github/v/release/kailyn41291-del/ArenaCardGen)](https://github.com/kailyn41291-del/ArenaCardGen/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS-blue)]()

</div>

---

## 這是什麼

VJ 在演唱會現場要把每首歌、TALKING、轉場切到大螢幕,通常要事前做好「字卡」(歌名 / S01 / TALKING-1 等)。傳統做法:Photoshop 一張一張畫 → 50 首歌一晚做完。

這個工具讓你:

1. **貼整份雜亂 RD**(從 Word / Excel / PDF 複製貼上)
2. **點一下解析** → 自動切出乾淨 setlist
3. **一鍵匯出 N 張 1920×1080 PNG zip** → 直接拖進 Resolume Arena

支援繁體 / 簡體中文 + 英文混排,黑體粗字,VJ 投到 LED 牆很清楚。

---

## 安裝

> ⚠️ **目前為 pre-release(beta)** — UI 跟功能可能在 beta 版本之間變更。等 v0.3.0 stable 才視為正式版。

到 [Releases](https://github.com/kailyn41291-del/ArenaCardGen/releases/latest) 下載對應平台的檔案。

### Windows

兩個版本選一:

| 檔案 | 用途 |
|---|---|
| `Arena Card Generator Setup x.x.x.exe` | **安裝程式**(建議)— 開始功能表 + 桌面捷徑 + 自動更新 |
| `Arena Card Generator x.x.x.exe` | Portable — 解壓即用,不寫進系統 |

⚠️ **第一次打開會看到「Windows 已保護您的電腦」藍色視窗** — 這是因為我們沒付錢買 Microsoft 的數位簽證(EV Code Signing 一年 USD $300+)。**這不代表程式有問題**,點:

> **其他資訊** → **仍要執行**

之後就不會再跳。

### macOS

下載對應晶片版本:

| 檔案 | 用途 |
|---|---|
| `Arena Card Generator-x.x.x.dmg` | Intel Mac |
| `Arena Card Generator-x.x.x-arm64.dmg` | Apple Silicon (M1 / M2 / M3 / M4) |

⚠️ **第一次打開可能會看到警告**(沒付 Apple Developer 認證費 $99 / 年的後果,**不代表 app 有問題**)。看到的訊息有兩種,做法不同:

#### A. 「無法打開,因為它來自未識別的開發者」(舊版 macOS / 較寬鬆的設定)

1. 在 Finder 找到 `Arena Card Generator.app`(Applications 資料夾)
2. **右鍵 → 打開**(不能雙擊)
3. 跳出警告選 **打開**

#### B. 「『Arena Card Generator』已損毀,無法打開。 你應該將其丟到『垃圾桶』」(macOS 13+ / Apple Silicon 常見)

⚠️ **不要丟垃圾桶**。這是 Gatekeeper 對 unsigned + 從網路下載的 app 的更嚴格擋法,「右鍵→打開」沒用了。兩種解法:

**最快:Terminal 指令**

打開「終端機」(Terminal.app),貼這行 → Enter:

```bash
xattr -cr "/Applications/Arena Card Generator.app"
```

清掉 macOS 加的 `quarantine` 屬性,之後雙擊就能開。

**或:系統設定(GUI)**

1. 在「已損毀」對話框先按「**取消**」
2. 開「**系統設定**」→「**隱私權與安全性**」
3. 拉到下面看到「`Arena Card Generator` 已被阻擋…」→ 點「**仍要打開**」
4. 跳新警告 →「**打開**」

之後雙擊就正常。

---

## 怎麼用

### 基本流程

```
1. 貼 RD 到左欄                ← 任何格式都先試,parser 會處理
   或:點「📄 PDF」上傳 PDF      ← 自動抽文字
   或:點「🧠 智慧解析」用 Gemini ← 規則 parser 解不掉的情況

2. 中間 grid 即時預覽字卡       ← 每行一張,自動排版
   - 點卡片可編輯個別屬性(顏色、類型、文字、背景)
   - Ctrl/⌘ + 點 → 多選
   - 拖曳卡片可重排順序
   - Ctrl + 滾輪 → 調整縮放

3. 右欄編輯
   - 沒選卡 → 全域設定(預設色、自動配色、透明度、背景色)
   - 選 1 張 → 個別 override
   - 多選 → 批次套色 / 批次改類型

4. 點右上「匯出所有字卡」
   - 可選「全部」或「只選中」
   - 匯出 1920×1080 PNG zip,直接拖進 Resolume
```

### Rundown Parser(智慧解析)

某些 RD 太亂,規則 parser 切不出 → 開「Rundown Parser」彈窗用 Gemini AI 智慧解析。

**需要自己的 Gemini API key**(免費 1500 次 / 天):

1. 去 https://aistudio.google.com/apikey 申請(用你 Google 帳號,完全免費)
2. App 內開「Rundown Parser」 → 底部「🧠 Gemini API key」貼入
3. 按 Enter 或離開欄位才存

#### 🔒 隱私保證

- **你的 API key 用 OS 內建加密儲存**(Windows DPAPI / macOS Keychain),只能在你這台電腦解密。**絕對不會送到任何伺服器,不會跟 settings 一起匯出**。
- **使用「智慧解析」時會把 RD 內容送到 Google Gemini API** — 如果你的 setlist 是有 NDA 的(藝人未公開曲目),**請先確認可以送出再用**。不想送 = 用規則 parser(免費、本地、不送出)。
- App 不收集任何遙測 / 使用統計 / Crash report。
- 唯一會連網的地方:啟動時檢查 GitHub Releases API 看有沒有新版(可在 Settings 的「檢查更新」按鈕關),以及匯出時載入 Google Fonts。

---

## 不支援什麼

避免誤會,先講清楚目前**不**做的事:

- 只匯出 PNG,**不**出 MP4 / 動畫
- 字卡背景只支援純色,**不**支援漸層或圖片
- 沒有即時送字卡到 Resolume 的 OSC / NDI 整合(要自己拖 PNG 進 Arena clip)
- 沒有跨機器同步;設定存在 localStorage,換電腦要重新 import

如果你需要這些,可以開 [Feature Request](https://github.com/kailyn41291-del/ArenaCardGen/issues/new?template=feature_request.md) 討論。

---

## 常見問題

### Q: 字卡渲染怪 / 字超出邊框?

回報 [Bug Issue](https://github.com/kailyn41291-del/ArenaCardGen/issues/new?template=bug_report.md) 並附上:有問題的 RD 文字 + 截圖。

### Q: 我的 RD 規則 parser 解不出來?

先試 Gemini 智慧解析(看上面 setup)。仍解不出來 → 開 Issue,附原始 RD 範例。

### Q: 為什麼匯出的字卡跟預覽看起來顏色 / 排版不一樣?

不應該。這是 bug,請回報並附「預覽截圖」+「匯出 PNG」對照。

### Q: 自動更新怎麼運作?

**Windows(NSIS installer)**:啟動時檢查新版,有新版會在背景下載,完成後跳「立刻重啟安裝 / 稍後」對話框。Portable `.exe` 沒這功能,要手動重新下載。

**macOS(.dmg)**:**只會跳 toast 提示「有新版」,不會自動安裝**(因為沒做 Apple notarization,electron-updater 在 Mac 上裝不上沒 notarize 的更新)。看到 toast 請手動到 [Releases](https://github.com/kailyn41291-del/ArenaCardGen/releases/latest) 下載新版 `.dmg`,並重新跑一次 `xattr -cr "/Applications/Arena Card Generator.app"` 清掉 quarantine。

可以在 Settings 裡按「檢查更新」手動觸發。

---

## 回報 Bug / 建議功能

- 🐛 [Bug Issue](https://github.com/kailyn41291-del/ArenaCardGen/issues/new?template=bug_report.md)
- ✨ [Feature Request](https://github.com/kailyn41291-del/ArenaCardGen/issues/new?template=feature_request.md)

⚠️ **安全問題請不要開 public issue** — 寄信到 `xypro.ai@gmail.com`,詳見 [.github/SECURITY.md](.github/SECURITY.md)。

---

## 開發者 / 想自己 build

詳見 [DEVELOPMENT.md](DEVELOPMENT.md)(架構導覽)+ [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)(PR 流程)。

```bash
git clone https://github.com/kailyn41291-del/ArenaCardGen.git
cd ArenaCardGen/app
npm install
npm run dev    # 啟動 esbuild watch + tailwind watch + Electron
```

CI 自動雙平台 build:`git tag vX.Y.Z && git push origin vX.Y.Z` → GitHub Actions 自動產 Win + Mac binary attach 到 release。

---

## License

[MIT](LICENSE) — 兩位 VJ(phang + kailyn)做的自用工具,公開分享給整個 VJ 圈子。歡迎 fork、改、商用。
