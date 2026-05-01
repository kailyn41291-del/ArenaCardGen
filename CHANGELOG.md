# Changelog

格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

版本號:目前 pre-release(beta),`v0.3.0` stable 版發行前 UI / 功能可能變動。

---

## [Unreleased]

(無)

---

## [v0.3.0-beta18] — 2026-05-01

### Security
- **修 12 個漏洞**:Electron `33` → `41`(18 個高危 CVE 一次補)、electron-builder `25` → `26.9.0`(連帶 tar / @tootallnate/once / cacache 一次乾淨)。`npm audit` 從 `12 vulnerabilities (2 low, 10 high)` → `found 0 vulnerabilities`

### Changed
- 加 `build.toolsets.winCodeSign: "1.1.0"` 設定:electron-builder 26 推的新工具包(乾淨的獨立 zip,沒有舊 .7z 內含的 macOS symlink → 在 Windows 一般使用者權限下打包 NSIS 安裝包不再撞 symlink 解壓失敗)

### Known issue(升級副作用)
- **舊版加密的 Gemini API key 在 beta18 解不開**:Electron 大版本升級時 safeStorage 加密格式不相容(33 加密的密文 41 解不出來)。User 升上 beta18 後 SettingsModal 會看到 key 欄位空白,**重新貼一次** API key 即可。程式不會崩,只是 key 看起來不見

---

## [v0.3.0-beta17] — 2026-05-01

### Fixed
- **篩選後 Ctrl+A 還是會選到隱藏卡**(beta14 那次沒修透 — keydown handler 的 useEffect dependency 漏了 `cards` + `filterTypes`,closure 永遠抓初始版本的 selectAll)。這次 deps 補齊,真正修好

### Added
- **多選編輯加「回到預設類型」按鈕**(套用類型到全部下方):清掉 type override 後,卡片回到 setlist 文字推出來的原始類型(歌曲、轉場、Chaser 等)
- **匯出時可以選「直接字卡 / ZIP 打包」**:預設「直接字卡」走 native folder picker(Win Explorer / Mac Finder),PNG 一張張寫到 user 選的資料夾,完成後可一鍵打開資料夾。「ZIP 打包」沿用舊行為。瀏覽器版只能用 ZIP(直接字卡 disabled + 提示)
- 4 語言加 i18n key:`checklist.exportMode/modeFiles/modeZip/webOnlyZip`、`export.bodyFilesRunning/bodyFilesDone/btnRevealFolder`、`bulk.clearType`

### Changed
- `updateMultipleCards` 處理 `null` 值改成「刪除 override key」(讓 parsed 原值穿透),整個 override 清空時連 entry 一起刪(localStorage 不留空殼)
- 重新加回 `select-export-folder` / `write-png` / `reveal-folder` IPC handler(beta5 cleanup 時拿掉的,batch B 真的要用了)

---

## [v0.3.0-beta16] — 2026-05-01

### Added
- **Footer 版本號點擊觸發檢查更新**:右下角版本號變 button,點下去跑 GitHub Releases API 比對,旁邊 inline 顯示「檢查中… → ✓ 已是最新 / v0.3.0-betaX 可下載 / ⚠ 檢查失敗」狀態。3 秒後自動清掉(已是最新 / 失敗;有新版的話保持顯示讓 user 看見)。Hover 變色 + tooltip 提示「檢查更新」
- 不影響原本 SettingsModal 內「檢查更新」按鈕(兩個 entry point 共用同一個 `checkForUpdates` function)

---

## [v0.3.0-beta15] — 2026-05-01

### Fixed
- **PDF 上傳解析撞 `n.toHex is not a function` runtime error**:`pdfjs-dist@5.6.205` 在處理某些演唱會 RD PDF 時(實測:谢娜 2026 演唱會 RUNDOWN PDF,11 頁)worker 內部 minified code throw `toHex` undefined。升級到 `5.7.284`(本地 Node 直接跑同份 PDF 11 頁全通,8306 chars 抽出乾淨)
- 修法:`app/package.json` `pdfjs-dist` `^5.6.205` → `^5.7.284`,`package-lock.json` 對齊。`pdf.worker.min.mjs`(gitignored)CI build 時自動 copy 新版

---

## [v0.3.0-beta14] — 2026-04-27

### Fixed
- **filter on 時 Shift+click 範圍選取會把隱藏的卡也選進來**(bug):user 把 filter 設成只顯示「歌曲」,然後 shift-click 範圍選取,中間被 filter 隱藏的 TALK / 轉場 / Chaser 卡也會進 selectedIds。bulk apply 顏色 / 類型時影響到 user 看不到的卡,deselect / 取消 filter 後才發現「中間那些卡也變色了」
- 修法:`handleCardClick` 範圍選取迴圈內加 `filterTypes.has(c.type)` check,只加目前 filter 顯示的卡
- `selectAll`(Ctrl+A)同步修:只選 filter 顯示中的卡(同邏輯)

---

## [v0.3.0-beta13] — 2026-04-28

### Changed
- **Releases 頁排版改造**:`.github/workflows/release.yml` 加 "Generate release body" step,push tag 自動產 release notes,頂端釘 3 個顯眼下載連結(Win Setup / Mac arm64 / Mac Intel),其它 `.zip` / `.blockmap` / `.yml` / portable `.exe` 收進 `<details>` 摺疊。**user 第一眼從「13 個檔案不知道點哪個」變「請選你的平台」3 選 1**;build artifacts 一個都沒砍(portable + auto-update infra 全留)

