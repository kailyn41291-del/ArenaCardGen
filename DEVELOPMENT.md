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

### macOS auto-update 限制

沒 notarize 的後果之一:**electron-updater 在 macOS 上不能完成自動安裝**。app 仍會跳 toast 提示新版可下載,但點「立即安裝」 macOS 端會擋(Gatekeeper 認為新檔是 unsigned 的 download)。

目前對 macOS user 的處理方式:
- toast 顯示「v0.3.0-betaX 可下載」(不顯示「下載中」進度條,因為實際沒在背景下載)
- 點 toast 跳轉到 GitHub Releases 頁,user 自己抓新 `.dmg`
- 安裝完跑 `xattr -cr` 一次

修這個唯一方法是付 Apple Developer Program 的 $99/年做 notarization。

## 已知技術債

- **`app/electron/main.js` 內 `sandbox: false`** — preload 需要 `require('fs')` 才寫得了 file。長期應改用 sidecar / IPC,讓 sandbox 回到 `true`。Tracking issue 待開。
- **重複內容的字卡 reorder 後 override** 用內容對齊,不保證跟 reorder 前完全相同(corner case)。
- **Auto-update Tier 1**(GitHub API 檢查 + web fallback)跟 **Tier 2**(electron-updater IPC)兩條 path 共存;electron 環境用 Tier 2,瀏覽器跑用 Tier 1。

## 跑 lint / 測試

目前沒設定。歡迎 PR。

## 安全問題回報

寄到 `xypro.ai@gmail.com`,詳見 [.github/SECURITY.md](.github/SECURITY.md)。
