---
name: image-generation
description: PNG 字卡輸出規格。包含尺寸、檔名、字型、配色、透明背景、動態字級、Resolume Arena clip 工作流相關需求。新增/改動 `make_card` 渲染邏輯前必讀。
---

# Image Generation — Arena Card Generator

## 使用情境(影響所有規格決策)

字卡 PNG **不是直接投在 LED 牆**,而是匯入 **Resolume Arena**(VJ 軟體)當 **clip** 使用。VJ 在現場 trigger 這些 clip,Resolume 再把它們 composite 到主視覺上輸出。

這個事實決定了所有輸出規格:

1. **背景透明是常態** — VJ 要把字卡疊在背景視覺、影片、動態圖層之上。不透明背景反而是少數情況。
2. **檔名 = 排序依據** — Resolume 載入資料夾當 deck 時,clip 按**檔名字母順序**排列。`S01_` / `S02_` / `S03_` 這個 prefix pattern 就是為了保證載入後順序正確。
3. **文字色對比度** — 文字會被疊在任何顏色 / 動態背景之上,所以必須是**飽和、亮色系**(白、黃、粉、紅),不能用低對比的灰、藍、綠。
4. **解析度匹配 Resolume project** — 預設 1920×1080(Resolume 最常見的 project 解析度)。如果未來 project 改 4K,字卡也要 4K。
5. **不需動畫** — Resolume 自己會做 fade in/out,字卡只要靜態 PNG。

---

## 輸出規格

### 尺寸

```python
OUT_W, OUT_H = 1920, 1080   # main.py:7
```

- **格式**:1920 × 1080(16:9 Full HD)
- **單位**:像素
- **DPI**:無關緊要(PNG 只看像素)

如果未來要支援其他 project 解析度,改 `OUT_W` / `OUT_H` 即可,但 `make_card` 內部用比例算 padding(4%),所以**不需要寫死像素值的調整**。

### 檔名規則

格式:`<lines 用 _ 串起>.png`

實作在 [main.py:599](../../main.py:599):
```python
safe = "".join(c for c in "_".join(it["lines"]) if c not in r'\/:*?"<>|')
card.save(os.path.join(folder, f"{safe}.png"))
```

範例:
| `lines` | 檔名 |
|---|---|
| `["S01", "皮卡丘"]` | `S01_皮卡丘.png` |
| `["TALKING-1"]` | `TALKING-1.png` |
| `["轉場", "VCR"]` | `轉場_VCR.png` |
| `["Chaser~阿明"]` | `Chaser~阿明.png` |
| `["S02", "Don't Stop"]` | `S02_Don't Stop.png` |

⚠️ **目前的問題**(已知,未修):
- 檔名 sanitize 用**黑名單**(只剝 `\ / : * ? " < > |`),其他字元一律保留。
- `Don't Stop` 的單引號保留,Windows 容許但 macOS / Linux 在某些 shell context 會被當 quote
- 全形冒號 `:`、`?`、`*` **沒在黑名單**,Windows 會匯出失敗
- 空字串 lines 會產生 `.png`(無檔名)

**建議**(未實作):改用**白名單**,只保留:
```
\w  + 中文字  + 空格  + 底線  + 連字號 + 波浪符號
[a-zA-Z0-9一-鿿_\- ~]
```

### 為什麼用 `S01_` 而不是 `01_S01_`

VJ 工作流上,Resolume 的 clip 排序 = 檔名字母序。`S01_` 的 prefix 已經有遞增數字,字母排序自動正確。額外加流水號(例如 `01_S01_皮卡丘.png`)反而會讓檔名變醜。

但**注意**:當有 `Chaser~阿明.png`、`TALKING-1.png` 跟 `S01_皮卡丘.png` 並存時,Resolume 排序會是:

```
Chaser~阿明.png        # C 開頭
S01_皮卡丘.png         # S 開頭
TALKING-1.png          # T 開頭
轉場_VCR.png           # 中文比英文 ASCII 大
```

這不一定是 VJ 要的播放順序。**目前實作沒處理這個**,VJ 要在 Resolume 內手動拖動 clip 排序。

> 💭 **未來改進**:匯出時加可選的「流水號 prefix」(`01_S01_皮卡丘.png`、`02_轉場_VCR.png`),按 `App.items` 順序輸出。

---

## 字型

