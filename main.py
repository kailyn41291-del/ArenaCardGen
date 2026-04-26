import sys, os, re, threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from PIL import Image, ImageDraw, ImageFont

# ── 輸出尺寸 ────────────────────────────────────────────────
OUT_W, OUT_H = 1920, 1080

# ── 繁簡轉換 ────────────────────────────────────────────────
_S2T_MAP = {
    '爱':'愛','罢':'罷','备':'備','笔':'筆','边':'邊','标':'標','别':'別',
    '补':'補','才':'才','采':'採','层':'層','产':'產','长':'長','场':'場',
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
    '问':'問','务':'務','西':'西','献':'獻','响':'響','向':'嚮','写':'寫',
    '学':'學','样':'樣','义':'義','议':'議','艺':'藝','应':'應','优':'優',
    '远':'遠','运':'運','战':'戰','张':'張','这':'這','帧':'幀','执':'執',
    '志':'誌','质':'質','众':'眾','转':'轉','庄':'莊','总':'總','组':'組',
    '做':'做','华':'華','语':'語','话':'話','画':'畫','还':'還','后':'後',
    '怀':'懷','坏':'壞','护':'護','获':'獲','际':'際','继':'繼','计':'計',
    '记':'記','际':'際','减':'減','简':'簡','键':'鍵','讲':'講','奖':'獎',
    '缘':'緣','级':'級','继':'繼','给':'給','个':'個','尽':'盡','景':'景',
    '竞':'競','旧':'舊','剧':'劇','惊':'驚','鸡':'雞','汇':'匯','轰':'轟',
    '坚':'堅','监':'監','阵':'陣','针':'針','真':'真','证':'證','职':'職',
    '纸':'紙','只':'只','知':'知','终':'終','钟':'鐘','种':'種','众':'眾',
    '轴':'軸','专':'專','壮':'壯','准':'準','资':'資','字':'字','紫':'紫',
    '综':'綜','总':'總','纵':'縱','走':'走','族':'族','诉':'訴','随':'隨',
    '岁':'歲','孙':'孫','损':'損','讨':'討','痛':'痛','统':'統','退':'退',
    '阳':'陽','业':'業','遗':'遺','忆':'憶','邮':'郵','语':'語','预':'預',
    '员':'員','园':'園','缘':'緣','愿':'願','约':'約','云':'雲','杂':'雜',
    '灾':'災','则':'則','责':'責','增':'增','赞':'讚','择':'擇','债':'債',
    '战':'戰','帐':'帳','诊':'診','镇':'鎮','争':'爭','整':'整','证':'證',
    '识':'識','设':'設','联':'聯','决':'決','际':'際','协':'協','维':'維',
    '荐':'薦','调':'調','损':'損','误':'誤','状':'狀','础':'礎','础':'礎',
    '里':'裡','恋':'戀','兰':'蘭','罗':'羅',
    '丽':'麗','树':'樹','桥':'橋','晓':'曉',
    '龙':'龍','马':'馬','鸟':'鳥','鱼':'魚',
    '乡':'鄉','钻':'鑽','饰':'飾','摄':'攝',
    '纪':'紀','较':'較','态':'態','势':'勢',
    '恶':'惡','湾':'灣','亿':'億','规':'規',
    '虑':'慮','权':'權','须':'須','赖':'賴',
    '码':'碼','类':'類','线':'線','级':'級',
    '变':'變','该':'該','观':'觀','场':'場',
    '尝':'嘗','偿':'償','偿':'償','赏':'賞',
    '尝':'嘗','肤':'膚','肾':'腎','脏':'臟',
    '舱':'艙','舰':'艦','航':'航','载':'載',
}
_T2S_MAP = {v:k for k,v in _S2T_MAP.items()}

def to_simplified(text):
    return text.translate(str.maketrans(_T2S_MAP))

def to_traditional(text):
    return text.translate(str.maketrans(_S2T_MAP))


def get_font_path():
    candidates = {
        "win32":  ["C:/Windows/Fonts/msjhbd.ttc","C:/Windows/Fonts/msjh.ttc","C:/Windows/Fonts/arial.ttf"],
        "darwin": ["/System/Library/Fonts/PingFang.ttc","/System/Library/Fonts/STHeiti Medium.ttc"],
    }
    linux = ["/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc",
             "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"]
    for p in candidates.get(sys.platform, linux):
        if os.path.exists(p):
            return p
    return None

FONT_PATH = get_font_path()

def load_font(size_pt):
    if FONT_PATH:
        try: return ImageFont.truetype(FONT_PATH, size_pt)
        except: pass
    return ImageFont.load_default()

