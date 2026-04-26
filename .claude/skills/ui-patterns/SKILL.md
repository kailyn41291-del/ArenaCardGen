---
name: ui-patterns
description: Arena Card Generator 的 UI 慣例 — 顏色、字型、layout、互動規則。包含現況快照(目前 tkinter 實作)、已知 UX 痛點、與兩位 VJ 達成共識的重設計方向。新增任何 UI 元件前先讀這份。
---

# UI Patterns — Arena Card Generator

這份文件分三層,**讀的時候搞清楚自己在哪一層**:

1. **現況快照** — 目前 tkinter UI 實作,改之前要懂
2. **已知 UX 痛點** — 兩位作者已認知的問題,記錄不修
3. **重設計方向** — 跟兩位作者達成共識的目標,新功能往這個方向做

---

## Layer 1:現況快照

### 顏色常數

定義在 [main.py:339-348](../../main.py:339)。新增 UI 元件**只能用這些常數**,不要 inline hex。

| 常數 | 值 | 用途 |
|---|---|---|
| `BG`  | `#0a0a0a` | 主背景(右側預覽區) |
| `S1`  | `#111111` | sidebar / panel 背景 |
| `S2`  | `#181818` | input / button 背景(預設) |
| `S3`  | `#202020` | hover / active 背景 |
| `BD`  | `#2a2a2a` | 分隔線 |
| `TX`  | `#ececec` | 主文字色 |
| `TX2` | `#7a7a7a` | 次文字色(label / placeholder) |
| `TX3` | `#444444` | 弱文字色(說明 / disabled) |
| `AC`  | `#4ade80` | 強調色(亮綠 — 主按鈕、強調文字、聚焦邊框、聚焦游標) |
| `AC2` | `#22c55e` | 強調色 hover(深綠) |

額外用過的顏色(非主色,僅特定情境):
- `#ff6b6b`(R 滑桿 label)、`#6bff8e`(G 滑桿 label)、`#6b9fff`(B 滑桿 label)
- `#f87171`(錯誤訊息)、`#60a5fa`(loading 訊息)
- `#0a1a0a`(辨識結果 textbox 深綠底)
- `#000`(主按鈕黑字)

### 字型

統一兩種:
- **介面字**:`("Helvetica", N)` — 標題、按鈕、label。根據層級用 9 / 10 / 11 / 12 / 14 / 15 等大小
- **monospace**:`("Courier New", N)` — 文字輸入框、辨識結果、格式範例

字卡渲染另用系統粗體中文字(見 [image-generation/SKILL.md](../image-generation/SKILL.md))。

### Layout 規則

主視窗(`App`):兩欄式
- **左欄(290px 固定寬)**:logo + 格式提示 + 歌單輸入 + 生成按鈕 + 字卡列表 + 顏色控制 + 匯出按鈕
- **右欄(自適應)**:預覽 canvas + 編輯 row(僅選取時顯示)

辨識器子視窗(`ParserWindow`):兩欄式
- **左欄**:貼 RD 文字框
- **右欄**:辨識結果(深綠底凸顯)
- 底部:辨識按鈕 + 匯入按鈕 + 清除 + 繁簡切換 + 狀態 label

**留白規則**:
- 主視窗 frame 內 `padx=14, pady=10`
- 元件之間 `pady=(8, 0)` 或 `pady=(10, 0)` (視層級)
- 區塊分隔用 `tk.Frame(bg=BD, height=1)`(1px 線)

### 互動慣例

- **主行動按鈕**:`bg=AC, fg="#000", font=(..., bold), activebackground=AC2`
- **次行動按鈕**:`bg=S2, fg=TX (or TX2), activebackground=S3`
- **輸入框聚焦**:`highlightthickness=1, highlightcolor=AC`
- **游標色**:`insertbackground=AC`(亮綠游標,在深底特別好認)
- **disabled 狀態**:`state="disabled"`,沒有 hover 變色
- **執行緒匯出**:用 `threading.Thread(daemon=True)` + `self.after(0, ...)` 把結果 marshall 回 UI thread

### 狀態訊息(`set_st`)

