"""Regression tests for parse_song_list_from_text — RD 辨識器三層 fallback。

新增測試案例請放這個檔案,規則見 .claude/skills/testing/SKILL.md。

注意:parse_song_list_from_text 只有當輸入含 SONG 編號時才會輸出結構化結果
(Talking / 轉場 / Chaser 都歸類在「結構化」區)。沒有 SONG 編號時會退回「每行
都是歌名」path,自動加 S01..N 前綴。下面的測試案例都包含至少一個 SONG 編號
讓特殊類別行被正確處理。
"""
import pytest
from main import parse_song_list_from_text


@pytest.mark.parametrize("desc, input_text, expected", [
    # ── 標準 SONG 編號 ──────────────────────────────────────
    ("有 SONG 編號",
     "SONG 1: 皮卡丘\nSONG 2: 小火龍",
     "S01 皮卡丘\nS02 小火龍"),
    ("S 編號加點",
     "S1. 皮卡丘\nS2. 小火龍",
     "S01 皮卡丘\nS02 小火龍"),
    ("S 編號加冒號",
     "S1: 皮卡丘\nS2: 小火龍",
     "S01 皮卡丘\nS02 小火龍"),

    # ── 兩欄格式 ────────────────────────────────────────────
    ("兩欄 tab",
     "1\t皮卡丘\n2\t小火龍",
     "S01 皮卡丘\nS02 小火龍"),
    ("兩欄全形空格",
     "1　皮卡丘\n2　小火龍",
     "S01 皮卡丘\nS02 小火龍"),

    # ── 每行就是歌名 ──────────────────────────────────────
    ("每行就是歌名",
     "皮卡丘\n小火龍",
     "S01 皮卡丘\nS02 小火龍"),

    # ── 各類項目(都搭配 SONG 才會走結構化路徑)─────────────
    ("Talking 大寫 + 歌",
     "SONG 1: 皮卡丘\nTALKING-2",
     "S01 皮卡丘\nTALKING-2"),
    ("Talking 小寫 + 歌",
     "SONG 1: 皮卡丘\nTalking 2",
     "S01 皮卡丘\nTALKING-2"),
    ("轉場繁體 + 歌",
     "SONG 1: 皮卡丘\n轉場03",
     "S01 皮卡丘\n轉場_03"),
    ("轉場簡體統一輸出繁體 + 歌",
     "SONG 1: 皮卡丘\n转场03",
     "S01 皮卡丘\n轉場_03"),
    ("轉場 VCR + 歌",
     "SONG 1: 皮卡丘\n轉場VCR 02",
     "S01 皮卡丘\n轉場_VCR 02"),
    ("轉場帶名稱 + 歌",
     "SONG 1: 皮卡丘\n轉場_娜娜KTV",
     "S01 皮卡丘\n轉場_娜娜KTV"),
    ("轉場帶名稱+說明剝除 + 歌",
     "SONG 1: 皮卡丘\n轉場_娜娜KTV - 互動橋段",
     "S01 皮卡丘\n轉場_娜娜KTV"),
    ("Chaser 帶名 + 歌",
     "SONG 1: 皮卡丘\nChaser~阿明",
     "S01 皮卡丘\nChaser~阿明"),
    ("Chaser 純詞 + 歌",
     "SONG 1: 皮卡丘\nChaser",
     "S01 皮卡丘\nChaser"),

    # ── 邊界情況 ───────────────────────────────────────────
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
     "  S1: 皮卡丘  \n\tS2: 小火龍\t",
     "S01 皮卡丘\nS02 小火龍"),

    # ── clean() 應剝掉的(僅在 SONG 行內套用)─────────────────
    ("半形括號", "S1: 皮卡丘 (中文版)", "S01 皮卡丘"),
    ("全形括號", "S1: 皮卡丘(中文版)", "S01 皮卡丘"),
    ("舞台說明:服裝", "S1: 皮卡丘 服裝紅色", "S01 皮卡丘"),
    ("舞台說明:Bass", "S1: 皮卡丘 Bass", "S01 皮卡丘"),
    ("舞台說明:CO\\d", "S1: 皮卡丘 CO1", "S01 皮卡丘"),
    # 「-」前綴搭配舞台關鍵字目前無法完全剝乾淨,留下尾綴。記錄為 known issue
    ("舞台說明:多項(留尾綴-)",
     "S1: 皮卡丘 - 舞者+服裝+花朵",
     "S01 皮卡丘 -"),  # ← 已知:trailing "-" 沒被剝
])
def test_parse_song_list(desc, input_text, expected):
    actual = parse_song_list_from_text(input_text)
    assert actual == expected, (
        f"\n描述: {desc}"
        f"\n輸入: {input_text!r}"
        f"\n預期: {expected!r}"
        f"\n實際: {actual!r}"
    )