def tsz(draw, text, font):
    bb = draw.textbbox((0,0), text, font=font)
    return bb[2]-bb[0], bb[3]-bb[1]

# ── 字卡生成 ────────────────────────────────────────────────
def make_card(lines, bg_color="#111111", transparent=False, size=(OUT_W,OUT_H)):
    w, h = size
    pad = int(w*0.04)
    avail_w = w - pad*2
    avail_h = int(h*0.90)
    if transparent:
        img = Image.new("RGBA", (w,h), (0,0,0,0))
        fg  = (255,255,255,255)
    else:
        r=int(bg_color[1:3],16); g=int(bg_color[3:5],16); b=int(bg_color[5:7],16)
        img = Image.new("RGB", (w,h), (r,g,b))
        fg  = "#ffffff"
    draw = ImageDraw.Draw(img)
    cx = w//2
    chosen_f=load_font(8); chosen_lh=20; chosen_gap=3; chosen_total=20
    for fs in range(400,8,-2):
        f=load_font(fs)
        line_h=max(tsz(draw,l,f)[1] for l in lines)
        gap=int(line_h*0.15)
        total=line_h*len(lines)+gap*(len(lines)-1)
        max_lw=max(tsz(draw,l,f)[0] for l in lines)
        if max_lw<=avail_w and total<=avail_h:
            chosen_f=f; chosen_lh=line_h; chosen_gap=gap; chosen_total=total
            break
    y=h//2-chosen_total//2
    for line in lines:
        draw.text((cx,y), line, font=chosen_f, fill=fg, anchor="mt")
        y+=chosen_lh+chosen_gap
    return img

# ── 折行邏輯 ────────────────────────────────────────────────
def auto_split(num, title):
    """
    智慧折行：
    - ft./feat. 永遠獨立成一行
    - 英文：3個單字以內不折，超過按空格均分
    - 中文：6字以內不折，超過按字元均切
    """
    ft_part = ""
    main_title = title
    ft_m = re.search(r'\s*(ft\.|feat\.)\s*(.+)$', title, re.IGNORECASE)
    if ft_m:
        ft_part = ft_m.group(1).rstrip() + ft_m.group(2)
        main_title = title[:ft_m.start()].strip()

    def split_main(text):
        n = len(text)
        eng = len(re.findall(r"[a-zA-Z]", text)) / max(n,1)
        if eng > 0.4:
            words = text.split()
            if len(words) <= 3:
                return [text]
            mid = len(words)//2
            return [" ".join(words[:mid]), " ".join(words[mid:])]
        else:
            if n <= 6: return [text]
            chars = list(text)
            mid = (n+1)//2
            return ["".join(chars[:mid]), "".join(chars[mid:])]

    prefix     = [num] if num else []
    main_lines = split_main(main_title) if main_title else []
    ft_lines   = [ft_part] if ft_part else []
    return prefix + main_lines + ft_lines

# ── 字卡歌單解析（給主視窗用）─────────────────────────────
def parse_setlist(text):
    """把每行文字解析成字卡 dict，供字卡生成器使用"""
    items = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line: continue
        up = line.upper()
        if re.match(r"TALKING", up):
            m = re.match(r"(TALKING-?\d*)(.*)", line, re.IGNORECASE)
            items.append({"type":"talking","lines":[m.group(1).upper() if m else "TALKING"]})
        elif re.match(r"\u8f49\u5834", line):
            rest = re.sub(r"^\u8f49\u5834[_\-\s]*","",line).strip()
            items.append({"type":"transition","lines":["\u8f49\u5834",rest] if rest else ["\u8f49\u5834"]})
        elif re.match(r"Chaser", line, re.IGNORECASE):
            m = re.match(r"(Chaser~?)(.*)", line, re.IGNORECASE)
            if m and m.group(2).strip():
                items.append({"type":"chaser","lines":[m.group(1), m.group(2).strip()]})
            else:
                items.append({"type":"chaser","lines":[line]})
        else:
            m = re.match(r"^(S\d+)[_\s]+(.+)$", line, re.IGNORECASE)
            if m:
                items.append({"type":"song","lines":auto_split(m.group(1).upper(), m.group(2).strip())})
            else:
                items.append({"type":"song","lines":auto_split("", line.replace("_"," ").strip())})
    return items

