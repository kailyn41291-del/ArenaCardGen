# Arena Title Card Generator

> 演唱會字卡生成器 — 把雜亂的 RD(rundown)歌單轉成 1920×1080 的 PNG 字卡,給 VJ 在演出時用。

## 專案目的

兩位 VJ 自用工具,實際在演唱會現場使用。輸入「貼上整份雜亂 RD」→ 自動辨識排序 → 一鍵匯出 N 張 1920×1080 字卡 PNG。

## 技術棧

- **Python 3**(無框架版本鎖定,但 3.10+ 比較安全)
- **GUI**:`tkinter` + `tkinter.ttk`(Python 內建)
- **圖像**:`Pillow (PIL) >= 10.0.0`(`Image` / `ImageDraw` / `ImageFont` / `ImageTk`)
- **打包**:`PyInstaller >= 6.0.0`(`--onefile --windowed`)
- **跨平台**:Windows / macOS / Linux(字型 fallback 各自找)
- **無外部服務、無資料庫、無網路依賴**

## 模組與職責

目前是**單檔架構**,所有邏輯都在 [main.py](main.py)。邏輯分層如下(行號為當前 main 分支):

| 範圍 | 行數 | 職責 |
|---|---|---|
| `OUT_W, OUT_H` 常數 | 6-7 | 輸出尺寸 1920×1080 |
| `_S2T_MAP` / 繁簡轉換 | 10-64 | 手寫字符對應表 + `to_simplified` / `to_traditional` |
| `get_font_path` / `load_font` | 67-89 | 跨平台中文字型尋找 |
| `make_card` | 92-120 | 字卡渲染(動態字級 400→8pt 二分搜尋) |
| `auto_split` | 123-155 | 折行邏輯(中英文不同規則,feat./ft. 獨立行) |
| `parse_setlist` | 158-183 | 主視窗用:把純文字歌單變成 `[{type, lines}]` |
| `parse_song_list_from_text` | 186-334 | RD 辨識器用:三層 fallback 解析雜亂輸入 |
| UI 顏色常數 | 339-348 | 深色主題色號 |
| `class App` | 350-606 | 主視窗(輸入 / 預覽 / 編輯 / 匯出) |
| `class ParserWindow` | 609-704 | 排序辨識器子視窗 |

**入口檔案**:[main.py](main.py) — 直接執行 `python main.py`,沒有 entry-point 包裝。

## 資料流

```
使用者貼整份 RD
   ↓
ParserWindow.txt_in
   ↓
parse_song_list_from_text()  ← 三層 fallback,過濾舞台說明 / 時間標記 / 裝飾符號
   ↓
ParserWindow.txt_out (純文字歌單,例如 "S01 皮卡丘\nTALKING-1\n轉場_VCR 02")
   ↓ (按「匯入字卡生成器」)
App.txt
   ↓ (按「生成字卡」)
parse_setlist()  ← 結構化成 dict 列表
   ↓
App.items = [{"type": "song", "lines": ["S01", "皮卡丘"]}, ...]
   ↓ (預覽 / 編輯 / 排序)
make_card()  ← 動態字級渲染,1920×1080 PNG
   ↓ (按「匯出所有字卡 PNG」)
folder/S01_皮卡丘.png × N
```

## 開發環境設定

```bash
# 1. Clone
git clone https://github.com/kailyn41291-del/ArenaCardGen.git

# 2. 建虛擬環境(建議,不是必要)
python -m venv .venv
source .venv/Scripts/activate    # Windows Git Bash
# 或:.venv\Scripts\activate.bat  # Windows cmd
# 或:source .venv/bin/activate   # macOS / Linux

# 3. 裝依賴
pip install -r requirements.txt

# 4. 跑起來
python main.py
```

**字型需求**:
- Windows 內建有 `msjhbd.ttc`(微軟正黑體粗體),不用裝
- macOS 內建 `PingFang.ttc`,不用裝
- Linux 需要 `fonts-noto-cjk` 套件

## 執行方式

```bash
python main.py
```

## 打包方式

