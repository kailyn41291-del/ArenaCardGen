---
name: release-workflow
description: Arena Card Generator 打包與 release 流程。包含 PyInstaller 設定、版本號規則、release notes 格式、Windows / macOS 兩平台 build 步驟、常見打包問題排除。
---

# Release Workflow — Arena Card Generator

## 打包工具

**PyInstaller** ≥ 6.0.0(已寫在 [requirements.txt](../../requirements.txt))。

兩個現成腳本:
- [build_windows.bat](../../build_windows.bat) — Windows
- [build_mac.sh](../../build_mac.sh) — macOS(Intel / Apple Silicon 都跑得動)

## 打包指令(展開)

兩個腳本內部都跑同一條:

```bash
pyinstaller --onefile --windowed \
  --name "Arena_titlecard_gen" \
  --hidden-import PIL \
  --hidden-import PIL._tkinter_finder \
  --hidden-import tkinter \
  main.py
```

各 flag 意義:
- `--onefile` — 全部打包成單一執行檔(方便傳檔,啟動較慢但可接受)
- `--windowed` — 沒有 console 視窗(Windows .exe 不會跳黑窗;macOS 直接是 .app bundle)
- `--name "Arena_titlecard_gen"` — 輸出檔名
- `--hidden-import PIL` — Pillow 的子模組 PyInstaller 找不到,要明確宣告
- `--hidden-import PIL._tkinter_finder` — Pillow 跟 tkinter 整合的橋接模組(`ImageTk` 用)
- `--hidden-import tkinter` — 標準函式庫但 PyInstaller 有時不抓進去

## 輸出位置

| 平台 | 輸出檔 | 大小(估) |
|---|---|---|
| Windows | `dist/Arena_titlecard_gen.exe` | 30-50 MB |
| macOS | `dist/Arena_titlecard_gen` 或 `dist/Arena_titlecard_gen.app` | 30-50 MB |

打包完會留下:
- `build/` — PyInstaller 中間產物(可刪)
- `dist/` — 最終執行檔(這個是要的)
- `Arena_titlecard_gen.spec` — 描述如何打包的 spec 檔(可保留以備重 build,目前不 commit)

> ✅ 這些都已在 `.gitignore` 排除。

---

## 平台相依問題與解法

### Windows

**常見問題**:
1. **PyInstaller 找不到 Python** — 確認 `python` 是 3.10+,且 `pip install -r requirements.txt` 有跑成功
2. **打包成功但執行時跳「找不到 PIL」** — `--hidden-import` 沒寫對。確認 build script 內三條 hidden-import 都在
3. **字卡顯示為小字 / 亂碼** — 系統缺 `msjhbd.ttc` / `msjh.ttc`(極少見;通常 Windows 都有)。**這是 silent failure**,要看 [main.py:67-77](../../main.py:67) 修法

### macOS

**常見問題**:
1. **「無法開啟,因為來自身分不明的開發者」** — Gatekeeper 擋。VJ 自用解法:右鍵 .app → 「打開」→「仍要打開」。如果未來分發給更多人要做 codesign / notarize(目前不做)
2. **Apple Silicon 跑不動 Intel build / 反之** — PyInstaller 預設只 build 當前架構。如果朋友用 M1、你用 Intel,各自 build 各自的
3. **`PingFang.ttc` 找不到** — macOS 13+ 字型路徑可能變,需要更新 [main.py:67-77](../../main.py:67) 的 candidates list

### 跨平台

1. **Pillow 版本** — `Pillow >= 10.0.0` 是因為較舊版本有 `textbbox` 不存在的問題
2. **Python 版本** — 沒明確鎖定,但 3.10+ 較安全(f-string、type hint、tkinter 都比較穩定)

---

## 版本號規則

採 **Semantic Versioning(SemVer)**:`MAJOR.MINOR.PATCH`

| 部分 | 何時 +1 |
|---|---|
| `MAJOR` | 不相容的大改動(例如:UI 重設計、設定檔格式換、PNG 輸出格式改) |
| `MINOR` | 新功能但相容(例如:RD parser 多支援一種格式、新匯出選項、UI 微改) |
| `PATCH` | bug fix / 文件更新 / 內部 refactor / 不影響使用者 |

