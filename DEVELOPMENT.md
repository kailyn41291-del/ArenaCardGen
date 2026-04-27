# Development Notes

## 架構

- `app/electron/` — Electron main process / preload(IPC bridge,暴露 `electronAPI` 給 renderer)
- `app/web/src/` — React app(JSX + tailwind),由 esbuild bundle 到 `app/web/dist/`
  - `main.jsx` — 主視窗 + 所有 React 元件(目前單檔)
  - `i18n.jsx` — 4 語言字典(en / zh-TW / zh-CN / ja)+ `useT()` hook + `LangPicker`
  - `input.css` — tailwind entry
- `app/build/` — electron-builder 設定(`entitlements.mac.plist` 等)
- `app/scripts/` — build 時 hook(`sign-mac.js` 跑 ad-hoc codesign)
- `assets/` — icon / logo
- `.github/workflows/release.yml` — push tag `v*` 自動雙平台 build

## 啟 dev mode

```bash
cd app
npm install
npm run dev
```

`npm run dev` 同時跑 esbuild watch + tailwind watch + Electron,程式碼改動即時 reload。

## macOS 簽名

只做 ad-hoc codesign(無 Apple Developer ID)— 因 Apple Developer Program $99/年成本未付。

`app/scripts/sign-mac.js` 是 electron-builder 的 `afterPack` hook,build 時對 `.app` 跑 `codesign --force --deep --sign - --options runtime --entitlements ...`,讓 macOS 14+ 的 hardened runtime 不會直接 crash。

User 第一次安裝要手動跑 `xattr -cr "/Applications/Arena Card Generator.app"` 清除 quarantine 旗標,或用系統設定「隱私權與安全性」按「仍要打開」。詳見 README。

### macOS auto-update — 完全停用 Tier 2

沒 notarize 的後果:**electron-updater 在 macOS 上不只 install 會被擋,連 download 階段都會在 `~/Library/Caches/arena-card-gen-updater/` 留半成品垃圾檔**。所以 v0.3.0-beta8 起 macOS 完全停用 Tier 2,只用 Tier 1。

實作位置(三個檔案要一起改才不會 IPC 事件孤兒):
- `app/electron/main.js`:`if (!isDev && process.platform !== 'darwin')` 圍住整個 autoUpdater 訂閱 + `checkForUpdates()`,darwin 上連 listener 都不掛
- `app/electron/preload.js`:暴露 `platform: process.platform` 給 renderer 識別
- `app/web/src/main.jsx`:`isElectronUpdate` 多一個 `&& platform !== 'darwin'` gate,darwin 上 fall through 到 Tier 1 的 GitHub API check

實際 macOS user 看到的:
- 啟動 5 秒後 renderer fetch GitHub Releases API → toast 顯示「v0.3.0-betaX 可下載 / Download」
- 點 Download → 開新分頁到 release 頁 → user 自己抓新 `.dmg`
- 安裝後跑 `xattr -cr` 一次

Windows / Linux 不受影響(Tier 2 完整流程):背景下載 + 進度條 + 「立即安裝」按鈕 → app 重啟自動裝完。

修這個讓 macOS 也走 Tier 2 的唯一方法是付 Apple Developer Program 的 $99/年做 notarization,目前 trade-off 不付。

## 已知技術債

- **`app/electron/main.js` 內 `sandbox: false`** — preload 需要 `require('fs')` 才寫得了 file。長期應改用 sidecar / IPC,讓 sandbox 回到 `true`。Tracking issue 待開。
- **重複內容的字卡 reorder 後 override** 用內容對齊,不保證跟 reorder 前完全相同(corner case)。
- **Auto-update 三條 path**:Tier 1(GitHub API check + web mode toast,瀏覽器 + macOS 用)/ Tier 2(electron-updater IPC + 進度條 + 立即安裝,Windows + Linux 用)。macOS 因 Apple notarization 缺,Tier 2 完全停用走 Tier 1。

## 跑 lint / 測試

目前沒設定。歡迎 PR。

## 安全問題回報

寄到 `xypro.ai@gmail.com`,詳見 [.github/SECURITY.md](.github/SECURITY.md)。