定義在 [main.py:604-606](../../main.py:604):
```python
c={"ok":AC,"err":"#f87171","loading":"#60a5fa","":TX3}
```

| level | 顏色 | 用途 |
|---|---|---|
| `ok` | 亮綠 | 成功 — 例如「✓ 已生成 N 張字卡」 |
| `err` | 紅 | 錯誤 — 例如「請先輸入歌單文字」 |
| `loading` | 藍 | 進行中 — 例如「匯出中 5/30...」 |
| `""` | 灰 | 中性訊息或清空 |

---

## Layer 2:已知 UX 痛點(已記錄,未修)

按嚴重性排。**新功能不要繞過這些已知問題的根因,但也不要在不相關的 PR 順手修**。

### 🔴 Live 場合會出事

1. **「生成字卡」會吃掉所有編輯**
   `App.generate()` ([main.py:506-516](../../main.py:506)) 直接覆寫 `self.items`。VJ 改了 30 張字卡的 typo,手滑按一下,**全毀**。沒 confirm dialog,沒 merge 模式。

2. **沒有 auto-save**
   全部狀態在記憶體。Crash / 不小心關閉 / 系統重啟 = 重做。

3. **匯出 thread race condition**
   `_do_export` ([main.py:593-602](../../main.py:593)) worker thread 在跑 N 秒,UI 還能繼續改 `self.items` / `self.transparent` / `self.bg_color`,結果可能混到。

4. **預覽不完整反映匯出狀態**
   透明背景 checkbox 不會在預覽顯示棋盤格,匯出才看到。

### 🟡 中 ROI