**從 `0.1.0` 起算**(目前 repo 沒有版本標記,初始版本即 `0.1.0`)。

`1.0.0` 的 milestone:**兩位作者都覺得「拿這個版本給陌生 VJ 用沒問題」之後**,才升 `1.0.0`。在那之前都是 `0.x.y`。

### 怎麼標版本

用 git tag:

```bash
# 在 main 分支上,該版本最終 commit 確定後
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

⚠️ **不要在版本號加前綴 `release/` 或 `version/`**,純粹 `v` + SemVer。

### 版本號要寫進 code 嗎?

**目前還不用**(兩人專案,看 git tag 就知道)。

未來如果要,放在 [main.py](../../main.py) 開頭:
```python
__version__ = "0.2.0"
```
然後在主視窗 title bar 顯示:
```python
self.title(f"Arena Title Card Generator v{__version__}")
```

---

## Release Notes 格式

每次 tag 一個版本,都應該寫 release notes。**用繁體中文**,放在 GitHub Release 描述、或 commit message body。

### Template

```markdown
# v0.2.0 — <主題,例如:RD parser 增強>

發布日期:2026-04-26

## 新功能(feat)

- **<簡短標題>** — <詳細描述,以 VJ 使用情境為主,不是技術細節>
- ...

## 修正(fix)

- **<簡短標題>** — <什麼情境會撞到這個 bug,修了之後行為如何>
- ...

## 內部改動(refactor / chore)

- ...

## 已知限制 / 待修

- <繼承自上版本的 known issues,或本版發現但決定下版再修的>

## 升級注意事項

- <如果有 breaking change 或需要使用者重新匯出字卡,這裡寫清楚>
- 沒有的話寫「無」
```

### 範例

```markdown
# v0.2.0 — RD parser 強化 + 匯出穩定性

發布日期:2026-05-15

## 新功能

- **轉場 + VCR 複合標籤** — 現在支援 `轉場VCR 02` 這種寫法,辨識為「轉場_VCR 02」
- **匯出對話框記住上次資料夾** — 不用每次從 home 開始選

## 修正

- **匯出 30+ 張字卡時順序錯亂** — 工作執行緒讀取 self.items 沒做 snapshot,改顏色 / 改順序會混到。改 export 開始時 freeze 一份 snapshot
- **檔名含全形冒號在 Windows 失敗** — 之前 sanitize 黑名單只排半形,改成白名單

## 內部改動

- 把 `clean()` 函式內的舞台關鍵字 inline regex 抽成 `STAGE_NOISE_KEYWORDS` 常數

## 已知限制

- 字型 fallback 仍是 silent failure(下版處理)
- 沒有 auto-save(下版處理)

## 升級注意事項

- 無
```

---

## Release 流程(建議走這個順序)

```
1. 在 feature branch 上開發 + PR
2. PR merge 到 main
3. 累積一陣子(沒有固定 cadence,看有意義的功能集到一起)
4. 在 main 上跑兩個平台的 build,確認:
   - 兩個平台都能成功打包
   - 打包出來的執行檔可開啟
   - 主功能 smoke test 通過(貼一份 RD 進去 → 匯出字卡 → 看 PNG 對的)
5. 寫 release notes(放 commit message 或 GitHub Release)
6. git tag v0.X.Y
7. git push origin v0.X.Y
8. 把 dist/ 內的執行檔上傳到雙方共用儲存(Drive / Dropbox / iMessage)
9. 兩人確認新版能用
```

---

## 不在這份 skill 範圍內

- ❌ 不上 GitHub Releases 自動 build(目前手動 build,不需要 CI)
- ❌ 不做 auto-update(VJ 自用,手動換版本即可)
- ❌ 不做 macOS codesign / notarize(自用,Gatekeeper 右鍵打開即可)
- ❌ 不打包 Linux(目前無 Linux 用戶)

如果未來要做這些,各自開新章節或新 skill。