# ── 歌單辨識（給辨識器用，輸入雜亂文字，輸出純文字歌單）──
def parse_song_list_from_text(text):
    lines = text.splitlines()

    def clean(t):
        t = re.sub(r'[(（][^)）]*[)）]', '', t).strip()
        t = re.sub(r'<[^>]+>', '', t).strip()
        # 時間標記截斷
        t = re.sub(r"\s+\d+['\u2018\u2019]\d+[\"\/].*$", '', t).strip()
        t = re.sub(r"\s+\d+'\d+\".*$", '', t).strip()
        # 舞台說明截斷（空格/頓號/破折號後接關鍵字）
        stage = (r'[\s\u3000、,，–\u2014\u2013]+'
                 r'(?:舞者|服裝|服装|[\w]*道具|小舞台|大舞台|升降|左台|右台'
                 r'|合音|合唱|Bass|GT|gt|CO\d|鋼琴|鍵盤|钢琴|键盘'
                 r'|花朵|彩虹|彩條|氣球|風扇|风扇|噴桶|搖滾|摇滚'
                 r'|現身|退場|上場|下場|特製|特制|男舞|女舞|\*\d'
                 r'|樂手|配乐|竖琴|Disco|Intro|打造|人生)')
        m = re.search(stage, t, re.IGNORECASE)
        if m:
            t = t[:m.start()].strip()
        # 多餘空格壓縮
        t = re.sub(r'\s+', ' ', t)
        return t.strip('\u25a0\u2605\u25b6\u25b7\u25c6\u25c7\u2192\u2190'
                       '\xb7\u3002\uff0c\u3001/\uff0f\u3000\'"–\u2014\u2013 ')

    results = []
    seen_titles = set()

    for line in lines:
        ls = line.strip()
        if not ls:
            continue

        # ── SONG 編號 ────────────────────────────────────────
        m = re.search(r'SONG\s*(\d+)\s*[:\uff1a]\s*(.+)', ls, re.IGNORECASE)
        if not m:
            m = re.search(r'\bS(\d+)\s*[:\uff1a\.]\s*(.+)', ls, re.IGNORECASE)
        if m:
            num = int(m.group(1))
            title = clean(m.group(2))
            if title and title not in seen_titles:
                seen_titles.add(title)
                results.append(('song', num, title))
            continue

        # ── Talking ──────────────────────────────────────────
        m = re.search(r'Talking\s*(\d+)', ls, re.IGNORECASE)
        if m:
            results.append(('talking', None, f'TALKING-{m.group(1)}'))
            continue
        if re.match(r'^TALKING\s*[-\s]*\d+', ls, re.IGNORECASE):
            m2 = re.search(r'(\d+)', ls)
            num = m2.group(1) if m2 else ''
            results.append(('talking', None, f'TALKING-{num}' if num else 'TALKING'))
            continue

        # ── 轉場（繁簡體都支援）────────────────────────────
        m = re.match(r'[轉转][場场]', ls)
        if m:
            # 先去掉行首的繁/簡體轉場字，取後面的內容
            rest = re.sub(r'^[轉转][場场]\s*', '', ls).strip()

            if re.match(r'VCR', rest, re.IGNORECASE):
                # 轉場VCR 02 → 轉場_VCR 02
                m2 = re.search(r'VCR\s*[-–]?\s*(\d+)?', rest, re.IGNORECASE)
                num = m2.group(1).strip() if m2 and m2.group(1) else ''
                name = f'轉場_VCR {num}'.strip() if num else '轉場_VCR'
            else:
                # 去掉開頭的分隔符
                rest = re.sub(r'^[_\-\s]+', '', rest).strip()
                # 只取數字（轉場03）或數字+後面名稱的數字部分
                num_m = re.match(r'^(\d+)', rest)
                if num_m:
                    name = f'轉場_{num_m.group(1)}'
                elif rest:
                    # 有名稱：轉場_娜娜KTV，但去掉後面的說明（–或 - 之後）
                    rest = re.split(r'\s*[-–—]\s*', rest)[0].strip()
                    name = f'轉場_{rest}' if rest else '轉場'
                else:
                    name = '轉場'
            results.append(('transition', None, name))
            continue

        # ── VCR（行內 VCR，如 Opening VCR）──────────────────
        if re.search(r'\bVCR\b', ls, re.IGNORECASE):
            m2 = re.search(r'VCR[-\s]*(\w[\w\s]*)?', ls, re.IGNORECASE)
            after = m2.group(1).strip() if m2 and m2.group(1) else ''
            bm = re.match(r"^[\d\s'\"\u2018\u2019]+(.+?)\s+VCR", ls, re.IGNORECASE)
            before_raw = bm.group(1).strip() if bm else ''
            if not bm:
                bm2 = re.match(r'^(.+?)\s+VCR', ls, re.IGNORECASE)
                before_raw = bm2.group(1).strip() if bm2 else ''
            before = re.sub(r"[\d'\"\u2018\u2019]+", '', before_raw).strip()
            label = after or before
            label = re.sub(r"[\s'\"\u2018\u2019\u201c\u201d]+", ' ', label).strip()
            label = clean(label)
            results.append(('transition', None, f'VCR {label}' if label else 'VCR'))
            continue

        # ── Chaser ───────────────────────────────────────────
        m = re.search(r'Chaser[~\uff5e]?(.*)', ls, re.IGNORECASE)
        if m:
            sub = clean(m.group(1).strip())
            results.append(('chaser', None, f'Chaser~{sub}' if sub else 'Chaser'))
            continue

    # 有 SONG 編號 → 輸出結構化清單
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

    # 兩欄格式
    non_empty = [l.strip() for l in lines if l.strip()]
    two_col = sum(1 for l in non_empty
                  if re.search(r'\t|\u3000|  {2,}', l)
                  and len(re.split(r'\t|\u3000|  +', l)[0]) <= 10)
    if two_col / max(len(non_empty), 1) > 0.5:
        titles = []; seen = set()
        for line in lines:
            ls2 = line.strip()
            if not ls2: continue
            if re.search(r'歌曲|內容|歌名|曲目|歌手', ls2): continue
            if re.match(r'^[(（].*[)）]$', ls2): continue
            parts = re.split(r'\t|\u3000|  +', ls2, maxsplit=1)
            if len(parts) == 2:
                title = clean(parts[1].strip())
                if title and title not in seen:
                    seen.add(title); titles.append(title)
        if titles:
            return "\n".join(f'S{i:02d} {t}' for i, t in enumerate(titles, 1))

    # 每行直接是歌名
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

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Arena Title Card Generator")
        self.geometry("1080x700")
        self.minsize(900,540)
        self.configure(bg=BG)
        self.items=[]
        self.sel_idx=None
        self.preview_photo=None
        self.bg_color="#111111"
        self.transparent=tk.BooleanVar(value=False)
        self.r_var=tk.IntVar(value=17)
        self.g_var=tk.IntVar(value=17)
        self.b_var=tk.IntVar(value=17)
        self._build()

    def _build(self):
        self.columnconfigure(1,weight=1)
        self.rowconfigure(0,weight=1)

        # LEFT SIDEBAR
        left=tk.Frame(self,bg=S1,width=290)
        left.grid(row=0,column=0,sticky="nsew")
        left.grid_propagate(False)
        left.columnconfigure(0,weight=1)
        left.rowconfigure(4,weight=1)

        logo=tk.Frame(left,bg=S1,pady=14)
        logo.grid(row=0,column=0,sticky="ew",padx=16)
        logo_row=tk.Frame(logo,bg=S1)
        logo_row.pack(anchor="w")
        tk.Label(logo_row,text="ARENA",bg=S1,fg=AC,font=("Helvetica",15,"bold")).pack(side="left")
        tk.Label(logo_row,text=" CARD GEN",bg=S1,fg=TX,font=("Helvetica",15,"bold")).pack(side="left")
        tk.Label(logo,text="\u6f14\u5531\u6703\u5b57\u5361\u751f\u6210\u7cfb\u7d71",bg=S1,fg=TX3,font=("Helvetica",9)).pack(anchor="w",pady=(2,6))
        tk.Button(logo,text="\u6b4c\u66f2\u6392\u5e8f\u8fa8\u8b58\u5668  \u2197",command=self._open_parser,
                  bg=S2,fg=AC,font=("Helvetica",9),relief="flat",bd=0,padx=10,pady=5,cursor="hand2",
                  activebackground=S3,activeforeground=AC).pack(anchor="w")

        tk.Frame(left,bg=BD,height=1).grid(row=1,column=0,sticky="ew")

        inp=tk.Frame(left,bg=S1,padx=14,pady=10)
        inp.grid(row=2,column=0,sticky="ew")

        tk.Label(inp,text="\u683c\u5f0f\uff08\u6bcf\u884c\u4e00\u500b\u9805\u76ee\uff09\uff1a\nS01 XXX\nTALKING-1\n\u8f49\u5834_XXX\nChaser~XXX",
                 bg=S2,fg=TX3,font=("Courier New",9),justify="left",padx=10,pady=8).pack(fill="x",pady=(0,8))

        self.txt=tk.Text(left,bg=S2,fg=TX,insertbackground=AC,
                         font=("Courier New",11),relief="flat",bd=0,height=10,
                         wrap="word",highlightthickness=1,highlightcolor=AC,
                         highlightbackground=BD,padx=8,pady=8)
        self.txt.grid(row=3,column=0,sticky="ew",padx=14)

        tk.Button(inp,text="\u751f\u6210\u5b57\u5361",command=self.generate,
                  bg=AC,fg="#000",font=("Helvetica",12,"bold"),
                  relief="flat",bd=0,pady=10,cursor="hand2",
                  activebackground=AC2).pack(fill="x",pady=(10,0))

        self.lbl_status=tk.Label(inp,text="",bg=S1,fg=TX3,font=("Helvetica",9),wraplength=260,justify="left")
        self.lbl_status.pack(anchor="w",pady=(5,0))

        tk.Frame(left,bg=BD,height=1).grid(row=3,column=0,sticky="sew",pady=(4,0))

        lf=tk.Frame(left,bg=S1)
        lf.grid(row=4,column=0,sticky="nsew")
        lf.rowconfigure(0,weight=1); lf.columnconfigure(0,weight=1)
        self.listbox=tk.Listbox(lf,bg=S1,fg=TX2,selectbackground=S3,selectforeground=AC,
                                 font=("Helvetica",10),relief="flat",bd=0,activestyle="none",highlightthickness=0)
        self.listbox.grid(row=0,column=0,sticky="nsew")
        sb=tk.Scrollbar(lf,orient="vertical",command=self.listbox.yview,bg=S2,troughcolor=S1,relief="flat",width=4)
        sb.grid(row=0,column=1,sticky="ns")
        self.listbox.configure(yscrollcommand=sb.set)
        self.listbox.bind("<<ListboxSelect>>",self.on_select)

        tk.Frame(left,bg=BD,height=1).grid(row=5,column=0,sticky="ew")

        bot=tk.Frame(left,bg=S1,padx=14,pady=10)
        bot.grid(row=6,column=0,sticky="ew")
        bot.columnconfigure(2,weight=1)

        self.lbl_swatch=tk.Label(bot,text="",bg="#111111",width=4,relief="flat")
        self.lbl_swatch.grid(row=0,column=0,rowspan=3,padx=(0,10),sticky="ns")

        def make_slider(row,label,var,col):
            tk.Label(bot,text=label,bg=S1,fg=col,font=("Helvetica",9,"bold"),width=2).grid(row=row,column=1,sticky="w")
            s=tk.Scale(bot,from_=0,to=255,orient="horizontal",variable=var,
                       bg=S1,fg=TX3,troughcolor=S2,highlightthickness=0,
                       showvalue=False,sliderlength=10,bd=0,width=6,
                       command=lambda v:self._update_color())
            s.grid(row=row,column=2,sticky="ew",padx=(4,0))
        make_slider(0,"R",self.r_var,"#ff6b6b")
        make_slider(1,"G",self.g_var,"#6bff8e")
        make_slider(2,"B",self.b_var,"#6b9fff")

        tk.Checkbutton(bot,text="\u900f\u660e\u80cc\u666f (PNG)",variable=self.transparent,
                       bg=S1,fg=TX2,selectcolor=S2,activebackground=S1,
                       font=("Helvetica",9),command=self._refresh_preview,
                       relief="flat",bd=0).grid(row=3,column=0,columnspan=3,sticky="w",pady=(8,4))

        self.btn_exp=tk.Button(bot,text="\u2b07   \u532f\u51fa\u6240\u6709\u5b57\u5361 PNG",command=self.export_cards,
                                bg=S2,fg=TX2,font=("Helvetica",9),relief="flat",bd=0,pady=8,
                                cursor="hand2",activebackground=S3,state="disabled")
        self.btn_exp.grid(row=4,column=0,columnspan=3,sticky="ew")

        # RIGHT PREVIEW
        right=tk.Frame(self,bg=BG)
        right.grid(row=0,column=1,sticky="nsew")
        right.rowconfigure(1,weight=1)
        right.columnconfigure(0,weight=1)

        tb=tk.Frame(right,bg=S1,height=46)
        tb.grid(row=0,column=0,sticky="ew")
        tb.grid_propagate(False)
        self.lbl_title=tk.Label(tb,text="\u9810\u89bd",bg=S1,fg=TX,font=("Helvetica",12,"bold"))
        self.lbl_title.pack(side="left",padx=20,pady=12)
        tk.Label(tb,text="\u8f38\u51fa 1920 \xd7 1080 px",bg=S1,fg=TX3,font=("Helvetica",8)).pack(side="right",padx=16)
        tk.Frame(right,bg=BD,height=1).grid(row=0,column=0,sticky="sew")

        self.canvas=tk.Canvas(right,bg=BG,highlightthickness=0,bd=0)
        self.canvas.grid(row=1,column=0,sticky="nsew")
        self.canvas.bind("<Configure>",lambda e:self._refresh_preview())

        self.editor=tk.Frame(right,bg=S1,pady=9)
        self.editor.grid(row=2,column=0,sticky="ew")
        self.editor.grid_remove()
        tk.Frame(right,bg=BD,height=1).grid(row=2,column=0,sticky="new")

        def ef(label,width):
            f=tk.Frame(self.editor,bg=S1); f.pack(side="left",padx=6)
            tk.Label(f,text=label,bg=S1,fg=TX3,font=("Helvetica",8)).pack(anchor="w")
            e=tk.Entry(f,bg=S2,fg=TX,insertbackground=AC,font=("Courier New",11),relief="flat",
                       bd=0,width=width,highlightthickness=1,highlightcolor=AC,highlightbackground=BD)
            e.pack(pady=(2,0))
            e.bind("<KeyRelease>",lambda ev:self._live_preview())
            return e

        self.ed_lines=ef("\u884c\u5167\u5bb9\uff08\u7528 | \u5206\u9694\u591a\u884c\uff09",28)

        tf=tk.Frame(self.editor,bg=S1); tf.pack(side="left",padx=6)
        tk.Label(tf,text="\u985e\u578b",bg=S1,fg=TX3,font=("Helvetica",8)).pack(anchor="w")
        self.type_var=tk.StringVar(value="song")
        ttk.Combobox(tf,textvariable=self.type_var,width=11,state="readonly",
                     values=["song","talking","transition","chaser"]).pack(pady=(2,0))

        tk.Button(self.editor,text="\u5132\u5b58",command=self._save_sel,
                  bg=S2,fg=TX2,font=("Helvetica",9),relief="flat",bd=0,padx=14,pady=6,
                  cursor="hand2",activebackground=S3).pack(side="left",padx=(10,0),pady=2)

        self._show_empty()

    def _update_color(self):
        r=self.r_var.get(); g=self.g_var.get(); b=self.b_var.get()
        self.bg_color=f"#{r:02x}{g:02x}{b:02x}"
        self.lbl_swatch.config(bg=self.bg_color)
        self._refresh_preview()

    def generate(self):
        raw=self.txt.get("1.0",tk.END).strip()
        if not raw: self.set_st("\u8acb\u5148\u8f38\u5165\u6b4c\u55ae\u6587\u5b57","err"); return
        self.items=parse_setlist(raw)
        if not self.items: self.set_st("\u7121\u6cd5\u89e3\u6790\uff0c\u8acb\u78ba\u8a8d\u683c\u5f0f","err"); return
        self.sel_idx=None
        self.editor.grid_remove()
        self._render_list()
        self._show_empty()
        self.btn_exp.config(state="normal")
        self.set_st(f"\u2713 \u5df2\u751f\u6210 {len(self.items)} \u5f35\u5b57\u5361","ok")

    def _render_list(self):
        self.listbox.delete(0,tk.END)
        icons={"song":"\u266a","talking":"\u2605","transition":"\u2192","chaser":"\u25ce"}
        for it in self.items:
            icon=icons.get(it["type"],"\xb7")
            self.listbox.insert(tk.END,f"  {icon}  {'\uff5c'.join(it['lines'])}")

    def on_select(self,_=None):
        sel=self.listbox.curselection()
        if not sel: return
        i=sel[0]
        if i>=len(self.items): return
        self.sel_idx=i
        it=self.items[i]
        self.ed_lines.delete(0,tk.END)
        self.ed_lines.insert(0,"|".join(it["lines"]))
        self.type_var.set(it.get("type","song"))
        self.editor.grid()
        self.lbl_title.config(text=it["lines"][-1])
        self._draw_preview(it["lines"])

    def _live_preview(self):
        if self.sel_idx is None: return
        lines=[l.strip() for l in self.ed_lines.get().split("|") if l.strip()]
        if lines: self._draw_preview(lines)

    def _save_sel(self):
        if self.sel_idx is None: return
        lines=[l.strip() for l in self.ed_lines.get().split("|") if l.strip()]
        if not lines: return
        self.items[self.sel_idx]["lines"]=lines
        self.items[self.sel_idx]["type"]=self.type_var.get()
        self._render_list()
        self.listbox.selection_set(self.sel_idx)
        self._draw_preview(lines)

    def _refresh_preview(self):
        if self.sel_idx is not None and self.sel_idx<len(self.items):
            self._draw_preview(self.items[self.sel_idx]["lines"])
        else:
            self._show_empty()

    def _draw_preview(self,lines):
        card=make_card(lines,bg_color=self.bg_color,transparent=False)
        w=max(self.canvas.winfo_width(),100)
        h=max(self.canvas.winfo_height(),100)
        if w/h>16/9: pw=int(h*16/9); ph=h
        else: pw=w; ph=int(w*9/16)
        pw=max(pw-20,10); ph=max(ph-20,10)
        from PIL import ImageTk
        card=card.resize((pw,ph),Image.LANCZOS)
        self.preview_photo=ImageTk.PhotoImage(card)
        self.canvas.delete("all")
        self.canvas.create_image(w//2,h//2,image=self.preview_photo,anchor="center")

    def _show_empty(self):
        self.canvas.delete("all")
        w=max(self.canvas.winfo_width(),400)
        h=max(self.canvas.winfo_height(),300)
        self.canvas.create_text(w//2,h//2,
            text="\u8f38\u5165\u6b4c\u55ae\u5f8c\u6309\u300c\u751f\u6210\u5b57\u5361\u300d\n\u9ede\u9078\u5de6\u5074\u66f2\u76ee\u9810\u89bd",
            fill="#2a2a2a",font=("Helvetica",13),justify="center")

    def _open_parser(self):
        def on_import(text):
            self.txt.delete("1.0",tk.END)
            self.txt.insert("1.0",text)
        ParserWindow(self,on_import=on_import)

    def export_cards(self):
        if not self.items: messagebox.showinfo("\u63d0\u793a","\u8acb\u5148\u751f\u6210\u5b57\u5361"); return
        folder=filedialog.askdirectory(title="\u9078\u64c7\u5132\u5b58\u8cc7\u6599\u593e")
        if not folder: return
        threading.Thread(target=self._do_export,args=(folder,),daemon=True).start()

    def _do_export(self,folder):
        total=len(self.items)
        tr=self.transparent.get()
        for i,it in enumerate(self.items):
            self.after(0,lambda n=i+1:self.set_st(f"\u532f\u51fa\u4e2d {n}/{total}...","loading"))
            card=make_card(it["lines"],bg_color=self.bg_color,transparent=tr)
            safe="".join(c for c in "_".join(it["lines"]) if c not in r'\/:*?"<>|')
            card.save(os.path.join(folder,f"{safe}.png"))
        self.after(0,lambda:self.set_st(f"\u2713 {total} \u5f35\u5b57\u5361\u5df2\u532f\u51fa\uff01","ok"))
        self.after(0,lambda:messagebox.showinfo("\u5b8c\u6210",f"{total} \u5f35\u5b57\u5361\u5df2\u5132\u5b58\u81f3\uff1a\n{folder}"))

    def set_st(self,msg,level=""):
        c={"ok":AC,"err":"#f87171","loading":"#60a5fa","":TX3}
        self.lbl_status.config(text=msg,fg=c.get(level,TX3))


class ParserWindow(tk.Toplevel):
    def __init__(self,master,on_import=None):
        super().__init__(master)
        self.title("\u6b4c\u66f2\u6392\u5e8f\u8fa8\u8b58\u5668")
        self.geometry("960x640")
        self.configure(bg=BG)
        self.on_import=on_import
        self._build()

    def _build(self):
        self.columnconfigure(0,weight=1)
        self.columnconfigure(1,weight=1)
        self.rowconfigure(1,weight=1)

        hdr=tk.Frame(self,bg=S1,pady=12)
        hdr.grid(row=0,column=0,columnspan=2,sticky="ew")
        tk.Label(hdr,text="\u6b4c\u66f2\u6392\u5e8f\u8fa8\u8b58\u5668",bg=S1,fg=AC,font=("Helvetica",14,"bold")).pack(side="left",padx=18)
        tk.Label(hdr,text="\u8cbc\u5165\u4efb\u610f\u683c\u5f0f\u6b4c\u55ae  \u2192  \u81ea\u52d5\u8fa8\u8b58  \u2192  \u532f\u5165\u5b57\u5361\u751f\u6210\u5668",
                 bg=S1,fg=TX3,font=("Helvetica",9)).pack(side="left")
        tk.Frame(self,bg=BD,height=1).grid(row=0,column=0,columnspan=2,sticky="sew")

        lf=tk.Frame(self,bg=S1)
        lf.grid(row=1,column=0,sticky="nsew",padx=(0,1))
        lf.rowconfigure(1,weight=1); lf.columnconfigure(0,weight=1)
        tk.Label(lf,text="\u8cbc\u5165\u539f\u59cb\u6b4c\u8a5e / \u7bc0\u76ee\u55ae\u6587\u5b57",
                 bg=S1,fg=TX2,font=("Helvetica",9)).grid(row=0,column=0,sticky="w",padx=14,pady=(10,4))
        self.txt_in=tk.Text(lf,bg=S2,fg=TX,insertbackground=AC,font=("Courier New",10),
                             relief="flat",bd=0,wrap="word",highlightthickness=1,
                             highlightcolor=BD,highlightbackground=BD,padx=10,pady=10)
        self.txt_in.grid(row=1,column=0,sticky="nsew",padx=10,pady=(0,10))

        rf=tk.Frame(self,bg=S1)
        rf.grid(row=1,column=1,sticky="nsew")
        rf.rowconfigure(1,weight=1); rf.columnconfigure(0,weight=1)
        tk.Label(rf,text="\u8fa8\u8b58\u7d50\u679c\uff08\u53ef\u76f4\u63a5\u8907\u88fd\u6216\u532f\u5165\uff09",
                 bg=S1,fg=TX2,font=("Helvetica",9)).grid(row=0,column=0,sticky="w",padx=14,pady=(10,4))
        self.txt_out=tk.Text(rf,bg="#0a1a0a",fg=AC,insertbackground=AC,font=("Courier New",11),
                              relief="flat",bd=0,wrap="word",highlightthickness=1,
                              highlightcolor=AC,highlightbackground=BD,padx=10,pady=10)
        self.txt_out.grid(row=1,column=0,sticky="nsew",padx=10,pady=(0,10))

        tk.Frame(self,bg=BD,height=1).grid(row=2,column=0,columnspan=2,sticky="ew")
        btn_row=tk.Frame(self,bg=BG,pady=10)
        btn_row.grid(row=3,column=0,columnspan=2,sticky="ew",padx=14)

        tk.Button(btn_row,text="\u81ea\u52d5\u8fa8\u8b58\u6b4c\u540d",command=self.do_parse,
                  bg=AC,fg="#000",font=("Helvetica",11,"bold"),
                  relief="flat",bd=0,padx=20,pady=8,cursor="hand2",
                  activebackground=AC2).pack(side="left",padx=(0,8))
        tk.Button(btn_row,text="\u532f\u5165\u5b57\u5361\u751f\u6210\u5668",command=self.do_import,
                  bg=S2,fg=TX,font=("Helvetica",10),relief="flat",bd=0,padx=20,pady=8,
                  cursor="hand2",activebackground=S3).pack(side="left",padx=(0,8))
        tk.Button(btn_row,text="\u6e05\u9664",command=self.do_clear,
                  bg=S2,fg=TX3,font=("Helvetica",9),relief="flat",bd=0,padx=14,pady=8,
                  cursor="hand2",activebackground=S3).pack(side="left")
        self.lang_var = tk.StringVar(value='繁')
        lang_f = tk.Frame(btn_row, bg=S2, padx=2)
        lang_f.pack(side='left', padx=(8,0))
        for _lbl, _val in [('繁體','繁'),('简体','簡')]:
            tk.Radiobutton(lang_f, text=_lbl, variable=self.lang_var, value=_val,
                          bg=S2, fg=TX2, selectcolor=S3, activebackground=S2,
                          font=('Helvetica',9), relief='flat', bd=0,
                          command=self.on_lang_change).pack(side='left', padx=3, pady=2)
        self.lbl_st=tk.Label(btn_row,text="",bg=BG,fg=TX3,font=("Helvetica",9))
        self.lbl_st.pack(side="left",padx=14)

    def do_parse(self):
        raw=self.txt_in.get("1.0",tk.END).strip()
        if not raw: self.lbl_st.config(text="\u8acb\u5148\u8cbc\u5165\u6587\u5b57",fg="#f87171"); return
        result=parse_song_list_from_text(raw)
        self.txt_out.delete("1.0",tk.END)
        self.txt_out.insert("1.0",result)
        count=len([l for l in result.splitlines() if l.strip()])
        self.lbl_st.config(text=f"\u2713  \u627e\u5230 {count} \u9996\u6b4c",fg=AC)

    def do_import(self):
        result=self.txt_out.get("1.0",tk.END).strip()
        if not result: self.lbl_st.config(text="\u8acb\u5148\u8fa8\u8b58",fg="#f87171"); return
        if self.on_import:
            self.on_import(result)
            self.lbl_st.config(text="\u2713  \u5df2\u532f\u5165\u5b57\u5361\u751f\u6210\u5668\uff01",fg=AC)

    def on_lang_change(self):
        result = self.txt_out.get("1.0", tk.END).strip()
        if not result: return
        if self.lang_var.get() == '簡':
            converted = to_simplified(result)
        else:
            converted = to_traditional(result)
        self.txt_out.delete("1.0", tk.END)
        self.txt_out.insert("1.0", converted)

    def do_clear(self):
        self.txt_in.delete("1.0",tk.END)
        self.txt_out.delete("1.0",tk.END)
        self.lbl_st.config(text="")


if __name__=="__main__":
    app=App()
    app.mainloop()