### Notes
- 是 Win + Mac runner heredoc body 對齊驗證 target(兩邊各產一份相同 body,後寫者覆蓋,看 GitHub release 頁 user 視角是不是真的乾淨了)

---

## [v0.3.0-beta12] — 2026-04-27

### Changed
- **CI release upload 永遠不標 prerelease + 一律 `make_latest: true`**:原因是 electron-updater 走 GitHub `/releases/latest` API,該 endpoint 只回 `isPrerelease=false` 的 Latest release。我們的 `betaN` 是 release name convention,不是「未公開」狀態,故一律標 stable + Latest 讓 auto-update 通

---

## [v0.3.0-beta11] — 2026-04-27

### Fixed
- **`allowPrerelease=true` 觸發 electron-updater channel parse bug** → 改回 `false`。betaN 即使被 GitHub API 認成 Latest,也不要走 prerelease channel 邏輯

---

## [v0.3.0-beta10] — 2026-04-27

### Added
- **`install-update-now` IPC handler 加 fallback**:`autoUpdater.quitAndInstall()` 失敗時(Win 下例如權限 / 防毒擋安裝程式),自動 `shell.openExternal` 跳到 GitHub Releases 頁,user 仍能手動下載最新安裝程式。借用 LTCast pattern,雙保險

### Changed
- README + DEVELOPMENT.md 對齊 beta9 起「全平台 Tier 2,Mac 走 .zip 路徑」(原本還停在 beta8 「macOS 完全停用 Tier 2」過時說法)
- README FAQ「自動更新怎麼運作?」改寫成全平台一致流程 + 給 beta1~beta6 user 升級指引

### Notes
- 是 Mac 端 e2e 驗證 target(從 beta9 升 beta10 走 .zip 路徑,看 quitAndInstall 是否真能 in-place replace .app)

---

## [v0.3.0-beta9] — 2026-04-27

### Added
- **macOS in-app auto-update 重新啟用**:借用 LTCast pattern,Mac 走 `.zip` 而不是 `.dmg`。`app/package.json` `mac.target` 加 `zip` 跟 `dmg` 並存,electron-builder 同時 ship 兩種,electron-updater 在 Mac 自動挑 `.zip` 下載解壓。在 ad-hoc 簽名兩邊一致下,Squirrel.Mac 允許 in-place replace,`quitAndInstall` 不會撞 Gatekeeper

### Changed
- 撤掉 beta8 的 `process.platform === 'darwin'` Tier 2 platform gate(全平台統一走 Tier 2 IPC + toast 進度條 + 立即安裝流程)
- `app/electron/preload.js` 跟 `app/web/src/main.jsx` 對應撤掉 darwin 例外

### Notes
- 若 Mac 端真的撞牆(quitAndInstall 失敗 / Gatekeeper 擋 .zip 解壓),beta10+ revert 回 beta8 platform gate 邏輯
- **beta1~beta6 user 注意**:你們裝的版本撞 URL 不對盤 bug 卡住,自動更新走不通。請手動到 Releases 下載 beta9 安裝程式蓋過去,之後 release 自動更新就會跑

---

## [v0.3.0-beta8] — 2026-04-27

### Fixed
- **macOS 完全停用 Tier 2 auto-update**,只用 Tier 1 web mode toast。beta6/7 在 macOS 上的 in-app 流程是壞的:autoUpdater 假裝在背景下載 + 顯示進度條 + 「立即安裝」按鈕,但 `quitAndInstall()` 因沒 Apple notarization 被 Gatekeeper 擋,實際無效;下載階段還會在 `~/Library/Caches/arena-card-gen-updater/` 留半成品垃圾。修法是 `app/electron/main.js` `process.platform === 'darwin'` 整個 skip autoUpdater 訂閱,讓 renderer 的 Tier 1 接手 → toast 出現「v0.3.0-betaX 可下載 / Download」,點 Download 開新分頁到 release 頁。

### Changed
- `DEVELOPMENT.md`「macOS auto-update」段對齊新行為,從「不能自動安裝」改寫為「完全停用 Tier 2」+ 三處實作位置註解
- `app/electron/preload.js`:暴露 `platform: process.platform` 給 renderer 識別

### Notes
- Windows / Linux 不受影響(Tier 2 完整流程)
- 修這個讓 macOS 也走 Tier 2 的唯一方法仍是付 Apple Developer Program $99/年做 notarization

---

## [v0.3.0-beta7] — 2026-04-27

### Fixed
- **Auto-update 整個壞了**(critical,beta1~beta6 全中招):electron-builder 預設行為下,實際檔名(`Arena.Card.Generator-...dmg`)跟 `latest.yml` / `latest-mac.yml` 內 URL(`Arena-Card-Generator-...dmg`)不對盤,electron-updater fetch 一律 404。修法:`app/package.json` 加 `artifactName` 強制連字號,讓 yml URL 跟檔名用同一 template

### Changed
- 檔名格式從 `Arena.Card.Generator-...` 換成 `Arena-Card-Generator-...`(連字號取代點)。`productName` 仍是「Arena Card Generator」(顯示給 user 看的 app 名稱、Applications 內的圖示 label),不變

### Notes
- beta5 / beta6 user 升 beta7 一次後,後續 auto-update 才會通(以前路徑是壞的)
- 新 user 直接下載 beta7 沒影響

---

## [Repo cleanup pre-public]

公開到 VJ 圈前的 audit cleanup,沒對應單一 release tag:

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
- ParserModal:智慧/智能解析首次使用加 explicit consent dialog(localStorage flag `arena-cardgen-gemini-warned` 記住)

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
