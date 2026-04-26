---
name: testing
description: 怎麼為 Arena Card Generator 寫測試。重點在 parser 的回歸測試 — 把 `parse_song_list_from_text` 跟 `parse_setlist` 的既有行為固化,將來任何重構都有安全網。包含 pytest 設定、目錄結構、第一批必寫的測試、執行方式。
---

# Testing — Arena Card Generator

## 為什麼這個 skill 存在

[main.py](../../main.py) 內 `parse_song_list_from_text`(150 行,30+ 條黑名單關鍵字、三層 fallback)是專案最複雜的部分。**目前完全沒有測試**。任何人(包括你、朋友、AI)動 parser 一行,都可能默默壞掉某個邊界 case。

這個 skill 教你怎麼**先寫測試,再做任何重構**。

> 🎯 **新加入者的第一個 PR 應該是寫這批測試,不是改邏輯**。讀 code、寫測試、執行測試,你會自然把 parser 摸透。

---

## 測試框架選擇

**pytest**。理由:
- Python 業界標準,語法直覺
- `assert` 直接用,不像 unittest 要 `assertEqual`
- 沒有 fixture 也能寫(這個專案目前不需要複雜 fixture)
- 最終會在 CI 跑(目前還沒,以後加)

### 安裝

```bash
pip install pytest
```

要不要寫進 `requirements.txt`?**寫**,但加註標記為 dev 依賴(目前 repo 沒有 `requirements-dev.txt`,可以直接寫進 `requirements.txt` 然後加註解):

```txt
Pillow>=10.0.0
pyinstaller>=6.0.0

# dev
pytest>=7.0.0
```

或更乾淨的方法:**多開一份** `requirements-dev.txt`(只列 dev 工具),標準做法但目前小專案 overhead 略高。第一次寫測試先用單一 `requirements.txt` 即可,之後再分。

---

## 目錄結構

```
arena card/
├── main.py
├── requirements.txt
├── tests/                       ← 新增
│   ├── __init__.py             ← 空檔(讓 pytest 找得到)
│   ├── test_parse_song_list.py ← parse_song_list_from_text 測試
│   ├── test_parse_setlist.py   ← parse_setlist 測試
│   ├── test_auto_split.py      ← auto_split 折行測試
│   └── test_clean.py           ← clean() 函式測試(將 clean 提升為頂層函式或從 module 取)
└── pytest.ini                   ← 新增(pytest 設定)
```

### `pytest.ini` 內容

```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_functions = test_*
```

---

## Import 主程式的策略

`parse_song_list_from_text` 等函式都在 [main.py](../../main.py) 的頂層。問題:`main.py` 結尾有 `if __name__ == "__main__": app = App(); app.mainloop()`,所以 `import main` 不會自己跑 GUI(因為 `__name__ != "__main__"`)。**好消息,可以直接 import**。

```python
# tests/test_parse_song_list.py
from main import parse_song_list_from_text
```

⚠️ 但這也 import 到 `tkinter` 的初始化(`load_font` 在 module 載入時就執行 `get_font_path()`)。在 headless 環境(沒裝顯示)可能 fail。短期沒問題(兩位作者都在 desktop 環境跑測試),長期建議把 parser 拆出 `parser.py`。

---

## 第一批必寫的測試

按優先順位:

### 🔴 必須有(動 parser 之前)

**檔案**:`tests/test_parse_song_list.py`

把 [.claude/agents/rd-format-tester.md](../../agents/rd-format-tester.md) 的測試案例表全部寫成 pytest:

```python
import pytest
from main import parse_song_list_from_text


# 用 pytest.mark.parametrize 一次跑很多案例
@pytest.mark.parametrize("desc, input_text, expected", [
    # ── 標準格式(三層 fallback)──────────────────
    ("有 SONG 編號",
     "SONG 1: 皮卡丘\nSONG 2: 小火龍",
     "S01 皮卡丘\nS02 小火龍"),

    ("S 編號",
     "S1. 皮卡丘\nS2. 小火龍",
     "S01 皮卡丘\nS02 小火龍"),

    ("兩欄 tab",
     "1\t皮卡丘\n2\t小火龍",
     "S01 皮卡丘\nS02 小火龍"),

    ("兩欄全形空格",
     "1　皮卡丘\n2　小火龍",
     "S01 皮卡丘\nS02 小火龍"),

    ("每行就是歌名",
     "皮卡丘\n小火龍",
     "S01 皮卡丘\nS02 小火龍"),

    # ── 各類項目 ───────────────────────────────
    ("Talking 大寫", "TALKING-1", "TALKING-1"),
    ("Talking 小寫加空格", "Talking 1", "TALKING-1"),
    ("轉場繁體", "轉場03", "轉場_03"),
    ("轉場簡體統一輸出繁體", "转场03", "轉場_03"),
    ("轉場 VCR", "轉場VCR 02", "轉場_VCR 02"),
    ("轉場帶名稱", "轉場_娜娜KTV", "轉場_娜娜KTV"),
    ("轉場帶名稱+說明", "轉場_娜娜KTV - 互動橋段", "轉場_娜娜KTV"),
    ("Chaser 帶名", "Chaser~阿明", "Chaser~阿明"),
    ("Chaser 純詞", "Chaser", "Chaser"),
    ("行內 VCR", "Opening VCR", "VCR Opening"),

    # ── 邊界情況 ───────────────────────────────
    ("空字串", "", ""),
    ("全空白", "   \n\n  \n", ""),
    ("單一項目", "皮卡丘", "S01 皮卡丘"),
    ("重複歌名去重",
     "S1: 皮卡丘\nS2: 皮卡丘",
     "S01 皮卡丘"),
    ("編號跳號保留",
     "SONG 5: 皮卡丘\nSONG 8: 小火龍",
     "S05 皮卡丘\nS08 小火龍"),
    ("奇怪縮排",
     "  S1: 皮卡丘  \n\tS2:小火龍\t",
     "S01 皮卡丘\nS02 小火龍"),

    # ── clean() 應剝掉的 ───────────────────────
    ("半形括號", "S1: 皮卡丘 (中文版)", "S01 皮卡丘"),
    ("全形括號", "S1: 皮卡丘(中文版)", "S01 皮卡丘"),
    ("時間標記", "S1: 皮卡丘 3'45\"", "S01 皮卡丘"),
    ("舞台說明:服裝", "S1: 皮卡丘 服裝 紅色", "S01 皮卡丘"),
    ("舞台說明:Bass", "S1: 皮卡丘 Bass", "S01 皮卡丘"),
    ("舞台說明:CO\\d", "S1: 皮卡丘 CO1", "S01 皮卡丘"),
    ("舞台說明:多項",
     "S1: 皮卡丘 - 舞者+服裝+花朵",
     "S01 皮卡丘"),
    ("裝飾符號剝除", "■ S1: 皮卡丘 →", "S01 皮卡丘"),
])
def test_parse_song_list(desc, input_text, expected):
    actual = parse_song_list_from_text(input_text)
    assert actual == expected, (
        f"\n描述: {desc}"
        f"\n輸入: {input_text!r}"
        f"\n預期: {expected!r}"
        f"\n實際: {actual!r}"
    )
```

**怎麼用這份**:

1. 直接複製這個檔案到 `tests/test_parse_song_list.py`
2. 跑 `pytest tests/test_parse_song_list.py -v`
3. **任何失敗都要記錄,並決定**:
   - 是測試的「預期」寫錯了 → 改測試
   - 還是 parser 真的有 bug → 修 parser
4. 全部通過後,**這份測試就是 baseline**。任何 PR 改 parser 都不能讓這些案例失敗。

### 🟡 應該有(下一階段)

**`tests/test_parse_setlist.py`** — 涵蓋 [.claude/skills/rd-parser/SKILL.md](../rd-parser/SKILL.md) 的「`parse_setlist` 的差異」一節:

```python
import pytest
from main import parse_setlist


@pytest.mark.parametrize("input_text, expected_items", [
    ("S01 皮卡丘",
     [{"type": "song", "lines": ["S01", "皮卡丘"]}]),

    ("皮卡丘 feat. 小火龍",
     [{"type": "song", "lines": ["皮卡丘", "ft.小火龍"]}]),

    ("TALKING-1",
     [{"type": "talking", "lines": ["TALKING-1"]}]),

    ("轉場_VCR",
     [{"type": "transition", "lines": ["轉場", "VCR"]}]),

    ("Chaser~阿明",
     [{"type": "chaser", "lines": ["Chaser~", "阿明"]}]),

    # 多行
    ("S01 皮卡丘\nTALKING-1\n轉場_VCR",
     [
         {"type": "song", "lines": ["S01", "皮卡丘"]},
         {"type": "talking", "lines": ["TALKING-1"]},
         {"type": "transition", "lines": ["轉場", "VCR"]},
     ]),
])
def test_parse_setlist(input_text, expected_items):
    assert parse_setlist(input_text) == expected_items
```