兩個現成腳本,直接執行即可:

```bash
# Windows(產出 dist/Arena_titlecard_gen.exe)
build_windows.bat

# macOS(產出 dist/Arena_titlecard_gen)
chmod +x build_mac.sh
./build_mac.sh
```

打包指令展開:
```
pyinstaller --onefile --windowed \
  --name "Arena_titlecard_gen" \
  --hidden-import PIL \
  --hidden-import PIL._tkinter_finder \
  --hidden-import tkinter \
  main.py
```

詳細打包流程與版本號規則見 [.claude/skills/release-workflow/SKILL.md](.claude/skills/release-workflow/SKILL.md)。

---

## 協作規則

### 不要 defer / 不要等下一版

**遇到問題就現在修,不要分批、不要排隊到「下個版本再說」。** 不要說「先 ship 這版,下版再修」「這個是設計 trade-off」「這個技術 blocker 等之後處理」。如果有真的的 blocker(例如要付錢、要等第三方),直接講清楚不能修的根本原因,不要包裝成「下版再做」。

例外:
- 純付費障礙(code signing cert、第三方 API quota)— 直接告訴 user 是錢的問題,不要說「我之後處理」
- 真的需要 user 動作的事(開 Developer Mode、提供帳號)— 直接列出 user 要做什麼,不要 vague 說「等之後」

任何「之後再說」「下版再做」「先放著」的句型 = 拖延信號,**寫之前先問自己:這真的不能現在做嗎?**

### 嚴格審視機制(寫 code 的 Claude 必讀)

User 要求對重大改動由獨立的 [strict-reviewer agent](.claude/agents/strict-reviewer.md) 做第二意見審視。**寫 code 的你不該自己評斷自己的工作,要主動 spawn reviewer**,把 reviewer 的結果原文回報給 user(不過濾、不軟化)。

**何時必須 spawn strict-reviewer**:
- 任何 visual / 美術設計變更(icon、logo、UI 配色、layout、動畫)
- 重大功能完成後(>50 行 code,或新元件 / 新流程)
- commit 前(讓 review 結果決定要不要先修才 commit)
- ZIP 打包前(確認沒新引入 regression)

**怎麼 spawn**(self-contained prompt):
- 範圍清楚說明(改了什麼 / 哪些檔案 / 什麼意圖)
- 提供必要 context(相關 commit hash、file path、UI 截圖路徑)
- 說明已知 issue 不要重複報
- 要求繁中、🔴/🟡/💭 三級分類

審視結果會比你自評更嚴格,**接到 review 結果不要解釋 / 辯護,直接照做或跟 user 討論優先序。**

### 分支與 PR

- ❌ **不直接 push main**
- ✅ 所有改動走 feature branch + PR
- ✅ 互相 review 通過後才 merge
- ✅ Branch 命名建議:`feat/<簡短描述>`、`fix/<bug 描述>`、`refactor/<範圍>`

### Commit Message 格式

採 **Conventional Commits**,**訊息用繁體中文**:

```
<type>: <一句話描述>

(可選)更詳細的說明,解釋為什麼這樣改、或這個改動影響了什麼。
```

`<type>` 限定下列七種:

| type | 用法 |
|---|---|
| `feat` | 新功能 |
| `fix` | 修 bug |
| `docs` | 只改文件 / 註解 / CLAUDE.md / skill |
| `refactor` | 重構但不改外部行為 |
| `style` | 純排版 / 縮排 / 命名(不影響行為) |
| `chore` | 雜事(打包腳本、`.gitignore`、依賴版本) |
| `test` | 加測試或修測試 |

範例:
```
feat: RD 辨識器支援多重轉場標籤

新增「轉場_VCR_進場」這類複合標籤的解析,因為近期幾場活動的 RD
都用了這種寫法。
```

```
fix: 匯出 PNG 時檔名包含全形冒號會失敗

Windows 不允許檔名有 ':',但全形 ':' 之前沒被 sanitize 排除。
```

```
chore: 加入 .gitignore 排除 PyInstaller 產物
```