5. **沒有排序功能** — 改順序唯一方法是修主視窗 raw 文字 + 重按生成 → 編輯歸零(連動 #1)
6. **沒有 undo / redo** — list 動作(刪除、改類型、改 lines)無法復原
7. **批次選取做不到** — 想一次改 5 張的類型 / 顏色,不行
8. **「貼 RD 不覆蓋」做不到** — 加歌只能整個重貼
9. **編輯區跟預覽分離** — 編輯 entry 在預覽下方一條細 row,視覺不連動

### 💭 細節

10. RGB 滑桿對 VJ 過度精細(實際只用幾個常用色)
11. 匯出對話框沒記住上次資料夾
12. 缺鍵盤 shortcut(`Delete` 刪卡、`Alt+↑/↓` 移動順序、`Ctrl+D` 複製)

---

## Layer 3:重設計方向(兩位作者 2026-04-26 共識)

> **這是目標,不是現況**。新 UI 改動往這方向走;不在這份方向內的舊行為要移除前先問。

### 互動模型(根本性改動)

- **「生成字卡」這個動詞消失** — 列表改 = 字卡改,沒有兩階段
- **列表 = 編輯** — 點開一列就在原處 inline 編輯,不要再有底部 row
- **拖曳排序** — 列表項目左側 `⋮⋮` 抓手,可拖移
- **「貼 RD」變成 modal** — 點按鈕彈窗,可選「取代既有 / 附加到後面」
- **預覽永遠對應當前選取** — 改字立刻動(現有的 `_live_preview` 邏輯保留)
- **Ctrl+Z 統一 undo** — 刪除 / 改字 / 拖曳排序都能撤銷
- **`+ 加一張`** 按鈕直接新增空白卡,不需重貼

### 顏色模型(簡化)

**現在**:背景 RGB 滑桿(0-255 × 3),文字固定白色

**新**:
- **文字色 preset**:🔴紅 / 🩷粉 / 🟡黃 / ⚪白 — 點一下切換(都是亮色系,適合在大螢幕上凸出)
- **文字色「自訂」** — 展開才出現完整 RGB 滑桿
- **背景**:只有 `透明 / 不透明` 二選一(不透明 = `#000000` 純黑)
- **不要黑色 preset**(VJ 不需要)

實作上,`make_card()` 簽名要改:
```python
def make_card(lines, text_color="#ffffff", transparent=False, size=(OUT_W, OUT_H)):
    # bg 由 transparent 決定:True → RGBA(0,0,0,0),False → RGB(0,0,0)
    # text_color 是文字顏色
```

### 排版改動

```
┌────────────────────────────────────────────────────────────────────┐
│ [📋 從 RD 解析…]  [+ 加一張]            [💾 匯出全部]              │
├──────────────────────────────┬─────────────────────────────────────┤
│  歌單(可拖曳排序)          │  即時預覽                          │
│ ─────────────────────────────│ ┌─────────────────────────────────┐ │
│ ⋮⋮ ♪ ▸ S01 │ 皮卡丘    🗑   │ │           S01                  │ │
│ ⋮⋮ ★ ▸ TALKING-1       🗑   │ │           皮卡丘                │ │
│ ⋮⋮ → ▸ 轉場_VCR        🗑   │ └─────────────────────────────────┘ │
│ ⋮⋮ ♪ ▾ S02 │ 小火龍    🗑   │ 文字色:●白 ○紅 ○粉 ○黃 ○自訂    │
│      ┌──────────────────┐    │ 背景:●不透明  ○透明                │
│      │ 行內容(用|分行)│    │                                     │
│      │ S02|小火龍       │    │                                     │
│      │ 類型 [song ▾]   │    │                                     │
│      └──────────────────┘    │                                     │
│ ⋮⋮ ◉ ▸ Chaser~阿明     🗑   │                                     │
└──────────────────────────────┴─────────────────────────────────────┘
```

### 重設計優先順位(待兩位作者最終確認)

| # | 改動 | 影響範圍 | 優先 |
|---|------|---------|------|
| 1 | auto-save / 啟動恢復 | 新增獨立模組 | 🔴 高 |
| 2 | 匯出 snapshot 修 race | 改 `_do_export` 內幾行 | 🔴 高 |
| 3 | 字型 fallback fail loud | 改 `load_font` + UI alert | 🔴 高 |
| 4 | Layout 政策(thumbnail 可讀性) | 改 `make_card` + `auto_split` | 🔴 高 |
| 5 | 拖曳排序 | 列表元件大改 | 🟡 中 |
| 6 | 文字色 preset 化簡 | 改 `make_card` + UI | 🟡 中 |
| 7 | List inline 編輯(取代底部 row) | UI 中改 | 🟡 中 |
| 8 | 「生成字卡」改為 incremental | 改互動模型 | 🟡 中 |
| 9 | Ctrl+Z undo stack | 新模組 | 💭 低 |
| 10 | 鍵盤 shortcut | 散在各 binding | 💭 低 |

### tkinter 還是換框架?

**結論**:**先 tkinter 內試**(#1-#7 都做得到),做完還是覺得卡再考慮換 PySide6。

理由:
- 拖曳排序 tkinter 要自己刻(半天),Qt 一行就好(0 分鐘) — 但目前不夠痛
- Undo stack tkinter 要自己刻(一天),Qt 內建 `QUndoStack`
- 跨平台打包 tkinter 不用配置,Qt 要加 hidden imports(已知煩)

如果未來 #4 + #8 + 更多複雜互動同時要做,**那時**再評估換框架。

---

## 規則

### 新增 UI 元件時

1. **顏色用 Layer 1 的常數**,不要 inline hex
2. **字型用 Helvetica + Courier New 兩擇一**,不要混入第三種
3. **layout 跟 padx=14, pady=10 對齊**,別搞獨立尺寸
4. **狀態 / 訊息走 `set_st`**,不要新增其他訊息機制
5. **加 thread 任何操作要 snapshot 共享狀態**(見 #2 已知痛點)

### 重設計改動時

1. **每個改動 PR 解決 Layer 3 表格中的一行**,不要一次塞兩三件
2. **改動前如果觸碰 Layer 2 的痛點,在 PR 描述明確說明**(這個 PR 是不是同時解決了痛點 #X?)
3. **改 `make_card` 簽名是 breaking change** — 要找出所有 caller(目前 main.py 內有 `_draw_preview` + `_do_export` 兩處呼叫)
4. **新介面元件先在 [.claude/skills/ui-patterns/SKILL.md](SKILL.md) 補充用法**,再進 main.py
