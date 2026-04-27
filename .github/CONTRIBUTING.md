# Contributing

歡迎 PR!幾個簡單原則。

## 開發環境

需要 Node.js 18+,macOS build 額外要 Xcode Command Line Tools。

```bash
git clone https://github.com/kailyn41291-del/ArenaCardGen.git
cd ArenaCardGen/app
npm install
npm run dev    # 啟動 esbuild watch + tailwind watch + Electron
```

## Build

```bash
npm run build:win    # Windows
npm run build:mac    # macOS(產出 ad-hoc 簽名 .dmg)
```

產物在 `app/dist/`。

## PR 流程

- Fork → 開分支 `fix/xxx` 或 `feat/xxx`
- 一個 PR 一件事,description 寫清楚動機跟測試方法
- Commit 訊息用繁中,格式 `type: 簡述`(type = `feat` / `fix` / `docs` / `build` / `chore` / `refactor` / `style` / `test`)
- 改 UI 請附截圖,改 RD parser 請附測試 case

## 安全問題

請不要開 public issue,寄信到 `xypro.ai@gmail.com`。詳見 [SECURITY.md](SECURITY.md)。

## Release

由 maintainer 負責。push tag `v*` 觸發 GitHub Actions 自動 build 雙平台 binary。
