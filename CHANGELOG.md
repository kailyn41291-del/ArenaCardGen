# Changelog

格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

版本號:目前 pre-release(beta),`v0.3.0` stable 版發行前 UI / 功能可能變動。

---

## [Unreleased]

### Added
- `CHANGELOG.md` 從 v0.3.0-beta1 起記錄
- `.github/SECURITY.md`、`.github/CONTRIBUTING.md`、`DEVELOPMENT.md`(取代刪掉的舊 CLAUDE.md)
- `.gitattributes` 規範 LF 行尾,跨 Win/Mac contributor 不再撞 CRLF↔LF 翻轉
- README:Resolume Arena 接 PNG ZIP 流程 5 步教學
- README:badges 補完整(release / build status / platform / node / pre-release status / license)
- README:「不支援什麼」section,主動列出 PNG-only / 純色背景 / 無 OSC / 無跨機器同步
- README:pre-release(beta)警告
- feature_request issue template:加「使用場景」分類(演出前 / 中 / 後 / Resolume 整合)
- main.js:`sandbox: false` 加長 TODO comment 說明技術債

### Changed
- `package-lock.json`:565 個 URL 從 `npmmirror.com` 中國鏡像切回 `registry.npmjs.org` 官方,避免外部 contributor 被擋
- README macOS 安裝段:加「已損毀」警告的 xattr 指令 + 系統設定 GUI 兩種解法
- README FAQ「自動更新怎麼運作?」分 Win / Mac 寫,明確指出 macOS 沒做 notarization,toast 出現後仍要手動下載新 .dmg + xattr -cr
- DEVELOPMENT.md:加「macOS auto-update 限制」小節
- i18n zh-CN:在地化用詞修正(套用→应用 / 智慧解析→智能解析 / 文字色→文字颜色 / 已设定→已设置)

### Removed
- 舊 PyInstaller 殘留(`main.py` / `requirements.txt` / `pytest.ini` / `tests/` / `prototype/` / `build_mac.sh` / `build_windows.bat`),歷史保留在 `archive/python-v0` branch
- 舊 Python pytest workflow(`.github/workflows/test.yml`)
- 內部 Claude Code 設定(`.claude/`)+ 舊的 `CLAUDE.md`

---

## [v0.3.0-beta6] — 2026-04-27

### Added
- **In-app 自動更新流程**:右下 toast 不再點 Download 跳網頁,改成背景下載 + 進度條 + 「立即安裝」按鈕,點下去 app 重啟自動裝完(Windows)
- 5 個 update toast 狀態:`web`(瀏覽器 fallback)/ `available` / `downloading`(進度條)/ `downloaded`(立即安裝)/ `error`

### Fixed
- **同版本一直跳「v0.3.0-betaX 可下載」toast 的 race condition** — 啟動時 `appVersion` 還沒從 IPC 拿到真版本就跑 GitHub API 比對,導致拿 fallback `beta1` 跟 `beta5` 比 → 顯示 toast。修法:加 `versionLoaded` gate 等 IPC 回真版本才比;且 cmp ≤ 0 時主動清掉 stale toast。

### Notes
- macOS 因未做 Apple notarization,Tier 2 auto-install 不能用 — toast 出現後仍要手動到 Releases 下載新 `.dmg` + 跑 `xattr -cr`(下個 cycle 補 darwin 偵測 fallback)

---

## [v0.3.0-beta5] — 2026-04-27

### Added
- **4 種語言 UI**:English / 繁體中文 / 簡體中文 / 日本語,Header 設定按鈕旁有下拉選單,localStorage 記住語言
- **macOS ad-hoc codesign + hardened runtime**(`app/scripts/sign-mac.js` afterPack hook),修復 macOS 14+ 上「已損毀」打不開的問題
- 4 種語言切換覆蓋 header / footer / input panel / grid / Card / SettingsModal / DefaultPanel / CardEditPanel / BulkEditPanel / ParserModal / GeminiKeyRow / ExportChecklist / ExportProgress / UpdateToast / CrashScreen
- README + LICENSE + issue templates + 隱私警告(公開準備)
- Bundle 改 esbuild 取代 CDN(避免 supply chain attack)
- index.html 加 CSP

### Fixed
- React error #310:SettingsModal / ExportChecklist 的 hook order 問題
- macOS 14+ 上 hardened runtime 拒載沒簽名 Electron app 導致 crash 或顯示「已損毀」

### Notes
- 不付 Apple Developer($99/年)+ Microsoft EV Code Signing($300+/年),Win SmartScreen / Mac Gatekeeper 警告寫進 README + release notes 教學

---

## [v0.3.0-beta4] — 2026-04-27

### Added
- **匯出複選**:Export Checklist 加「全部 / 只選中」radio,選中模式時用原始 `idx` 當檔名前綴(beta3 之前會把選中的 1 / 3 / 5 號變成 1 / 2 / 3,跟 setlist 對不起來)
- **背景色設定**:全域 `bgColor` + 單卡 `bgOverride`(在「編輯字卡」面板)+ Bulk「套用背景色到全部」/「清除背景 override」
- **文字可見性檢查**:文字色跟背景色幾乎同色 → CardEditPanel 跳警告 + ExportChecklist 列警示
- **匯出失敗報告**:單張字卡 toBlob / canvas 失敗不再 silent drop,跳 dialog 列出哪些卡失敗

### Fixed
- 首次安裝啟動 crash:`DEFAULT_TEXT` 變數沒定義,啟動就白屏

---

## [v0.3.0-beta3] — 2026-04-27

### Added
- CI workflow `contents:write` 權限,讓 release upload 自動 attach binary
- CI 加從 git tag 同步 `package.json` version 的 step

### Fixed
- electron-builder build 找 `GH_TOKEN` 報錯(改 `--publish never`)
- PDF 上傳辨識失敗:用 PDF.js item 的 y 座標還原行結構,不再被一坨單行文字搞死 parser

---

## [v0.3.0-beta1] — 2026-04-26

### Added
- **首發版**:Electron + React + esbuild + tailwind 全套
- 字卡 grid 即時預覽 + 點卡片編輯個別屬性
- 多選(Ctrl+ click / Shift+ range)+ Bulk 編輯顏色 / 類型
- Drag-to-reorder 字卡順序
- Auto-save(localStorage)+ Undo / Redo(50 步歷史)
- PDF 上傳抽文字 → 餵 parser
- Gemini 智慧解析(用 `safeStorage` OS keychain 存 API key,不落 localStorage)
- 規則 parser:三層 fallback,處理雜亂 RD 切出 setlist
- 1920×1080 PNG 匯出 ZIP(JSZip)
- UUID-based stable card IDs(reorder 不會跑掉 override)
- Auto-update Tier 2(electron-updater + GitHub Releases manifest)
- GitHub Actions release workflow(push `v*` tag 自動雙平台 build)
- 4 種類型自動配色:歌曲=白 / TALK=黃 / 轉場=綠 / Chaser=紅

### Notes
- v0.3.0-beta2 沒實際 commit(tag 重打)

---

## Pre-history

beta1 之前的 Python tkinter 版本(v0.x)保留在 `archive/python-v0` branch。
