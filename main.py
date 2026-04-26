import sys, os, re, threading, json, urllib.request, subprocess
from pathlib import Path
from collections import Counter
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from PIL import Image, ImageDraw, ImageFont, ImageTk

try:
    import jieba
    jieba.setLogLevel(60)
    HAS_JIEBA = True
except Exception:
    HAS_JIEBA = False

# ── 版本 ────────────────────────────────────────────────────
__version__ = "0.2.0"
GITHUB_REPO = "kailyn41291-del/ArenaCardGen"

# ── 輸出尺寸 ────────────────────────────────────────────────
OUT_W, OUT_H = 1920, 1080

# ── 設定 / Session 路徑 ─────────────────────────────────────
APP_DATA_DIR = Path.home() / ".arena_cardgen"
SETTINGS_PATH = APP_DATA_DIR / "settings.json"
SESSION_PATH = APP_DATA_DIR / "last_session.json"

# ── 繁簡轉換 ────────────────────────────────────────────────
_S2T_MAP = {
    '爱':'愛','罢':'罷','备':'備','笔':'筆','边':'邊','标':'標','别':'別',
    '补':'補','采':'採','层':'層','产':'產','长':'長','场':'場',
    '车':'車','称':'稱','传':'傳','创':'創','带':'帶','单':'單','当':'當',
    '党':'黨','导':'導','灯':'燈','点':'點','东':'東','动':'動','读':'讀',
    '发':'發','饭':'飯','飞':'飛','风':'風','够':'夠','关':'關','广':'廣',
    '归':'歸','过':'過','汉':'漢','号':'號','欢':'歡','换':'換','汇':'匯',
    '积':'積','极':'極','际':'際','几':'幾','继':'繼','间':'間','检':'檢',
    '见':'見','将':'將','节':'節','进':'進','经':'經','举':'舉','开':'開',
    '来':'來','乐':'樂','离':'離','历':'歷','联':'聯','两':'兩','临':'臨',
    '录':'錄','乱':'亂','满':'滿','么':'麼','们':'們','梦':'夢','面':'麵',
    '灭':'滅','难':'難','脑':'腦','内':'內','宁':'寧','农':'農','评':'評',
    '气':'氣','钱':'錢','强':'強','亲':'親','请':'請','让':'讓','热':'熱',
    '认':'認','时':'時','实':'實','书':'書','数':'數','说':'說','随':'隨',
    '台':'臺','体':'體','听':'聽','图':'圖','团':'團','万':'萬','为':'為',
    '问':'問','务':'務','献':'獻','响':'響','向':'嚮','写':'寫',
    '学':'學','样':'樣','义':'義','议':'議','艺':'藝','应':'應','优':'優',
    '远':'遠','运':'運','战':'戰','张':'張','这':'這','帧':'幀','执':'執',
    '志':'誌','质':'質','众':'眾','转':'轉','庄':'莊','总':'總','组':'組',
    '华':'華','语':'語','话':'話','画':'畫','还':'還','后':'後',
    '怀':'懷','坏':'壞','护':'護','获':'獲','计':'計',
    '记':'記','减':'減','简':'簡','键':'鍵','讲':'講','奖':'獎',
    '缘':'緣','级':'級','给':'給','个':'個','尽':'盡',
    '竞':'競','旧':'舊','剧':'劇','惊':'驚','鸡':'雞','轰':'轟',
    '坚':'堅','监':'監','阵':'陣','针':'針','证':'證','职':'職',
    '纸':'紙','终':'終','钟':'鐘','种':'種',
    '轴':'軸','专':'專','壮':'壯','准':'準','资':'資',
    '综':'綜','纵':'縱','诉':'訴',
    '岁':'歲','孙':'孫','损':'損','讨':'討','统':'統',
    '阳':'陽','业':'業','遗':'遺','忆':'憶','邮':'郵','预':'預',
    '员':'員','园':'園','愿':'願','约':'約','云':'雲','杂':'雜',
    '灾':'災','则':'則','责':'責','赞':'讚','择':'擇','债':'債',
    '帐':'帳','诊':'診','镇':'鎮','争':'爭',
    '识':'識','设':'設','决':'決','协':'協','维':'維',
    '荐':'薦','调':'調','误':'誤','状':'狀','础':'礎',
    '里':'裡','恋':'戀','兰':'蘭','罗':'羅',
    '丽':'麗','树':'樹','桥':'橋','晓':'曉',
    '龙':'龍','马':'馬','鸟':'鳥','鱼':'魚',
    '乡':'鄉','钻':'鑽','饰':'飾','摄':'攝',
    '纪':'紀','较':'較','态':'態','势':'勢',
    '恶':'惡','湾':'灣','亿':'億','规':'規',
    '虑':'慮','权':'權','须':'須','赖':'賴',
    '码':'碼','类':'類','线':'線',
    '变':'變','该':'該','观':'觀',
    '尝':'嘗','偿':'償','赏':'賞',
    '肤':'膚','肾':'腎','脏':'臟',
    '舱':'艙','舰':'艦','载':'載',
}
_T2S_MAP = {v: k for k, v in _S2T_MAP.items()}

def to_simplified(text):
    return text.translate(str.maketrans(_T2S_MAP))

def to_traditional(text):
    return text.translate(str.maketrans(_S2T_MAP))

# ── 字型(fail-loud)─────────────────────────────────────────
def get_font_path():
    candidates = {
        "win32":  ["C:/Windows/Fonts/msjhbd.ttc", "C:/Windows/Fonts/msjh.ttc", "C:/Windows/Fonts/arial.ttf"],
        "darwin": ["/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/STHeiti Medium.ttc"],
    }
    linux = ["/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc",
             "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"]
    for p in candidates.get(sys.platform, linux):
        if os.path.exists(p):
            return p
    return None

FONT_PATH = get_font_path()

def load_font(size_pt):
    if not FONT_PATH:
        raise RuntimeError(
            "找不到中文字型,無法生成字卡。\n\n"
            "Windows: 確認 C:/Windows/Fonts/ 內有 msjhbd.ttc 或 msjh.ttc\n"
            "macOS: 確認 /System/Library/Fonts/PingFang.ttc 存在\n"
            "Linux: 安裝 fonts-noto-cjk 套件"
        )
    try:
        return ImageFont.truetype(FONT_PATH, max(int(size_pt), 8))
    except Exception as e:
        raise RuntimeError(f"中文字型載入失敗:\n{FONT_PATH}\n\n錯誤:{e}")

def tsz(draw, text, font):
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[2] - bb[0], bb[3] - bb[1]

# ── 設定 / Session ──────────────────────────────────────────
DEFAULT_SETTINGS = {
    "text_color": "#ffffff",
    "transparent": True,
    "use_type_colors": True,
    "type_colors": {
        "song":       "#ffffff",
        "talking":    "#ffff00",
        "transition": "#ff0080",
        "chaser":     "#ff0000",
    },
    "split_preference_5": "3/2",
    "use_jieba": True,
    "last_export_folder": None,
    "window_geometry": "1100x720",
    "auto_update_check": True,
}

def load_settings():
    if not SETTINGS_PATH.exists():
        return dict(DEFAULT_SETTINGS)
    try:
        data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        merged = dict(DEFAULT_SETTINGS)
        for k, v in data.items():
            if k in merged:
                if isinstance(merged[k], dict) and isinstance(v, dict):
                    merged[k] = {**merged[k], **v}
                else:
                    merged[k] = v
        return merged
    except Exception:
        return dict(DEFAULT_SETTINGS)