寫 commit message 可以用 `commit-helper` agent 自動產生。

---

## 新加入者上手指南

如果你是第三個加入這個專案的人(或剛 clone 下來的自己),按這個順序:

1. **跑一次完整流程** — 開 [main.py](main.py),貼一份真實 RD 進辨識器,匯出字卡看結果。**不要先讀 code,先當使用者**。
2. **讀這份 CLAUDE.md** 的「資料流」與「模組與職責」。
3. **讀 [main.py](main.py)** 的時候按以下順序:
   - 先看 `class App._build` 把 UI 結構建立起來
   - 再看 `parse_setlist`(短、簡單)
   - 最後看 `parse_song_list_from_text`(複雜,慢慢讀)
4. **讀已知問題清單**(下一節),知道哪些是地雷。
5. **第一個 PR 建議寫測試**,不要重構。把 `parse_song_list_from_text` 的現有行為用測試固化下來,將來重構才有安全網。詳見 [.claude/skills/testing/SKILL.md](.claude/skills/testing/SKILL.md)。

---

## 已知問題清單

按嚴重性排,**僅紀錄,不要逕自修**(可以開 PR 提出修法,但要兩人都同意)。

### 🔴 Live 場合可能出事

- **字型 fallback 是無聲災難** [main.py:81-85](main.py:81)
  找不到中文字型會 fallback 到 Pillow 內建 8pt bitmap font,1920×1080 字卡上幾乎看不見字。應該 `fail loud`。
- **`_S2T_MAP` 有重複 key** [main.py:10-57](main.py:10)
  `'继':'繼'`、`'际':'際'`、`'尝':'嘗'`、`'偿':'償'`、`'础':'礎'`、`'级':'級'` 都重複出現。Python 取最後一個,目前剛好沒事,但加新字容易撞名。建議改用 `opencc-python-reimplemented`。
- **匯出 thread race condition** [main.py:587-602](main.py:587)
  `_do_export` worker thread 直接讀 `self.items` / `self.transparent.get()` / `self.bg_color`,UI 同時還能改。建議匯出開始時 snapshot 一份。
- **沒有 auto-save** — VJ 演唱會前一晚整理 50 首歌的歌單,中途 app 崩了 = 重做。建議啟動偵測 `~/.arena_cardgen/last_session.json`。
- **沒有測試** — `parse_song_list_from_text` 是邊界 case 地獄,任何重構都是地雷。

### 🟡 中期該做

- 710 行單檔 → 拆 `parser.py` / `renderer.py` / `ui.py`(等有測試保護網)
- `parse_setlist` 跟 `parse_song_list_from_text` 兩套類似邏輯,將來會 drift
- 若要重做 UIUX,可考慮 **CustomTkinter**(視覺更現代,API 與 tkinter 兼容)

### 💭 Nits

- `clean()` 的舞台關鍵字黑名單寫死 inline,應抽成 list 才好維護
- 沒有 README.md(這份 CLAUDE.md 取代,給人類也行)

---

## 進階參考

- **顏色 / UI 慣例**:[.claude/skills/ui-patterns/SKILL.md](.claude/skills/ui-patterns/SKILL.md)
- **RD 解析決策樹**:[.claude/skills/rd-parser/SKILL.md](.claude/skills/rd-parser/SKILL.md)
- **PNG 輸出規格**:[.claude/skills/image-generation/SKILL.md](.claude/skills/image-generation/SKILL.md)
- **打包 / 版本號 / Release notes**:[.claude/skills/release-workflow/SKILL.md](.claude/skills/release-workflow/SKILL.md)
- **怎麼寫測試**:[.claude/skills/testing/SKILL.md](.claude/skills/testing/SKILL.md)
- **Code review agent**:[.claude/agents/code-reviewer.md](.claude/agents/code-reviewer.md)
- **RD 解析測試 agent**:[.claude/agents/rd-format-tester.md](.claude/agents/rd-format-tester.md)
- **Commit message agent**:[.claude/agents/commit-helper.md](.claude/agents/commit-helper.md)