**`tests/test_auto_split.py`** — 折行邏輯:

```python
import pytest
from main import auto_split


@pytest.mark.parametrize("num, title, expected", [
    # 中文
    ("S01", "皮卡丘", ["S01", "皮卡丘"]),                    # ≤6 字不折
    ("S01", "中文長標題範例", ["S01", "中文長標", "題範例"]),    # >6 字對半切
    # 英文
    ("S01", "Pikachu", ["S01", "Pikachu"]),                # 1 個字不折
    ("S01", "One Two Three", ["S01", "One Two Three"]),      # ≤3 個字不折
    ("S01", "One Two Three Four", ["S01", "One Two", "Three Four"]),  # >3 對半
    # feat
    ("S01", "皮卡丘 feat. 小火龍",
     ["S01", "皮卡丘", "feat.小火龍"]),
    ("S01", "皮卡丘 ft.小火龍",
     ["S01", "皮卡丘", "ft.小火龍"]),
    # 沒編號
    ("", "皮卡丘", ["皮卡丘"]),
])
def test_auto_split(num, title, expected):
    assert auto_split(num, title) == expected
```

### 💭 可以晚一點(沒急)

**`tests/test_clean.py`** — `clean()` 是 `parse_song_list_from_text` 內的閉包(`def clean(t):`),目前不能直接 import。先寫 `test_parse_song_list` 透過整段 parser 間接測試 clean 行為就夠。

要單獨測 clean,可以選一個策略:
1. 重構把 clean 提升為 module 頂層函式(動 main.py)
2. 用 `inspect` / 手動複製 clean 邏輯到測試檔(髒)
3. 不單獨測,接受 parser 整體測試覆蓋(目前的選擇)

**選 3**,等 clean 真的有 bug 或要被獨立 reuse 才提升。

---

## 怎麼跑測試

```bash
# 跑全部
pytest

# 跑特定檔案
pytest tests/test_parse_song_list.py

# 跑特定 case(用 case description 當 keyword)
pytest -k "轉場"

# 顯示 print() 輸出
pytest -s

# 詳細模式(列出每個 case 名稱跟結果)
pytest -v

# 失敗時停下來,進入 debugger(配合 import pdb; pdb.set_trace())
pytest --pdb
```

第一次跑時推薦:`pytest -v`。

---

## 增加測試案例的時機

1. **發現 parser 沒處理的真實 RD 格式** → 在 `parametrize` 加一筆,**先寫成預期失敗的測試**(描述、輸入、預期),然後修 parser 讓它通過。
2. **PR review 時想到的邊界** → 同上。
3. **修 bug 時** → **必加** regression test 防止再撞。修 bug PR 必含:
   - 一個會重現 bug 的測試
   - bug 修復(讓測試通過)
   - 現有測試**全部仍通過**

---

## 不寫測試的情況(明確排除)

- ❌ **不寫 UI 測試**(tkinter 寫 UI 測試成本太高,自用工具不值)
- ❌ **不寫 PIL 渲染測試**(圖片差異測試需要 baseline image,手動目視比較更實際)
- ❌ **不寫端對端測試**(從貼 RD 到匯出 PNG)— 同上,目視驗證即可
- ❌ **不要為了 coverage 數字硬寫**(self.title("...") 之類的測試沒意義)

**測試只覆蓋兩個 parser + auto_split**。其他不寫,不要被 coverage 焦慮綁架。

---

## CI(未來)

目前**不設 CI**(兩人專案,本地跑 pytest 即可)。

未來如果要設,GitHub Actions 範本:

```yaml
# .github/workflows/test.yml(範本,**不要現在加**)
name: tests

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install -r requirements.txt pytest
      - run: pytest -v
```

⚠️ 注意:`tkinter` 在 Ubuntu CI 預設沒裝,需要 `apt-get install python3-tk`。或者把 parser 拆出 `parser.py`(就不依賴 tkinter import) — **這是把 parser 模組化的長期理由之一**。