def save_settings(s):
    try:
        APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
        SETTINGS_PATH.write_text(json.dumps(s, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass

def load_session():
    if not SESSION_PATH.exists():
        return None
    try:
        return json.loads(SESSION_PATH.read_text(encoding="utf-8"))
    except Exception:
        return None

def save_session(items):
    try:
        APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
        data = {"items": items, "version": __version__}
        SESSION_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass

def clear_session():
    try:
        if SESSION_PATH.exists():
            SESSION_PATH.unlink()
    except Exception:
        pass

# ── 自動更新檢查 ────────────────────────────────────────────
def _is_newer(remote, local):
    try:
        ra = tuple(int(x) for x in remote.split(".")[:3])
        la = tuple(int(x) for x in local.split(".")[:3])
        return ra > la
    except Exception:
        return False

def check_for_update_async(callback):
    def worker():
        try:
            url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
            req = urllib.request.Request(url, headers={
                "User-Agent": f"ArenaCardGen/{__version__}",
                "Accept": "application/vnd.github+json",
            })
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            latest = (data.get("tag_name") or "").lstrip("v")
            html_url = data.get("html_url", "")
            if latest and _is_newer(latest, __version__):
                callback(latest, html_url)
        except Exception:
            pass
    threading.Thread(target=worker, daemon=True).start()

# ── 折行邏輯(新 layout 政策 + jieba)─────────────────────────
def auto_split(num, title, prefer="3/2", use_jieba=True):
    """回傳 List[(text, scale)]
    scale: 1.0 = 主標題  0.4 = 編號 / Chaser~ / 轉場 prefix  0.6 = ft.XXX
    """
    result = []
    if num:
        result.append((num, 0.4))

    ft_part = ""
    main = title or ""
    ft_m = re.search(r'\s*(ft\.|feat\.)\s*(.+)$', main, re.IGNORECASE)
    if ft_m:
        prefix = ft_m.group(1).rstrip()
        rest = ft_m.group(2)
        ft_part = (prefix + rest).strip()
        main = main[:ft_m.start()].strip()

    if main:
        for line in _split_main(main, prefer, use_jieba):
            result.append((line, 1.0))

    if ft_part:
        result.append((ft_part, 0.6))

    return result

def _split_main(text, prefer, use_jieba):
    n = len(text)
    eng = len(re.findall(r"[a-zA-Z]", text)) / max(n, 1)
    if eng > 0.4:
        return _split_english(text)
    return _split_chinese(text, prefer, use_jieba)

def _split_chinese(text, prefer="3/2", use_jieba=True):
    n = len(text)
    if n <= 3:
        return [text]
    if n == 4:
        return [text[:2], text[2:]]
    if n == 5:
        return [text[:3], text[3:]] if prefer == "3/2" else [text[:2], text[2:]]
    if n == 6:
        return [text[:3], text[3:]]

    if use_jieba and HAS_JIEBA:
        smart = _jieba_split(text)
        if smart:
            return smart

    # Fallback:超過 9 字截斷加 …,9 字內切 3+3+(剩)
    if n <= 9:
        return [text[:3], text[3:6], text[6:]]
    return [text[:3], text[3:6], text[6:8] + "…"]

def _jieba_split(text):
    """嘗試用 jieba 找好的斷詞點。最多 3 行,每行 ≤3 字。"""
    tokens = [t for t in jieba.cut(text) if t.strip()]
    if not tokens:
        return None

    def take_up_to(toks, max_chars):
        acc, used = "", 0
        for tok in toks:
            if len(acc) + len(tok) <= max_chars:
                acc += tok
                used += 1
            else:
                break
        if not acc:
            return text[:max_chars], 0, max_chars
        return acc, used, len(acc)

    line1, used1, len1 = take_up_to(tokens, 3)
    rest_toks = tokens[used1:] if used1 else []
    rest_text = text[len1:]

    if not rest_text:
        return [line1]

    if len(rest_text) <= 3:
        return [line1, rest_text]

    line2, used2, len2 = take_up_to(rest_toks, 3) if rest_toks else (rest_text[:3], 0, 3)
    rest2 = rest_text[len2:]

    if not rest2:
        return [line1, line2]
    if len(rest2) <= 3:
        return [line1, line2, rest2]
    return [line1, line2, rest2[:2] + "…"]

def _split_english(text):
    text = text.strip()
    if not text:
        return [""]
    nc = len(text)
    words = text.split()
    if not words:
        return [text]
    if nc <= 9:
        return [text]
    if len(words) == 1:
        return [text[:8] + "…"]
    if nc <= 18:
        mid = max(1, len(words) // 2)
        return [" ".join(words[:mid]), " ".join(words[mid:])]
    if nc <= 27 and len(words) >= 3:
        third = max(1, len(words) // 3)
        return [
            " ".join(words[:third]),
            " ".join(words[third:third*2]),
            " ".join(words[third*2:]),
        ]
    third = max(1, len(words) // 3)
    line1 = " ".join(words[:third])
    line2 = " ".join(words[third:third*2])
    tail = " ".join(words[third*2:])
    if len(tail) > 9:
        tail = tail[:7] + "…"
    return [line1, line2, tail]

# ── 字卡渲染(多字級)──────────────────────────────────────
def make_card(scaled_lines, text_color="#ffffff", transparent=True, size=(OUT_W, OUT_H)):
    w, h = size
    pad = int(w * 0.04)
    avail_w = w - pad * 2
    avail_h = int(h * 0.90)

    if transparent:
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    else:
        img = Image.new("RGB", (w, h), (0, 0, 0))

    draw = ImageDraw.Draw(img)
    cx = w // 2

    if not scaled_lines:
        return img

    chosen = None
    for fs in range(400, 8, -2):
        line_info = []
        max_w = 0
        total_h = 0
        line_heights = []
        for text, scale in scaled_lines:
            f = load_font(int(fs * scale))
            tw, th = tsz(draw, text, f)
            line_info.append((f, tw, th))
            line_heights.append(th)
            if tw > max_w:
                max_w = tw
        line_h_max = max(line_heights) if line_heights else 0
        gap = max(int(line_h_max * 0.15), 2)
        total_h = sum(line_heights) + gap * (len(scaled_lines) - 1)
        if max_w <= avail_w and total_h <= avail_h:
            chosen = (line_info, gap, total_h)
            break

    if not chosen:
        # 最小字級也塞不下,強制用 8pt
        line_info = []
        for text, scale in scaled_lines:
            f = load_font(max(8, int(8 * scale)))
            tw, th = tsz(draw, text, f)
            line_info.append((f, tw, th))
        gap = 4
        total_h = sum(th for _, _, th in line_info) + gap * (len(scaled_lines) - 1)
        chosen = (line_info, gap, total_h)

    line_info, gap, total_h = chosen
    y = h // 2 - total_h // 2
    for (text, _scale), (font, _tw, th) in zip(scaled_lines, line_info):
        draw.text((cx, y), text, font=font, fill=text_color, anchor="mt")
        y += th + gap

    return img

# ── 字卡歌單解析(主視窗用)────────────────────────────────
def parse_setlist(text, prefer="3/2", use_jieba=True):
    items = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        up = line.upper()
        if re.match(r"TALKING", up):
            m = re.match(r"(TALKING-?\d*)(.*)", line, re.IGNORECASE)
            tk_text = m.group(1).upper() if m else "TALKING"
            items.append({"type": "talking", "scaled_lines": [(tk_text, 1.0)]})
        elif re.match(r"轉場", line):
            rest = re.sub(r"^轉場[_\-\s]*", "", line).strip()
            if rest:
                items.append({"type": "transition",
                              "scaled_lines": [("轉場", 0.4), (rest, 1.0)]})
            else:
                items.append({"type": "transition",
                              "scaled_lines": [("轉場", 1.0)]})
        elif re.match(r"Chaser", line, re.IGNORECASE):
            m = re.match(r"(Chaser~?)(.*)", line, re.IGNORECASE)
            if m and m.group(2).strip():
                items.append({"type": "chaser",
                              "scaled_lines": [(m.group(1), 0.4), (m.group(2).strip(), 1.0)]})
            else:
                items.append({"type": "chaser", "scaled_lines": [(line, 1.0)]})
        else:
            m = re.match(r"^(S\d+)[_\s]+(.+)$", line, re.IGNORECASE)
            if m:
                items.append({"type": "song",
                              "scaled_lines": auto_split(m.group(1).upper(), m.group(2).strip(),
                                                          prefer, use_jieba)})
            else:
                items.append({"type": "song",
                              "scaled_lines": auto_split("", line.replace("_", " ").strip(),
                                                          prefer, use_jieba)})
    return items

# ── 歌單辨識(辨識器用,輸入雜亂文字,輸出純文字歌單)────
def parse_song_list_from_text(text):
    lines = text.splitlines()

    def clean(t):
        t = re.sub(r'[(（][^)）]*[)）]', '', t).strip()
        t = re.sub(r'<[^>]+>', '', t).strip()
        t = re.sub(r"\s+\d+['‘’]\d+[\"\/].*$", '', t).strip()
        t = re.sub(r"\s+\d+'\d+\".*$", '', t).strip()
        stage = (r'[\s　、,,–—–]+'
                 r'(?:舞者|服裝|服装|[\w]*道具|小舞台|大舞台|升降|左台|右台'
                 r'|合音|合唱|Bass|GT|gt|CO\d|鋼琴|鍵盤|钢琴|键盘'
                 r'|花朵|彩虹|彩條|氣球|風扇|风扇|噴桶|搖滾|摇滚'
                 r'|現身|退場|上場|下場|特製|特制|男舞|女舞|\*\d'
                 r'|樂手|配乐|竖琴|Disco|Intro|打造|人生)')
        m = re.search(stage, t, re.IGNORECASE)
        if m:
            t = t[:m.start()].strip()
        t = re.sub(r'\s+', ' ', t)
        return t.strip('■★▶▷◆◇→←'
                       '\xb7。，、/／　\'"–—– ')

    results = []
    seen_titles = set()

    for line in lines:
        ls = line.strip()
        if not ls:
            continue

        m = re.search(r'SONG\s*(\d+)\s*[:：]\s*(.+)', ls, re.IGNORECASE)
        if not m:
            m = re.search(r'\bS(\d+)\s*[:：\.]\s*(.+)', ls, re.IGNORECASE)
        if m:
            num = int(m.group(1))
            title = clean(m.group(2))
            if title and title not in seen_titles:
                seen_titles.add(title)
                results.append(('song', num, title))
            continue

        m = re.search(r'Talking\s*(\d+)', ls, re.IGNORECASE)
        if m:
            results.append(('talking', None, f'TALKING-{m.group(1)}'))
            continue
        if re.match(r'^TALKING\s*[-\s]*\d+', ls, re.IGNORECASE):
            m2 = re.search(r'(\d+)', ls)
            num = m2.group(1) if m2 else ''
            results.append(('talking', None, f'TALKING-{num}' if num else 'TALKING'))
            continue

        m = re.match(r'[轉转][場场]', ls)
        if m:
            rest = re.sub(r'^[轉转][場场]\s*', '', ls).strip()
            if re.match(r'VCR', rest, re.IGNORECASE):
                m2 = re.search(r'VCR\s*[-–]?\s*(\d+)?', rest, re.IGNORECASE)
                num = m2.group(1).strip() if m2 and m2.group(1) else ''
                name = f'轉場_VCR {num}'.strip() if num else '轉場_VCR'
            else:
                rest = re.sub(r'^[_\-\s]+', '', rest).strip()
                num_m = re.match(r'^(\d+)', rest)
                if num_m:
                    name = f'轉場_{num_m.group(1)}'
                elif rest:
                    rest = re.split(r'\s*[-–—]\s*', rest)[0].strip()
                    name = f'轉場_{rest}' if rest else '轉場'
                else:
                    name = '轉場'
            results.append(('transition', None, name))
            continue

        if re.search(r'\bVCR\b', ls, re.IGNORECASE):
            m2 = re.search(r'VCR[-\s]*(\w[\w\s]*)?', ls, re.IGNORECASE)
            after = m2.group(1).strip() if m2 and m2.group(1) else ''
            bm = re.match(r"^[\d\s'\"‘’]+(.+?)\s+VCR", ls, re.IGNORECASE)
            before_raw = bm.group(1).strip() if bm else ''
            if not bm:
                bm2 = re.match(r'^(.+?)\s+VCR', ls, re.IGNORECASE)
                before_raw = bm2.group(1).strip() if bm2 else ''
            before = re.sub(r"[\d'\"‘’]+", '', before_raw).strip()
            label = after or before
            label = re.sub(r"[\s'\"‘’“”]+", ' ', label).strip()
            label = clean(label)
            results.append(('transition', None, f'VCR {label}' if label else 'VCR'))
            continue

        m = re.search(r'Chaser[~～]?(.*)', ls, re.IGNORECASE)
        if m:
            sub = clean(m.group(1).strip())
            results.append(('chaser', None, f'Chaser~{sub}' if sub else 'Chaser'))
            continue

    if any(r[0] == 'song' for r in results):
        output = []
        for t, num, title in results:
            if t == 'song':
                output.append(f'S{num:02d} {title}')
            elif t == 'talking':
                output.append(title)
            elif t == 'transition':
                output.append(f'轉場_{title}' if not (title.startswith('轉場') or title.startswith('转场')) else title)
            elif t == 'chaser':
                output.append(title)
        return "\n".join(output)

    non_empty = [l.strip() for l in lines if l.strip()]
    two_col = sum(1 for l in non_empty
                  if re.search(r'\t|　|  {2,}', l)
                  and len(re.split(r'\t|　|  +', l)[0]) <= 10)
    if two_col / max(len(non_empty), 1) > 0.5:
        titles = []; seen = set()
        for line in lines:
            ls2 = line.strip()
            if not ls2: continue
            if re.search(r'歌曲|內容|歌名|曲目|歌手', ls2): continue
            if re.match(r'^[(（].*[)）]$', ls2): continue
            parts = re.split(r'\t|　|  +', ls2, maxsplit=1)
            if len(parts) == 2:
                title = clean(parts[1].strip())
                if title and title not in seen:
                    seen.add(title); titles.append(title)
        if titles:
            return "\n".join(f'S{i:02d} {t}' for i, t in enumerate(titles, 1))

    titles = []; seen = set()
    for line in lines:
        ls2 = line.strip()
        if not ls2: continue
        if re.match(r'^[(（].*[)）]$', ls2): continue
        title = clean(ls2)
        if title and title not in seen and 1 <= len(title) <= 60:
            seen.add(title); titles.append(title)
    return "\n".join(f'S{i:02d} {t}' for i, t in enumerate(titles, 1))

# ══════════════════════════════════════════════════════════════
# UI 顏色常數
BG  = "#0a0a0a"
S1  = "#111111"
S2  = "#181818"
S3  = "#202020"
BD  = "#2a2a2a"
TX  = "#ececec"
TX2 = "#7a7a7a"
TX3 = "#444444"
AC  = "#4ade80"
AC2 = "#22c55e"

# 文字色 preset(VJ 指定的飽和亮色,適合疊在動態背景上)
TEXT_COLOR_PRESETS = [
    ("白", "#ffffff"),
    ("紅", "#ff0000"),
    ("粉", "#ff0080"),
    ("黃", "#ffff00"),
]

TYPE_LABEL = {
    "song":       "歌曲",
    "talking":    "TALKING",
    "transition": "轉場",
    "chaser":     "Chaser",
}

TYPE_ICON = {"song": "♪", "talking": "★", "transition": "→", "chaser": "◎"}


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.settings = load_settings()
        self.title(f"Arena Title Card Generator v{__version__}")
        self.geometry(self.settings.get("window_geometry", "1100x720"))
        self.minsize(960, 600)
        self.configure(bg=BG)

        try:
            load_font(20)
        except RuntimeError as e:
            messagebox.showerror("字型錯誤", str(e))
            self.destroy()
            sys.exit(1)

        self.items = []
        self.sel_idx = None
        self.preview_photo = None
        self.text_color = self.settings.get("text_color", "#ffffff")
        self.transparent_var = tk.BooleanVar(value=self.settings.get("transparent", True))
        self.use_type_colors_var = tk.BooleanVar(value=self.settings.get("use_type_colors", True))
        self.show_mode_var = tk.BooleanVar(value=False)
        self.use_jieba_var = tk.BooleanVar(value=self.settings.get("use_jieba", True))
        self.split_pref_var = tk.StringVar(value=self.settings.get("split_preference_5", "3/2"))
        self.undo_stack = []
        self.MAX_UNDO = 30

        self.logo_image = None
        logo_path = Path(__file__).parent / "assets" / "logo.png"
        if logo_path.exists():
            try:
                img = Image.open(logo_path)
                img.thumbnail((220, 56), Image.LANCZOS)
                self.logo_image = ImageTk.PhotoImage(img)
            except Exception:
                self.logo_image = None

        self._build()

        self.bind("<Control-z>", lambda e: self.undo())
        self.bind("<Control-Z>", lambda e: self.undo())
        self.bind("<Delete>", lambda e: self._delete_selected())
        self.bind("<Alt-Up>", lambda e: self._move_selected(-1))
        self.bind("<Alt-Down>", lambda e: self._move_selected(1))
        self.bind("<Control-d>", lambda e: self._duplicate_selected())
        self.bind("<Control-D>", lambda e: self._duplicate_selected())
        self.bind("<Control-Return>", lambda e: self.export_cards())

        self.protocol("WM_DELETE_WINDOW", self._on_close)

        self.after(150, self._maybe_restore_session)

        if self.settings.get("auto_update_check", True):
            check_for_update_async(self._on_update_available)

    # ────── UI 建構 ──────
    def _build(self):
        self.columnconfigure(1, weight=1)
        self.rowconfigure(0, weight=1)

        left = tk.Frame(self, bg=S1, width=300)
        left.grid(row=0, column=0, sticky="nsew")
        left.grid_propagate(False)
        left.columnconfigure(0, weight=1)
        left.rowconfigure(4, weight=1)

        # Logo / 標題區
        logo_frame = tk.Frame(left, bg=S1, pady=10)
        logo_frame.grid(row=0, column=0, sticky="ew", padx=14)
        if self.logo_image is not None:
            tk.Label(logo_frame, image=self.logo_image, bg=S1).pack(anchor="w")
        else:
            row = tk.Frame(logo_frame, bg=S1)
            row.pack(anchor="w")
            tk.Label(row, text="ARENA", bg=S1, fg=AC, font=("Helvetica", 15, "bold")).pack(side="left")
            tk.Label(row, text=" CARD GEN", bg=S1, fg=TX, font=("Helvetica", 15, "bold")).pack(side="left")
        tk.Label(logo_frame, text=f"演唱會字卡生成系統  v{__version__}",
                 bg=S1, fg=TX3, font=("Helvetica", 9)).pack(anchor="w", pady=(2, 6))
        tk.Button(logo_frame, text="歌曲排序辨識器  ↗", command=self._open_parser,
                  bg=S2, fg=AC, font=("Helvetica", 9), relief="flat", bd=0,
                  padx=10, pady=5, cursor="hand2",
                  activebackground=S3, activeforeground=AC).pack(anchor="w")

        tk.Frame(left, bg=BD, height=1).grid(row=1, column=0, sticky="ew")

        # 輸入區
        inp = tk.Frame(left, bg=S1, padx=14, pady=10)
        inp.grid(row=2, column=0, sticky="ew")

        # ── 快速範本產生器 ──
        tpl_frame = tk.Frame(inp, bg=S2, padx=8, pady=6)
        tpl_frame.pack(fill="x", pady=(0, 6))
        tk.Label(tpl_frame, text="快速產生(append 到輸入框)",
                 bg=S2, fg=TX3, font=("Helvetica", 9, "bold")).grid(row=0, column=0, columnspan=4, sticky="w", pady=(0, 4))

        # 預設範圍變數
        self.tpl_s_from = tk.IntVar(value=1)
        self.tpl_s_to   = tk.IntVar(value=20)
        self.tpl_tk_n   = tk.IntVar(value=5)
        self.tpl_tr_n   = tk.IntVar(value=3)
        self.tpl_ch_n   = tk.IntVar(value=2)

        sp_kw = dict(bg=S1, fg=TX, font=("Courier New", 10), relief="flat",
                     buttonbackground=S3, highlightthickness=1,
                     highlightcolor=AC, highlightbackground=BD, width=4, justify="center")

        # Row 1: S## 範圍
        tk.Label(tpl_frame, text="S", bg=S2, fg=AC, font=("Helvetica", 10, "bold"), width=6, anchor="w")\
            .grid(row=1, column=0, sticky="w", padx=(0, 2), pady=2)
        tk.Spinbox(tpl_frame, from_=1, to=99, textvariable=self.tpl_s_from, **sp_kw)\
            .grid(row=1, column=1, padx=2)
        tk.Label(tpl_frame, text="–", bg=S2, fg=TX2, font=("Helvetica", 10))\
            .grid(row=1, column=2)
        tk.Spinbox(tpl_frame, from_=1, to=99, textvariable=self.tpl_s_to, **sp_kw)\
            .grid(row=1, column=3, padx=2)
        tk.Button(tpl_frame, text="+加入", command=self._tpl_add_songs,
                  bg=AC, fg="#000", font=("Helvetica", 9, "bold"),
                  relief="flat", bd=0, padx=10, cursor="hand2",
                  activebackground=AC2).grid(row=1, column=4, padx=(6, 0), sticky="ew")

        # Row 2: TALKING
        tk.Label(tpl_frame, text="TALKING", bg=S2, fg="#ffeb3b", font=("Helvetica", 10, "bold"), width=6, anchor="w")\
            .grid(row=2, column=0, sticky="w", padx=(0, 2), pady=2)
        tk.Label(tpl_frame, text="共", bg=S2, fg=TX2, font=("Helvetica", 9))\
            .grid(row=2, column=1, sticky="e")
        tk.Spinbox(tpl_frame, from_=1, to=20, textvariable=self.tpl_tk_n, **sp_kw)\
            .grid(row=2, column=2, columnspan=2, padx=2, sticky="w")
        tk.Button(tpl_frame, text="+加入", command=self._tpl_add_talking,
                  bg=S3, fg=TX, font=("Helvetica", 9, "bold"),
                  relief="flat", bd=0, padx=10, cursor="hand2",
                  activebackground="#2a2a30").grid(row=2, column=4, padx=(6, 0), sticky="ew")

        # Row 3: 轉場
        tk.Label(tpl_frame, text="轉場", bg=S2, fg="#ff80ab", font=("Helvetica", 10, "bold"), width=6, anchor="w")\
            .grid(row=3, column=0, sticky="w", padx=(0, 2), pady=2)
        tk.Label(tpl_frame, text="共", bg=S2, fg=TX2, font=("Helvetica", 9))\
            .grid(row=3, column=1, sticky="e")
        tk.Spinbox(tpl_frame, from_=1, to=20, textvariable=self.tpl_tr_n, **sp_kw)\
            .grid(row=3, column=2, columnspan=2, padx=2, sticky="w")
        tk.Button(tpl_frame, text="+加入", command=self._tpl_add_transition,
                  bg=S3, fg=TX, font=("Helvetica", 9, "bold"),
                  relief="flat", bd=0, padx=10, cursor="hand2",
                  activebackground="#2a2a30").grid(row=3, column=4, padx=(6, 0), sticky="ew")

        # Row 4: Chaser
        tk.Label(tpl_frame, text="Chaser", bg=S2, fg="#ff5252", font=("Helvetica", 10, "bold"), width=6, anchor="w")\
            .grid(row=4, column=0, sticky="w", padx=(0, 2), pady=2)
        tk.Label(tpl_frame, text="共", bg=S2, fg=TX2, font=("Helvetica", 9))\
            .grid(row=4, column=1, sticky="e")
        tk.Spinbox(tpl_frame, from_=1, to=20, textvariable=self.tpl_ch_n, **sp_kw)\
            .grid(row=4, column=2, columnspan=2, padx=2, sticky="w")
        tk.Button(tpl_frame, text="+加入", command=self._tpl_add_chaser,
                  bg=S3, fg=TX, font=("Helvetica", 9, "bold"),
                  relief="flat", bd=0, padx=10, cursor="hand2",
                  activebackground="#2a2a30").grid(row=4, column=4, padx=(6, 0), sticky="ew")

        tpl_frame.grid_columnconfigure(0, weight=0)
        tpl_frame.grid_columnconfigure(4, weight=1)

        tk.Label(inp, text="格式(每行一個項目):\nS01 XXX\nTALKING-1\n轉場_XXX\nChaser~XXX",
                 bg=S2, fg=TX3, font=("Courier New", 9), justify="left",
                 padx=10, pady=8).pack(fill="x", pady=(0, 8))

        self.txt = tk.Text(left, bg=S2, fg=TX, insertbackground=AC,
                            font=("Courier New", 11), relief="flat", bd=0, height=8,
                            wrap="word", highlightthickness=1, highlightcolor=AC,
                            highlightbackground=BD, padx=8, pady=8)
        self.txt.grid(row=3, column=0, sticky="ew", padx=14)

        self.btn_gen = tk.Button(inp, text="生成字卡", command=self.generate,
                                 bg=AC, fg="#000", font=("Helvetica", 12, "bold"),
                                 relief="flat", bd=0, pady=10, cursor="hand2",
                                 activebackground=AC2)
        self.btn_gen.pack(fill="x", pady=(10, 0))

        self.lbl_status = tk.Label(inp, text="", bg=S1, fg=TX3,
                                    font=("Helvetica", 9), wraplength=270, justify="left")
        self.lbl_status.pack(anchor="w", pady=(5, 0))

        tk.Frame(left, bg=BD, height=1).grid(row=3, column=0, sticky="sew", pady=(4, 0))

        # 列表區 + 排序按鈕
        lf = tk.Frame(left, bg=S1)
        lf.grid(row=4, column=0, sticky="nsew")
        lf.rowconfigure(0, weight=1); lf.columnconfigure(0, weight=1)
        self.listbox = tk.Listbox(lf, bg=S1, fg=TX2, selectbackground=S3, selectforeground=AC,
                                  font=("Helvetica", 10), relief="flat", bd=0,
                                  activestyle="none", highlightthickness=0)
        self.listbox.grid(row=0, column=0, sticky="nsew")
        sb = tk.Scrollbar(lf, orient="vertical", command=self.listbox.yview,
                          bg=S2, troughcolor=S1, relief="flat", width=6)
        sb.grid(row=0, column=1, sticky="ns")
        self.listbox.configure(yscrollcommand=sb.set)
        self.listbox.bind("<<ListboxSelect>>", self.on_select)

        sort_bar = tk.Frame(left, bg=S1)
        sort_bar.grid(row=5, column=0, sticky="ew", padx=14, pady=(6, 4))
        for txt, cb in [("↑", lambda: self._move_selected(-1)),
                         ("↓", lambda: self._move_selected(1)),
                         ("複製", self._duplicate_selected),
                         ("刪除", self._delete_selected)]:
            tk.Button(sort_bar, text=txt, command=cb,
                      bg=S2, fg=TX2, font=("Helvetica", 9),
                      relief="flat", bd=0, padx=10, pady=4, cursor="hand2",
                      activebackground=S3).pack(side="left", padx=(0, 4))

        tk.Frame(left, bg=BD, height=1).grid(row=6, column=0, sticky="ew")

        # 顏色 / 透明 / 匯出區
        bot = tk.Frame(left, bg=S1, padx=14, pady=10)
        bot.grid(row=7, column=0, sticky="ew")

        tk.Label(bot, text="文字色", bg=S1, fg=TX2, font=("Helvetica", 9)).pack(anchor="w")
        color_row = tk.Frame(bot, bg=S1)
        color_row.pack(fill="x", pady=(4, 8))

        self.color_btns = []
        for label, hex_ in TEXT_COLOR_PRESETS:
            btn = tk.Button(color_row, text=label, width=3,
                            bg=hex_, fg=("#000" if hex_ in ("#ffffff", "#ffff00") else "#fff"),
                            font=("Helvetica", 9, "bold"),
                            relief="flat", bd=0, cursor="hand2",
                            activebackground=hex_,
                            command=lambda h=hex_: self._set_text_color(h))
            btn.pack(side="left", padx=(0, 4))
            self.color_btns.append((btn, hex_))
        tk.Button(color_row, text="自訂", bg=S2, fg=TX2,
                  font=("Helvetica", 9), relief="flat", bd=0,
                  padx=8, cursor="hand2", activebackground=S3,
                  command=self._pick_custom_color).pack(side="left", padx=(0, 4))

        tk.Checkbutton(bot, text="按類型自動配色", variable=self.use_type_colors_var,
                       bg=S1, fg=TX2, selectcolor=S2, activebackground=S1,
                       font=("Helvetica", 9), command=self._on_type_color_toggle,
                       relief="flat", bd=0).pack(anchor="w", pady=(0, 4))

        tk.Checkbutton(bot, text="背景透明 (PNG alpha)", variable=self.transparent_var,
                       bg=S1, fg=TX2, selectcolor=S2, activebackground=S1,
                       font=("Helvetica", 9), command=self._refresh_preview,
                       relief="flat", bd=0).pack(anchor="w", pady=(0, 4))

        tk.Checkbutton(bot, text="演出模式(唯讀)", variable=self.show_mode_var,
                       bg=S1, fg="#ffeb3b", selectcolor=S2, activebackground=S1,
                       font=("Helvetica", 9, "bold"), command=self._on_show_mode_toggle,
                       relief="flat", bd=0).pack(anchor="w", pady=(2, 8))

        self.btn_exp = tk.Button(bot, text="⬇   匯出所有字卡 PNG  (Ctrl+Enter)",
                                 command=self.export_cards,
                                 bg=S2, fg=TX2, font=("Helvetica", 9),
                                 relief="flat", bd=0, pady=10,
                                 cursor="hand2", activebackground=S3, state="disabled")
        self.btn_exp.pack(fill="x")

        # ─── RIGHT: 預覽 + 編輯 ───
        right = tk.Frame(self, bg=BG)
        right.grid(row=0, column=1, sticky="nsew")
        right.rowconfigure(1, weight=1)
        right.columnconfigure(0, weight=1)

        tb = tk.Frame(right, bg=S1, height=46)
        tb.grid(row=0, column=0, sticky="ew")
        tb.grid_propagate(False)
        self.lbl_title = tk.Label(tb, text="預覽", bg=S1, fg=TX,
                                   font=("Helvetica", 12, "bold"))
        self.lbl_title.pack(side="left", padx=20, pady=12)
        tk.Label(tb, text=f"輸出 1920 × 1080 px  ·  jieba: {'on' if HAS_JIEBA else 'off'}",
                 bg=S1, fg=TX3, font=("Helvetica", 8)).pack(side="right", padx=16)
        tk.Frame(right, bg=BD, height=1).grid(row=0, column=0, sticky="sew")

        self.canvas = tk.Canvas(right, bg=BG, highlightthickness=0, bd=0)
        self.canvas.grid(row=1, column=0, sticky="nsew")
        self.canvas.bind("<Configure>", lambda e: self._refresh_preview())

        self.editor = tk.Frame(right, bg=S1, pady=9)
        self.editor.grid(row=2, column=0, sticky="ew")
        self.editor.grid_remove()
        tk.Frame(right, bg=BD, height=1).grid(row=2, column=0, sticky="new")

        ef_l = tk.Frame(self.editor, bg=S1); ef_l.pack(side="left", padx=6)
        tk.Label(ef_l, text="行內容(用 | 分隔多行)",
                 bg=S1, fg=TX3, font=("Helvetica", 8)).pack(anchor="w")
        self.ed_lines = tk.Entry(ef_l, bg=S2, fg=TX, insertbackground=AC,
                                  font=("Courier New", 11), relief="flat",
                                  bd=0, width=32, highlightthickness=1,
                                  highlightcolor=AC, highlightbackground=BD)
        self.ed_lines.pack(pady=(2, 0))
        self.ed_lines.bind("<KeyRelease>", lambda ev: self._live_preview())

        tf = tk.Frame(self.editor, bg=S1); tf.pack(side="left", padx=6)
        tk.Label(tf, text="類型", bg=S1, fg=TX3, font=("Helvetica", 8)).pack(anchor="w")
        self.type_var = tk.StringVar(value="song")
        ttk.Combobox(tf, textvariable=self.type_var, width=11, state="readonly",
                     values=["song", "talking", "transition", "chaser"]).pack(pady=(2, 0))

        tk.Button(self.editor, text="儲存(Enter)", command=self._save_sel,
                  bg=S2, fg=TX2, font=("Helvetica", 9),
                  relief="flat", bd=0, padx=14, pady=6,
                  cursor="hand2", activebackground=S3).pack(side="left", padx=(10, 0), pady=2)
        self.ed_lines.bind("<Return>", lambda e: self._save_sel())

        self._show_empty()
        self._update_color_btn_outlines()

    # ────── 文字色控制 ──────
    def _set_text_color(self, hex_):
        self.text_color = hex_
        self.use_type_colors_var.set(False)
        self.settings["text_color"] = hex_
        self.settings["use_type_colors"] = False
        self._update_color_btn_outlines()
        self._refresh_preview()

    def _pick_custom_color(self):
        from tkinter.colorchooser import askcolor
        result = askcolor(initialcolor=self.text_color, title="選自訂文字色")
        if result and result[1]:
            self._set_text_color(result[1])

    def _update_color_btn_outlines(self):
        for btn, hex_ in self.color_btns:
            if (not self.use_type_colors_var.get()) and hex_.lower() == self.text_color.lower():
                btn.config(highlightthickness=2, highlightbackground=AC)
            else:
                btn.config(highlightthickness=0)

    def _on_type_color_toggle(self):
        self.settings["use_type_colors"] = self.use_type_colors_var.get()
        self._update_color_btn_outlines()
        self._refresh_preview()

    # ────── Show mode ──────
    def _on_show_mode_toggle(self):
        on = self.show_mode_var.get()
        state = "disabled" if on else "normal"
        for w in (self.btn_gen, self.txt):
            try: w.config(state=state)
            except Exception: pass
        if on:
            self.set_st("⚠️ 演出模式:已鎖定編輯,只能匯出", "loading")
        else:
            self.set_st("已解鎖,可以編輯", "ok")

    def _is_locked(self):
        return self.show_mode_var.get()

    # ────── 撤銷 ──────
    def _push_undo(self, desc):
        snap = json.loads(json.dumps(self.items))
        self.undo_stack.append((desc, snap, self.sel_idx))
        if len(self.undo_stack) > self.MAX_UNDO:
            self.undo_stack.pop(0)

    def undo(self):
        if not self.undo_stack:
            return
        desc, snap, idx = self.undo_stack.pop()
        self.items = [self._normalize_item(it) for it in snap]
        self.sel_idx = idx
        self._render_list()
        if idx is not None and 0 <= idx < len(self.items):
            self.listbox.selection_set(idx)
            self._draw_preview_item(self.items[idx])
        self.set_st(f"撤銷:{desc}", "ok")
        save_session(self.items)

    def _normalize_item(self, it):
        # 確保 scaled_lines 是 list of tuples (json 會變成 list of lists)
        sl = it.get("scaled_lines", [])
        normalized = []
        for entry in sl:
            if isinstance(entry, (list, tuple)) and len(entry) == 2:
                normalized.append((entry[0], float(entry[1])))
            else:
                normalized.append((str(entry), 1.0))
        return {"type": it.get("type", "song"), "scaled_lines": normalized}

    # ────── 排序 / 刪除 / 複製 ──────
    def _move_selected(self, delta):
        if self._is_locked() or self.sel_idx is None:
            return
        new_idx = self.sel_idx + delta
        if not (0 <= new_idx < len(self.items)):
            return
        self._push_undo("移動排序")
        self.items[self.sel_idx], self.items[new_idx] = self.items[new_idx], self.items[self.sel_idx]
        self.sel_idx = new_idx
        self._render_list()
        self.listbox.selection_set(new_idx)
        save_session(self.items)

    def _delete_selected(self):
        if self._is_locked() or self.sel_idx is None:
            return
        if not messagebox.askyesno("確認", "刪除選中的字卡?"):
            return
        self._push_undo("刪除字卡")
        del self.items[self.sel_idx]
        if self.sel_idx >= len(self.items):
            self.sel_idx = max(0, len(self.items) - 1) if self.items else None
        self._render_list()
        if self.sel_idx is not None and self.items:
            self.listbox.selection_set(self.sel_idx)
            self._draw_preview_item(self.items[self.sel_idx])
        else:
            self.editor.grid_remove()
            self._show_empty()
        if not self.items:
            self.btn_exp.config(state="disabled")
        save_session(self.items)

    def _duplicate_selected(self):
        if self._is_locked() or self.sel_idx is None:
            return
        self._push_undo("複製字卡")
        clone = json.loads(json.dumps(self.items[self.sel_idx]))
        self.items.insert(self.sel_idx + 1, self._normalize_item(clone))
        self.sel_idx += 1
        self._render_list()
        self.listbox.selection_set(self.sel_idx)
        save_session(self.items)

    # ────── 快速範本產生器 ──────
    def _tpl_append(self, lines):
        """把生成的行 append 到 textarea(自動處理換行 / 刪空行)。"""
        existing = self.txt.get("1.0", tk.END).rstrip()
        new_block = "\n".join(lines)
        combined = (existing + "\n" + new_block) if existing else new_block
        # 一律刪空行
        combined = "\n".join(l for l in combined.split("\n") if l.strip())
        self.txt.delete("1.0", tk.END)
        self.txt.insert("1.0", combined)
        self.set_st(f"+ 已加入 {len(lines)} 行,記得按「生成字卡」", "ok")

    def _tpl_add_songs(self):
        a = self.tpl_s_from.get()
        b = self.tpl_s_to.get()
        if a > b: a, b = b, a
        if b - a > 99:
            messagebox.showwarning("提示", "範圍太大(>99),請分批")
            return
        lines = [f"S{n:02d} " for n in range(a, b + 1)]
        self._tpl_append(lines)

    def _tpl_add_talking(self):
        n = self.tpl_tk_n.get()
        lines = [f"TALKING-{i}" for i in range(1, n + 1)]
        self._tpl_append(lines)

    def _tpl_add_transition(self):
        n = self.tpl_tr_n.get()
        lines = [f"轉場_{i:02d}" for i in range(1, n + 1)]
        self._tpl_append(lines)

    def _tpl_add_chaser(self):
        n = self.tpl_ch_n.get()
        lines = [f"Chaser~" for _ in range(n)]
        self._tpl_append(lines)

    # ────── 生成 ──────
    def generate(self):
        if self._is_locked():
            return
        raw = self.txt.get("1.0", tk.END).strip()
        if not raw:
            self.set_st("請先輸入歌單文字", "err")
            return

        if self.items and not messagebox.askyesno(
            "確認重新生成",
            f"目前有 {len(self.items)} 張字卡。\n重新生成會覆蓋所有編輯,確定嗎?"
        ):
            return

        self._push_undo("生成字卡")
        prefer = self.split_pref_var.get()
        use_jieba = self.use_jieba_var.get()
        self.items = parse_setlist(raw, prefer=prefer, use_jieba=use_jieba)
        if not self.items:
            self.set_st("無法解析,請確認格式", "err")
            return
        self.sel_idx = None
        self.editor.grid_remove()
        self._render_list()
        self._show_empty()
        self.btn_exp.config(state="normal")
        self.set_st(f"✓ 已生成 {len(self.items)} 張字卡", "ok")
        save_session(self.items)

    # ────── 列表渲染 / 選取 / 編輯 ──────
    def _render_list(self):
        self.listbox.delete(0, tk.END)
        for i, it in enumerate(self.items):
            icon = TYPE_ICON.get(it.get("type"), "·")
            text_repr = "｜".join(t for t, _ in it.get("scaled_lines", []))
            self.listbox.insert(tk.END, f"  {i+1:>3}  {icon}  {text_repr}")

    def on_select(self, _=None):
        sel = self.listbox.curselection()
        if not sel:
            return
        i = sel[0]
        if i >= len(self.items):
            return
        self.sel_idx = i
        it = self.items[i]
        if not self._is_locked():
            self.ed_lines.delete(0, tk.END)
            text_repr = "|".join(t for t, _ in it.get("scaled_lines", []))
            self.ed_lines.insert(0, text_repr)
            self.type_var.set(it.get("type", "song"))
            self.editor.grid()
        else:
            self.editor.grid_remove()
        last_text = it["scaled_lines"][-1][0] if it.get("scaled_lines") else ""
        self.lbl_title.config(text=last_text)
        self._draw_preview_item(it)

    def _live_preview(self):
        if self.sel_idx is None:
            return
        raw_text = self.ed_lines.get()
        parts = [p.strip() for p in raw_text.split("|") if p.strip()]
        if not parts:
            return
        type_ = self.type_var.get()
        # 預覽用 — 重新跑 auto_split 讓字級正確
        if type_ == "song":
            scaled = []
            if parts and re.match(r"^S\d+$", parts[0], re.IGNORECASE):
                num = parts[0]
                title = " ".join(parts[1:])
                scaled = auto_split(num, title,
                                    self.split_pref_var.get(),
                                    self.use_jieba_var.get())
            else:
                scaled = [(p, 1.0) for p in parts]
        elif type_ == "talking":
            scaled = [(parts[0], 1.0)]
        elif type_ == "transition":
            if len(parts) > 1:
                scaled = [(parts[0], 0.4)] + [(p, 1.0) for p in parts[1:]]
            else:
                scaled = [(parts[0], 1.0)]
        elif type_ == "chaser":
            if len(parts) > 1:
                scaled = [(parts[0], 0.4)] + [(p, 1.0) for p in parts[1:]]
            else:
                scaled = [(parts[0], 1.0)]
        else:
            scaled = [(p, 1.0) for p in parts]
        self._draw_preview({"type": type_, "scaled_lines": scaled})

    def _save_sel(self):
        if self._is_locked() or self.sel_idx is None:
            return
        raw_text = self.ed_lines.get()
        parts = [p.strip() for p in raw_text.split("|") if p.strip()]
        if not parts:
            return
        self._push_undo("編輯字卡")
        type_ = self.type_var.get()
        if type_ == "song":
            if parts and re.match(r"^S\d+$", parts[0], re.IGNORECASE):
                num = parts[0]
                title = " ".join(parts[1:])
                scaled = auto_split(num, title,
                                    self.split_pref_var.get(),
                                    self.use_jieba_var.get())
            else:
                scaled = [(p, 1.0) for p in parts]
        elif type_ == "transition":
            if len(parts) > 1:
                scaled = [(parts[0], 0.4)] + [(p, 1.0) for p in parts[1:]]
            else:
                scaled = [(parts[0], 1.0)]
        elif type_ == "chaser":
            if len(parts) > 1:
                scaled = [(parts[0], 0.4)] + [(p, 1.0) for p in parts[1:]]
            else:
                scaled = [(parts[0], 1.0)]
        else:
            scaled = [(parts[0], 1.0)]
        self.items[self.sel_idx]["type"] = type_
        self.items[self.sel_idx]["scaled_lines"] = scaled
        self._render_list()
        self.listbox.selection_set(self.sel_idx)
        self._draw_preview_item(self.items[self.sel_idx])
        save_session(self.items)
        self.set_st("✓ 已儲存", "ok")

    # ────── 預覽繪製 ──────
    def _refresh_preview(self):
        if self.sel_idx is not None and self.sel_idx < len(self.items):
            self._draw_preview_item(self.items[self.sel_idx])
        else:
            self._show_empty()

    def _draw_preview_item(self, item):
        self._draw_preview(item)

    def _draw_preview(self, item):
        scaled = item.get("scaled_lines", [])
        if not scaled:
            return
        color = self._color_for_item(item)
        try:
            card = make_card(scaled, text_color=color, transparent=False)
        except RuntimeError as e:
            messagebox.showerror("字型錯誤", str(e))
            return
        # 檢查棋盤格 (透明背景視覺回饋)
        if self.transparent_var.get():
            card_alpha = make_card(scaled, text_color=color, transparent=True)
            card = self._composite_checkerboard(card_alpha)

        w = max(self.canvas.winfo_width(), 100)
        h = max(self.canvas.winfo_height(), 100)
        if w / h > 16 / 9:
            pw = int(h * 16 / 9); ph = h
        else:
            pw = w; ph = int(w * 9 / 16)
        pw = max(pw - 20, 10); ph = max(ph - 20, 10)
        card = card.resize((pw, ph), Image.LANCZOS)
        self.preview_photo = ImageTk.PhotoImage(card)
        self.canvas.delete("all")
        self.canvas.create_image(w // 2, h // 2, image=self.preview_photo, anchor="center")

    def _composite_checkerboard(self, card_rgba):
        cb_size = 40
        bg = Image.new("RGBA", card_rgba.size, (40, 40, 40, 255))
        draw = ImageDraw.Draw(bg)
        for y in range(0, card_rgba.size[1], cb_size):
            for x in range(0, card_rgba.size[0], cb_size):
                if ((x // cb_size) + (y // cb_size)) % 2 == 0:
                    draw.rectangle([x, y, x + cb_size, y + cb_size], fill=(60, 60, 60, 255))
        bg.alpha_composite(card_rgba)
        return bg.convert("RGB")

    def _color_for_item(self, item):
        if self.use_type_colors_var.get():
            tc = self.settings.get("type_colors", {})
            return tc.get(item.get("type", "song"), "#ffffff")
        return self.text_color

    def _show_empty(self):
        self.canvas.delete("all")
        w = max(self.canvas.winfo_width(), 400)
        h = max(self.canvas.winfo_height(), 300)
        msg = "輸入歌單後按「生成字卡」\n點選左側曲目預覽"
        if self._is_locked():
            msg = "演出模式:解鎖後才能編輯\n選列表可預覽"
        self.canvas.create_text(w // 2, h // 2, text=msg,
                                 fill="#2a2a2a", font=("Helvetica", 13), justify="center")

    # ────── 辨識器子視窗 ──────
    def _open_parser(self):
        if self._is_locked():
            return
        def on_import(text):
            if self.items and not messagebox.askyesno(
                "確認", f"主視窗已有 {len(self.items)} 張字卡,匯入會清空,確定嗎?"
            ):
                return
            self.txt.delete("1.0", tk.END)
            self.txt.insert("1.0", text)
        ParserWindow(self, on_import=on_import)

    # ────── 匯出(snapshot + checklist + 開啟資料夾)──────
    def _run_checklist(self):
        problems, warnings = [], []
        try:
            load_font(20)
        except RuntimeError as e:
            problems.append(f"字型載入失敗: {e}")

        empties = [i + 1 for i, it in enumerate(self.items)
                    if not it.get("scaled_lines")]
        if empties:
            problems.append(f"以下字卡內容為空: {empties}")

        names = []
        for it in self.items:
            base = "_".join(t for t, _ in it.get("scaled_lines", []))
            safe = "".join(c for c in base if c not in r'\/:*?"<>|')
            names.append(safe)
        dup = [n for n, c in Counter(names).items() if c > 1 and n]
        if dup:
            warnings.append(f"檔名重複: {', '.join(dup)}")

        truncated = []
        for i, it in enumerate(self.items):
            if any("…" in t for t, _ in it.get("scaled_lines", [])):
                truncated.append(i + 1)
        if truncated:
            warnings.append(f"以下字卡標題被截斷: {truncated}")

        return problems, warnings

    def export_cards(self):
        if not self.items:
            messagebox.showinfo("提示", "請先生成字卡")
            return

        problems, warnings = self._run_checklist()
        if problems or warnings:
            msg_parts = []
            if problems:
                msg_parts.append("❌ 問題:\n" + "\n".join(f"  • {p}" for p in problems))
            if warnings:
                msg_parts.append("⚠ 警告:\n" + "\n".join(f"  • {w}" for w in warnings))
            msg_parts.append("仍要匯出嗎?")
            if not messagebox.askyesno("匯出檢查", "\n\n".join(msg_parts)):
                return

        folder = filedialog.askdirectory(
            title="選擇儲存資料夾",
            initialdir=self.settings.get("last_export_folder") or os.path.expanduser("~")
        )
        if not folder:
            return
        self.settings["last_export_folder"] = folder
        save_settings(self.settings)

        snap = {
            "items": [self._normalize_item(json.loads(json.dumps(it))) for it in self.items],
            "transparent": self.transparent_var.get(),
            "text_color": self.text_color,
            "use_type_colors": self.use_type_colors_var.get(),
            "type_colors": dict(self.settings.get("type_colors", {})),
        }
        threading.Thread(target=self._do_export, args=(folder, snap), daemon=True).start()

    def _do_export(self, folder, snap):
        items = snap["items"]
        tr = snap["transparent"]
        total = len(items)
        try:
            for i, it in enumerate(items):
                n = i + 1
                self.after(0, lambda n=n: self.set_st(f"匯出中 {n}/{total}...", "loading"))
                color = self._snapshot_color(it, snap)
                card = make_card(it["scaled_lines"], text_color=color, transparent=tr)
                base = "_".join(t for t, _ in it["scaled_lines"])
                safe = "".join(c for c in base if c not in r'\/:*?"<>|')
                if not safe:
                    safe = f"card_{n:03d}"
                card.save(os.path.join(folder, f"{safe}.png"))
            self.after(0, lambda: self.set_st(f"✓ {total} 張字卡已匯出!", "ok"))
            self.after(0, lambda: self._after_export(folder, total))
        except Exception as e:
            self.after(0, lambda err=e: self.set_st(f"匯出失敗:{err}", "err"))
            self.after(0, lambda err=e: messagebox.showerror("匯出失敗", str(err)))

    def _snapshot_color(self, item, snap):
        if snap.get("use_type_colors", True):
            return snap.get("type_colors", {}).get(item.get("type", "song"), "#ffffff")
        return snap.get("text_color", "#ffffff")

    def _after_export(self, folder, total):
        try:
            if sys.platform == "win32":
                os.startfile(folder)
            elif sys.platform == "darwin":
                subprocess.Popen(["open", folder])
            else:
                subprocess.Popen(["xdg-open", folder])
        except Exception:
            pass
        messagebox.showinfo("完成", f"{total} 張字卡已儲存至:\n{folder}\n\n(資料夾已開啟,可直接拖入 Resolume)")

    # ────── 狀態列 ──────
    def set_st(self, msg, level=""):
        c = {"ok": AC, "err": "#f87171", "loading": "#60a5fa", "": TX3}
        self.lbl_status.config(text=msg, fg=c.get(level, TX3))

    # ────── Session / 更新 / 關閉 ──────
    def _maybe_restore_session(self):
        sess = load_session()
        if not sess:
            return
        items = sess.get("items") or []
        if not items:
            return
        n = len(items)
        if messagebox.askyesno("恢復上次工作", f"找到上次未匯出的工作({n} 張字卡),要恢復嗎?"):
            self.items = [self._normalize_item(it) for it in items]
            self._render_list()
            self.btn_exp.config(state="normal")
            self.set_st(f"✓ 已恢復 {n} 張字卡", "ok")
        else:
            clear_session()

    def _on_update_available(self, new_version, url):
        def show():
            if messagebox.askyesno(
                "有新版本",
                f"目前版本:v{__version__}\n最新版本:v{new_version}\n\n要開啟下載頁嗎?"
            ):
                try:
                    if sys.platform == "win32":
                        os.startfile(url)
                    elif sys.platform == "darwin":
                        subprocess.Popen(["open", url])
                    else:
                        subprocess.Popen(["xdg-open", url])
                except Exception:
                    pass
        self.after(0, show)

    def _on_close(self):
        try:
            self.settings["window_geometry"] = self.geometry()
            self.settings["transparent"] = self.transparent_var.get()
            self.settings["use_type_colors"] = self.use_type_colors_var.get()
            self.settings["text_color"] = self.text_color
            self.settings["use_jieba"] = self.use_jieba_var.get()
            self.settings["split_preference_5"] = self.split_pref_var.get()
            save_settings(self.settings)
            if self.items:
                save_session(self.items)
            else:
                clear_session()
        except Exception:
            pass
        self.destroy()


class ParserWindow(tk.Toplevel):
    def __init__(self, master, on_import=None):
        super().__init__(master)
        self.title("歌曲排序辨識器")
        self.geometry("960x640")
        self.configure(bg=BG)
        self.on_import = on_import
        self._build()

    def _build(self):
        self.columnconfigure(0, weight=1)
        self.columnconfigure(1, weight=1)
        self.rowconfigure(1, weight=1)

        hdr = tk.Frame(self, bg=S1, pady=12)
        hdr.grid(row=0, column=0, columnspan=2, sticky="ew")
        tk.Label(hdr, text="歌曲排序辨識器", bg=S1, fg=AC,
                 font=("Helvetica", 14, "bold")).pack(side="left", padx=18)
        tk.Label(hdr, text="貼入任意格式歌單  →  自動辨識  →  匯入字卡生成器",
                 bg=S1, fg=TX3, font=("Helvetica", 9)).pack(side="left")
        tk.Frame(self, bg=BD, height=1).grid(row=0, column=0, columnspan=2, sticky="sew")

        lf = tk.Frame(self, bg=S1)
        lf.grid(row=1, column=0, sticky="nsew", padx=(0, 1))
        lf.rowconfigure(1, weight=1); lf.columnconfigure(0, weight=1)
        tk.Label(lf, text="貼入原始歌詞 / 節目單文字",
                 bg=S1, fg=TX2, font=("Helvetica", 9)).grid(row=0, column=0, sticky="w", padx=14, pady=(10, 4))
        self.txt_in = tk.Text(lf, bg=S2, fg=TX, insertbackground=AC,
                               font=("Courier New", 10), relief="flat", bd=0, wrap="word",
                               highlightthickness=1, highlightcolor=BD,
                               highlightbackground=BD, padx=10, pady=10)
        self.txt_in.grid(row=1, column=0, sticky="nsew", padx=10, pady=(0, 10))

        rf = tk.Frame(self, bg=S1)
        rf.grid(row=1, column=1, sticky="nsew")
        rf.rowconfigure(1, weight=1); rf.columnconfigure(0, weight=1)
        tk.Label(rf, text="辨識結果(可直接複製或匯入)",
                 bg=S1, fg=TX2, font=("Helvetica", 9)).grid(row=0, column=0, sticky="w", padx=14, pady=(10, 4))
        self.txt_out = tk.Text(rf, bg="#0a1a0a", fg=AC, insertbackground=AC,
                                font=("Courier New", 11), relief="flat", bd=0, wrap="word",
                                highlightthickness=1, highlightcolor=AC,
                                highlightbackground=BD, padx=10, pady=10)
        self.txt_out.grid(row=1, column=0, sticky="nsew", padx=10, pady=(0, 10))

        tk.Frame(self, bg=BD, height=1).grid(row=2, column=0, columnspan=2, sticky="ew")
        btn_row = tk.Frame(self, bg=BG, pady=10)
        btn_row.grid(row=3, column=0, columnspan=2, sticky="ew", padx=14)

        tk.Button(btn_row, text="自動辨識歌名", command=self.do_parse,
                  bg=AC, fg="#000", font=("Helvetica", 11, "bold"),
                  relief="flat", bd=0, padx=20, pady=8, cursor="hand2",
                  activebackground=AC2).pack(side="left", padx=(0, 8))
        tk.Button(btn_row, text="匯入字卡生成器", command=self.do_import,
                  bg=S2, fg=TX, font=("Helvetica", 10),
                  relief="flat", bd=0, padx=20, pady=8,
                  cursor="hand2", activebackground=S3).pack(side="left", padx=(0, 8))
        tk.Button(btn_row, text="清除", command=self.do_clear,
                  bg=S2, fg=TX3, font=("Helvetica", 9),
                  relief="flat", bd=0, padx=14, pady=8,
                  cursor="hand2", activebackground=S3).pack(side="left")

        self.lang_var = tk.StringVar(value='繁')
        lang_f = tk.Frame(btn_row, bg=S2, padx=2)
        lang_f.pack(side='left', padx=(8, 0))
        for _lbl, _val in [('繁體', '繁'), ('简体', '簡')]:
            tk.Radiobutton(lang_f, text=_lbl, variable=self.lang_var, value=_val,
                           bg=S2, fg=TX2, selectcolor=S3, activebackground=S2,
                           font=('Helvetica', 9), relief='flat', bd=0,
                           command=self.on_lang_change).pack(side='left', padx=3, pady=2)

        self.lbl_st = tk.Label(btn_row, text="", bg=BG, fg=TX3, font=("Helvetica", 9))
        self.lbl_st.pack(side="left", padx=14)

    def do_parse(self):
        raw = self.txt_in.get("1.0", tk.END).strip()
        if not raw:
            self.lbl_st.config(text="請先貼入文字", fg="#f87171")
            return
        result = parse_song_list_from_text(raw)
        self.txt_out.delete("1.0", tk.END)
        self.txt_out.insert("1.0", result)
        count = len([l for l in result.splitlines() if l.strip()])
        self.lbl_st.config(text=f"✓  找到 {count} 首歌", fg=AC)

    def do_import(self):
        result = self.txt_out.get("1.0", tk.END).strip()
        if not result:
            self.lbl_st.config(text="請先辨識", fg="#f87171")
            return
        if self.on_import:
            self.on_import(result)
            self.lbl_st.config(text="✓  已匯入字卡生成器!", fg=AC)

    def on_lang_change(self):
        result = self.txt_out.get("1.0", tk.END).strip()
        if not result:
            return
        if self.lang_var.get() == '簡':
            converted = to_simplified(result)
        else:
            converted = to_traditional(result)
        self.txt_out.delete("1.0", tk.END)
        self.txt_out.insert("1.0", converted)

    def do_clear(self):
        self.txt_in.delete("1.0", tk.END)
        self.txt_out.delete("1.0", tk.END)
        self.lbl_st.config(text="")


if __name__ == "__main__":
    app = App()
    app.mainloop()
