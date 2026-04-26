"""Tests for auto_split / _split_main / _split_chinese / _split_english"""
import pytest
from main import auto_split, _split_chinese, _split_english


@pytest.mark.parametrize("num, title, expected_first_two", [
    # 中文短(無 S 編號)
    ("", "皮卡丘", [("皮卡丘", 1.0)]),
    ("", "感謝名單", [("感謝", 1.0), ("名單", 1.0)]),  # ← 4字應切 2/2

    # 中文短(含 S 編號)
    ("S01", "皮卡丘", [("S01", 0.4), ("皮卡丘", 1.0)]),
    ("S01", "感謝名單", [("S01", 0.4), ("感謝", 1.0)]),  # 第一行 S01,第二行「感謝」

    # 含 ft.
    ("S01", "皮卡丘 feat. 小火龍",
     [("S01", 0.4), ("皮卡丘", 1.0)]),  # 主標題 1 行
])
def test_auto_split_first_two(num, title, expected_first_two):
    actual = auto_split(num, title, prefer="3/2", use_jieba=False)
    assert actual[:len(expected_first_two)] == expected_first_two


def test_auto_split_ft_separated():
    """ft. 應該獨立成最後一行,字級 0.6"""
    result = auto_split("S01", "皮卡丘 feat. 小火龍", prefer="3/2", use_jieba=False)
    assert result[-1][1] == 0.6
    assert "小火龍" in result[-1][0]


@pytest.mark.parametrize("text, expected", [
    ("皮", ["皮"]),
    ("皮卡", ["皮卡"]),
    ("皮卡丘", ["皮卡丘"]),
    ("感謝名單", ["感謝", "名單"]),
    ("皮卡丘進", ["皮卡丘", "進"]),  # 4字 = 2/2 → 應為 ["皮卡", "丘進"]?
])
def test_split_chinese_short(text, expected):
    if len(text) == 4:
        # 4字一律 2/2
        assert _split_chinese(text, "3/2", False) == [text[:2], text[2:]]
    else:
        assert _split_chinese(text, "3/2", False) == expected


def test_split_chinese_5chars_3_2():
    assert _split_chinese("皮卡丘進化", "3/2", False) == ["皮卡丘", "進化"]


def test_split_chinese_5chars_2_3():
    assert _split_chinese("皮卡丘進化", "2/3", False) == ["皮卡", "丘進化"]


def test_split_chinese_6chars():
    assert _split_chinese("皮卡丘進化形", "3/2", False) == ["皮卡丘", "進化形"]


def test_split_chinese_truncation():
    """超過 9 字應截斷加 …"""
    long_title = "皮卡丘進化形態一二三四五"  # 11 chars
    result = _split_chinese(long_title, "3/2", False)
    assert any("…" in line for line in result)
    assert len(result) <= 3


def test_split_english_short():
    assert _split_english("Pikachu") == ["Pikachu"]
    assert _split_english("One Two") == ["One Two"]


def test_split_english_long_split():
    result = _split_english("One Two Three Four")
    assert len(result) == 2
    assert "One" in result[0]
