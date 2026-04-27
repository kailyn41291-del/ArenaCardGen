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

### macOS auto-update — 全平台 Tier 2,Mac 走 `.zip` 路徑

beta8 之前曾經試過 `.dmg`,撞 Gatekeeper 擋 `quitAndInstall`。beta8 先把 macOS Tier 2 整個停掉走 web mode toast。**beta9 起借用 LTCast pattern**:同時 ship `.dmg` + `.zip`,electron-updater 在 Mac 自動挑 `.zip` 下載解壓,在 ad-hoc 簽名兩邊一致下 Squirrel.Mac 允許 in-place replace,`quitAndInstall` 不會撞 Gatekeeper。

設定位置:
- `app/package.json` `mac.target`:`dmg` + `zip` 並存
- `app/electron/main.js`:autoUpdater 訂閱沒 platform gate,全平台跑
- `app/electron/preload.js`:`platform: process.platform` 仍暴露(以後若 .zip 路徑撞牆需要 fallback 用)
- `app/web/src/main.jsx`:`isElectronUpdate` 沒 darwin 例外

實際 user 流程(全平台一致):
- 啟動 5 秒後 autoUpdater 偵測新版 → toast 顯示「v0.3.0-betaX · 下載中」+ 進度條
- 下載完成 → toast 變「已下載,可安裝」+「立即安裝」按鈕
- 點立即安裝 → app 重啟自動裝完 → 開回新版

如果 macOS 上 `.zip` 路徑撞牆(`quitAndInstall` fail / Gatekeeper 擋解壓),`install-update-now` IPC handler 有 fallback:`shell.openExternal` 跳到 Releases 頁讓 user 手動抓。最差情況退化到 web 模式,不會卡死。

第一次裝 .dmg 仍要跑 `xattr -cr` 清 quarantine(這是 Gatekeeper 對「從瀏覽器下載」的旗標,跟 auto-update 內走的 .zip 路徑無關)。

## 已知技術債

- **`app/electron/main.js` 內 `sandbox: false`** — preload 需要 `require('fs')` 才寫得了 file。長期應改用 sidecar / IPC,讓 sandbox 回到 `true`。Tracking issue 待開。
- **重複內容的字卡 reorder 後 override** 用內容對齊,不保證跟 reorder 前完全相同(corner case)。
- **Auto-update path**:全平台走 Tier 2(electron-updater IPC + 進度條 + 立即安裝)。Mac 透過 `.zip` 解壓 + ad-hoc Squirrel.Mac in-place replace 繞過 Gatekeeper。Tier 1(GitHub API + web mode toast)只在純瀏覽器跑(沒 electronAPI)時用,作為 fallback。

## 跑 lint / 測試

目前沒設定。歡迎 PR。

## 安全問題回報

寄到 `xypro.ai@gmail.com`,詳見 [.github/SECURITY.md](.github/SECURITY.md)。