### 字型尋找邏輯

實作在 [main.py:67-77](../../main.py:67):

```python
def get_font_path():
    candidates = {
        "win32":  ["C:/Windows/Fonts/msjhbd.ttc",      # 微軟正黑體粗體
                   "C:/Windows/Fonts/msjh.ttc",         # 微軟正黑體
                   "C:/Windows/Fonts/arial.ttf"],       # arial(英文 fallback)
        "darwin": ["/System/Library/Fonts/PingFang.ttc",      # 蘋方
                   "/System/Library/Fonts/STHeiti Medium.ttc"], # 黑體
    }
    linux = ["/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc",
             "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"]
```

**設計原則**:**找系統內建的中文粗黑體**(在大畫面遠看才清楚)。

⚠️ **已知問題**:找不到時 fallback 到 `ImageFont.load_default()`,會渲染成 8pt 點陣字 — 在 1920×1080 上幾乎看不見。**這是 silent failure,Live show 場合會出包**。

**建議修法**(已記錄,未實作):
```python
def load_font(size_pt):
    if FONT_PATH:
        try: return ImageFont.truetype(FONT_PATH, size_pt)
        except Exception as e:
            raise RuntimeError(f"中文字型載入失敗: {FONT_PATH}: {e}")
    raise RuntimeError("找不到中文字型。請安裝 Noto Sans CJK 或微軟正黑體。")
```
配合 UI 端 `messagebox.showerror`。

### 字級 — 動態尋找

[main.py:107-115](../../main.py:107) 的演算法:

```
從 fs = 400pt 開始,每次減 2pt 試到 8pt
對每個 fs:
   line_h = 所有行的高度最大值
   gap = line_h * 0.15
   total_h = line_h * N + gap * (N-1)
   max_lw = 所有行的寬度最大值
   if max_lw <= avail_w(寬扣 4% padding) and total_h <= avail_h(高 90%):
      用這個 fs,END
```

行為特性:
- **單行短文字**:會放到很大(可能接近 400pt)
- **多行長文字**:逐步降到剛好放得下
- **單字超寬**(例如 30 個英文字一個單字):會降到 8pt 仍放不下,輸出小字(目前不再降)

> 💭 **可優化**:對極端 case(超寬單字)可以加「強制換行」邏輯,但目前 `auto_split` 已經把長標題拆過了,實務上少撞到。

### 字色

**現況**:固定白色 `#ffffff`。

**重設計方向**(兩位作者 2026-04-26 共識):
- preset:🔴 紅 / 🩷 粉 / 🟡 黃 / ⚪ 白(都亮色系,適合疊在動態背景上)
- 自訂:展開 RGB 滑桿
- **沒有黑** preset(VJ 不需要)

實作上 `make_card` 簽名要改:

```python
def make_card(lines,
              text_color="#ffffff",      # 文字色,預設白
              transparent=True,          # 預設透明(因應 Resolume clip 工作流)
              size=(OUT_W, OUT_H)):
    # bg 由 transparent 決定:
    #   True  → RGBA(0,0,0,0)   完全透明
    #   False → RGB(0,0,0)       純黑
    # text_color 是文字顏色(不再讀 RGB 滑桿)
```

呼叫端要更新 `_draw_preview`、`_do_export` 兩處。

---

## 背景

### 現況(複雜)

- RGB 滑桿(0-255 × 3)控制 `bg_color`
- 「透明背景 (PNG)」checkbox 控制 RGB / RGBA mode
- transparent=True 時忽略 bg_color,輸出 RGBA(0,0,0,0)
- transparent=False 時輸出 RGB(r,g,b)

### 重設計(簡化)

- **只有兩種模式**:`透明 / 不透明`
- 不透明 = 純黑 `#000000`(沒有可調整的選項)
- 預設應該是**透明**(因為 Resolume clip 工作流幾乎都用透明)

### Alpha 處理

實作 [main.py:97-103](../../main.py:97):

```python
if transparent:
    img = Image.new("RGBA", (w,h), (0,0,0,0))
    fg  = (255,255,255,255)
else:
    r=int(bg_color[1:3],16); g=int(bg_color[3:5],16); b=int(bg_color[5:7],16)
    img = Image.new("RGB", (w,h), (r,g,b))
    fg  = "#ffffff"
```

注意 RGBA mode 下 fg 是 4-tuple、RGB mode 下是 hex string,Pillow 兩種都接受。

> 💭 **小坑**:如果未來文字色加 alpha(例如半透明白字),`fg` tuple 第 4 個值要從 255 改可變。目前不需要。

---

## Padding 與留白

[main.py:94-96](../../main.py:94):

```python
pad = int(w * 0.04)      # 兩側 4% 邊距
avail_w = w - pad*2      # 可用寬 = 92%
avail_h = int(h * 0.90)  # 可用高 = 90%
```

實際數字(1920×1080):
- 左右各 76.8 px(取整 76)邊距 → 可用寬 1768 px
- 可用高 972 px(下方比上方留多一點;但實作只指定 `avail_h`,文字其實垂直置中)

**為什麼是 4% / 90%**:
- 4% 兩側留白避免文字貼邊(VJ 在 Resolume 內可能再縮放,留白給縮放後仍不超出)
- 90% 高度避免上下太擠(視覺呼吸感)

---

## 字卡內容結構(`lines`)

`make_card` 收一個 `lines` list,**每個元素是一行**,垂直堆疊置中。

### 一張字卡的常見結構

| 類型 | `lines` | 視覺 |
|---|---|---|
| 一般歌曲 | `["S01", "皮卡丘"]` | 兩行,編號小一點(實際是同字級因為動態尋找) |
| 含 feat. | `["S01", "皮卡丘", "ft.小火龍"]` | 三行 |
| 中文長標題 | `["S01", "前半字", "後半字"]` | 三行(由 `auto_split` 切) |
| 英文長標題 | `["S01", "First Half", "Second Half"]` | 三行 |
| TALKING | `["TALKING-1"]` | 單行 |
| 轉場 | `["轉場", "VCR"]` 或 `["轉場_娜娜KTV"]` | 兩行或一行 |
| Chaser | `["Chaser~阿明"]` | 單行 |

### `auto_split` 折行規則(摘要,完整見 [main.py:123-155](../../main.py:123))

- `feat.` / `ft.` 永遠抽出來獨立成最後一行
- 主標題:
  - 英文比例 > 40%:≤3 個單字不折,>3 個按單字數對半切
  - 中文 / 混合(英文比例 ≤40%):≤6 字不折,>6 字按字元數對半切

⚠️ **沒處理的 case**:
- 30+ 字的中文超長標題只折成 2 半,每半仍 15 字 — 動態字級會被迫降很低
- 1 個 30 字英文單字無法切(沒空格)— 同上

---

## Threading 與匯出

[main.py:587-602](../../main.py:587):

```python
def export_cards(self):
    folder = filedialog.askdirectory(...)
    threading.Thread(target=self._do_export, args=(folder,), daemon=True).start()

def _do_export(self, folder):
    total = len(self.items)
    tr = self.transparent.get()
    for i, it in enumerate(self.items):
        self.after(0, lambda n=i+1: self.set_st(...))
        card = make_card(it["lines"], bg_color=self.bg_color, transparent=tr)
        safe = ...
        card.save(...)
```

⚠️ **race condition**(已知,未修):
- worker thread 直接讀 `self.items`、`self.bg_color`,UI thread 還能改
- 跑 30 張字卡可能要 5-10 秒,中途使用者可能改順序、改顏色 → 結果可能混亂

**建議修法**:開始 export 前 snapshot:
```python
def export_cards(self):
    snapshot = {
        "items": [it.copy() for it in self.items],
        "transparent": self.transparent.get(),
        "text_color": self.text_color,   # 重設計後改名為 text_color
    }
    threading.Thread(target=self._do_export, args=(folder, snapshot), daemon=True).start()
```

---

## 改 `make_card` 時的標準流程

1. 改之前**先列出所有 caller**(目前 main.py 內有 `_draw_preview` + `_do_export`)
2. **改簽名是 breaking change** — 兩個 caller 都要改
3. 用一張字卡實際匯出測試,**用看圖工具(macOS Preview / Windows 看圖)**比對:
   - 1920×1080 大小正確
   - 透明背景在透明 viewer 看到棋盤格
   - 文字置中,padding 對稱
   - 各種字數的折行視覺仍 OK
4. 用 Resolume Arena(若有)實際載入測試 — clip 可正常 trigger
5. 確認**檔名**在 macOS / Windows / Linux 都不會 escape 失敗
