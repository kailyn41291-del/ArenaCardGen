// Bundled entry — esbuild bundles this into web/dist/bundle.js
// 取代之前 index.html 內 <script type=text/babel> 的 inline JSX(避免 CDN supply chain 風險)
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import { LocaleContext, getInitialLocale, persistLocale, useT, LangPicker } from './i18n.jsx';

// pdf.js worker — copy 到 web/dist/ 由 build:worker 處理(路徑相對 index.html 的位置)
pdfjsLib.GlobalWorkerOptions.workerSrc = './dist/pdf.worker.min.mjs';

// 暴露 JSZip / pdfjsLib 到 window,給 inline JSX 內既有的 window.JSZip / window.pdfjsLib reference 用
window.JSZip = JSZip;
window.pdfjsLib = pdfjsLib;

    // (React hooks 已 import,原本 destructure 移除)

    // 中英寬度比常數 — Inter Black weight 大寫字母實測 advance ≈ 0.65em
    // (0.55 會低估導致字級算太大、字撞框)。chooseBestLayout / Card / Canvas 三處共用。
    const CHAR_WIDTH_LATIN = 0.65;

    // ────────────────────────────────────────────────────────────────
    // Auto-update Tier 1 — 啟動時 fetch GitHub Releases API,有新版顯示 toast
    // ────────────────────────────────────────────────────────────────
    const APP_VERSION_FALLBACK = '0.3.0-beta1';  // 沒 electronAPI 時的 fallback,跟 package.json 對齊
    const RELEASES_API = 'https://api.github.com/repos/kailyn41291-del/ArenaCardGen/releases/latest';
    const DISMISSED_VERSION_KEY = 'arena-cardgen-dismissed-update-version';
    // Toast / footer 顯示用:tag 已含 v 前綴(例如 v0.3.0)就不要再加,避免 vv0.3.0
    const formatVersion = (v) => 'v' + String(v || '').replace(/^v/, '');

    // semver 比較:'1.2.3-beta1' < '1.2.3'(pre-release tag 比 release 小)
    // pre tag 也按 . split 並嘗試 numeric 比(beta10 > beta2,而非字串比的 beta10 < beta2)
    function compareVersion(a, b) {
      const norm = (v) => String(v || '').replace(/^v/, '').trim();
      const splitId = (s) => {
        // 把 "beta10" 拆 "beta" + 10、把 "beta" 留原樣
        const m = s.match(/^([a-zA-Z]*)(\d*)$/);
        if (m && m[2]) return [m[1] || '', parseInt(m[2], 10)];
        return [s];
      };
      const splitVer = (v) => {
        const [main, pre] = norm(v).split('-');
        const mainParts = main.split('.').map(n => parseInt(n, 10) || 0);
        const preParts = pre ? pre.split('.').flatMap(splitId) : [];
        return { main: mainParts, pre: preParts };
      };
      const cmp = (x, y) => {
        const xn = typeof x === 'number';
        const yn = typeof y === 'number';
        if (xn && yn) return x - y;
        if (xn !== yn) return xn ? -1 : 1; // numeric < string in semver pre
        return x < y ? -1 : x > y ? 1 : 0;
      };
      const aa = splitVer(a);
      const bb = splitVer(b);
      const mainLen = Math.max(aa.main.length, bb.main.length);
      for (let i = 0; i < mainLen; i++) {
        const x = aa.main[i] || 0;
        const y = bb.main[i] || 0;
        if (x !== y) return x - y;
      }
      // main 相等:無 pre > 有 pre(release 比 beta 新)
      if (!aa.pre.length && bb.pre.length) return 1;
      if (aa.pre.length && !bb.pre.length) return -1;
      const preLen = Math.max(aa.pre.length, bb.pre.length);
      for (let i = 0; i < preLen; i++) {
        if (i >= aa.pre.length) return -1;
        if (i >= bb.pre.length) return 1;
        const c = cmp(aa.pre[i], bb.pre[i]);
        if (c !== 0) return c;
      }
      return 0;
    }

    // 卡片可用區域比例(扣 padding 後)。Card 元件用 cqw 單位、Canvas 用 px,
    // 但比例必須一致,否則預覽跟匯出 PNG 字級會 drift。
    // 卡片寬高比 16:9 → height/width = 56.25/100 = 0.5625
    const AVAIL_W_RATIO = 0.88;   // 水平 padding 各 6%
    const AVAIL_H_RATIO = 47 / 56.25;  // ≈ 0.8356,對應 Card 既有 47cqw / 卡片高 56.25cqw

    // 字級 layout 計算 — Card / Canvas 共用,確保預覽跟匯出 PNG 一致
    // 輸入 availW / availH 用任意單位(cqw 或 px),輸出字級用同單位
    function computeStackLayout({ titleLines, labelText, hasLabel, availW, availH }) {
      const lineVisualWidth = (l) => {
        let w = 0;
        for (const ch of (l || '')) w += /[一-鿿]/.test(ch) ? 1 : CHAR_WIDTH_LATIN;
        return Math.max(w, 1);
      };

      const labelMultiplier = hasLabel ? 1.5 : 0;
      const titleRows = Math.max(titleLines.length, 0);
      const totalRowFactor = labelMultiplier + titleRows + Math.max(titleRows - 1, 0) * 0.1;

      const lineWidths = titleLines.map(lineVisualWidth);
      const maxLineWidth = Math.max(...lineWidths, 1);
      const labelWidthVisual = lineVisualWidth(labelText) || 1;

      const heightConstrainedBase = totalRowFactor > 0 ? availH / totalRowFactor : availH;
      const widthConstrainedBase = titleRows > 0 ? availW / maxLineWidth : Infinity;
      const labelWidthBase = hasLabel ? (availW / labelWidthVisual) / 1.5 : Infinity;

      let baseSize = Math.max(8, Math.min(heightConstrainedBase, widthConstrainedBase, labelWidthBase));

      // 每行獨立放大(短行不被長行拖累),封頂 baseSize × 1.4
      const perLineSize = lineWidths.map(lw => Math.min(availW / lw, baseSize * 1.4));

      // 安全閥:逐行放大後若總高度超出可用高度,等比縮回
      // N-1:label-only 卡(perLineSize 空)也要 shrink labelFontSize,否則撞上下緣
      const labelStackHeight = hasLabel ? baseSize * 1.5 * 1.06 : 0;
      const titleStackHeight = perLineSize.reduce((s, sz) => s + sz * 1.05, 0);
      const stackHeight = labelStackHeight + titleStackHeight;
      if (stackHeight > availH) {
        const shrink = availH / stackHeight;
        for (let i = 0; i < perLineSize.length; i++) perLineSize[i] *= shrink;
        if (hasLabel) baseSize *= shrink; // label 字級跟著縮(labelFontSize = baseSize * 1.5)
      }

      return {
        baseSize,
        labelFontSize: baseSize * 1.5,
        perLineSize,
        lineWidths,
        maxLineWidth,
      };
    }

    // ────────────────────────────────────────────────────────────────
    // 清理 title:剝括號、重複 SONG 編號、舞台關鍵字、裝飾符號
    // ────────────────────────────────────────────────────────────────
    function cleanTitle(t) {
      if (!t) return '';
      // 括號(全形/半形)
      t = t.replace(/[((][^))]*[))]/g, '').trim();
      // HTML
      t = t.replace(/<[^>]+>/g, '').trim();
      // 時間標記
      t = t.replace(/\s+\d+['‘’]\d+["\/].*$/, '').trim();
      t = t.replace(/\s+\d+'\d+".*$/, '').trim();
      // 重複的 SONG 編號 prefix(常見:S17 SONG 17:歌名 → 剝成「歌名」)
      t = t.replace(/^(?:SONG\s+\d+|S\d+)\s*[:：.]\s*/i, '').trim();
      t = t.replace(/^(?:SONG|ONG)\s+\d+\s*[:：.]\s*/i, '').trim();
      // 舞台說明黑名單(分隔符後接關鍵字 → 從那裡截斷)
      const stageKw = /[\s　、,,–—–+\-]+(?:舞者|服裝|服装|[\w]*道具|小舞台|大舞台|升降|左台|右台|合音|合唱|Bass|GT|gt|CO\d|鋼琴|鍵盤|钢琴|键盘|花朵|彩虹|彩條|氣球|風扇|风扇|噴桶|搖滾|摇滚|現身|退場|上場|下場|特製|特制|男舞|女舞|\*\d|樂手|配乐|竖琴|Disco|Intro|打造|人生|kb老師|kb老师|清唱)/i;
      const m = t.match(stageKw);
      if (m && m.index !== undefined) t = t.slice(0, m.index).trim();
      // 壓縮空格
      t = t.replace(/\s+/g, ' ');
      // 裝飾符號
      t = t.replace(/^[■★▶▷◆◇→←·。,、\/／　'"–—– \-]+|[■★▶▷◆◇→←·。,、\/／　'"–—– \-]+$/g, '');
      return t;
    }

    // ────────────────────────────────────────────────────────────────
    // Mock parser - simplified version of parse_setlist
    // Real Python parser will replace this when we wire up sidecar
    // ────────────────────────────────────────────────────────────────
    // 偵測明顯的雜訊行(YouTube 留言區、論壇 UI 等)
    function isNoiseLine(t) {
      if (!t) return true;

      // 純數字 / 數字+短後綴(讚數、留言數)
      if (/^\d+$/.test(t)) return true;
      if (/^\d+(\.\d+)?\s*[KMkm]?$/.test(t)) return true;

      // 時間標記:N 天前 / 週前 / 月前 / 小時前 / 年前 等
      if (/^\d+\s*(天|週|周|月|小時|分鐘|分|秒|年|hour|day|week|month|year)s?\s*(前|ago)?\s*$/i.test(t)) return true;

      // @mention 單獨一行(YouTube / Twitter 帳號)
      if (/^@[\w一-鿿]+$/.test(t)) return true;

      // UI 元素文字
      const uiLabels = new Set([
        '回覆', '分享', '儲存', '收藏', '超級感謝', '加入', '訂閱', '已訂閱',
        '取消訂閱', '更多', '隱藏', '顯示', '顯示更多', '展開', '摺疊',
        '發表留言', '發表留言...', '查看更多', '查看回覆', '輸入留言…',
        'reply', 'share', 'save', 'subscribe', 'subscribed', 'more', 'show more',
        '原始', 'original', '相關影片', '推薦', '推荐',
      ]);
      if (uiLabels.has(t.toLowerCase()) || uiLabels.has(t)) return true;

      // N 則 留言 / 回覆
      if (/^\d+\s*則\s*(留言|回覆)\s*$/.test(t)) return true;

      // 觀看次數 / 訂閱者 數
      if (/^觀看次數/.test(t)) return true;
      if (/^\d+(\.\d+)?\s*[萬千]?\s*位\s*(訂閱者|追蹤者|關注者|粉絲|觀眾)/.test(t)) return true;
      if (/^\d+(\.\d+)?\s*[KMkm]\s*(views?|subscribers?|followers?)/i.test(t)) return true;

      return false;
    }

    function parseSetlist(text) {
      if (!text.trim()) return [];
      return text.split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .filter(l => !/^-+$/.test(l))
        .filter(l => !isNoiseLine(l))
        .map((line) => {
          // INTRO/ENCORE/OUTRO sections
          let m = line.match(/^(INTRO|ENCORE|OUTRO)\s*[-–]\s*['"]?(.+?)['"]?$/i);
          if (m) return { type: 'section', label: m[1].toUpperCase(), title: m[2].trim() };

          // TALKING-N or Talking N(/i flag 涵蓋大小寫)
          m = line.match(/^TALKING[\s-]*(\d+)/i);
          if (m) return { type: 'talking', label: '', title: `TALKING-${m[1]}` };

          // 轉場 / 转场
          m = line.match(/^[轉转][場场][_\s]*(.*)$/);
          if (m) {
            const rest = cleanTitle(m[1].trim());
            return { type: 'transition', label: '轉場', title: rest || '' };
          }

          // Chaser
          m = line.match(/^Chaser[~~]?\s*(.*)$/i);
          if (m) {
            const sub = cleanTitle(m[1].trim());
            return { type: 'chaser', label: 'Chaser~', title: sub };
          }

          // S## title
          m = line.match(/^S(\d+)[\s.:_]+(.+)$/i);
          if (m) {
            const n = parseInt(m[1], 10);
            return { type: 'song', label: `S${String(n).padStart(2, '0')}`, title: cleanTitle(m[2].trim()) };
          }

          // Numeric prefix "01. Title"
          m = line.match(/^(\d+)[\s.:_]+(.+)$/);
          if (m) {
            const n = parseInt(m[1], 10);
            return { type: 'song', label: `${String(n).padStart(2, '0')}.`, title: cleanTitle(m[2].trim()) };
          }

          // Default(整行當 title,也清理一下)
          return { type: 'song', label: '', title: cleanTitle(line) || line };
        });
    }

    // 動態 layout:嘗試多種切法,選字級最大的那個。
    // 9+ 字 → 截斷到 8 字(不加 …)。
    function chooseBestLayout(title, hasLabel) {
      if (!title) return [];
      let clean = title.replace(/[((][^))]*[))]/g, '').trim();
      if (!clean) return [];

      const isCJK = /[一-鿿]/.test(clean);

      // 截斷(無 …)
      if (isCJK && clean.length > 8) clean = clean.slice(0, 8);
      else if (!isCJK && clean.length > 18) clean = clean.slice(0, 18).trim();

      // 候選切法
      const candidates = [[clean]];

      if (isCJK) {
        const n = clean.length;
        if (n >= 4) {
          const mid = Math.ceil(n / 2);
          candidates.push([clean.slice(0, mid), clean.slice(mid)]);
        }
        if (n >= 7) {
          const t = Math.ceil(n / 3);
          candidates.push([clean.slice(0, t), clean.slice(t, t * 2), clean.slice(t * 2)]);
        }
      } else {
        const words = clean.split(/\s+/);
        if (words.length >= 2) {
          const mid = Math.ceil(words.length / 2);
          candidates.push([words.slice(0, mid).join(' '), words.slice(mid).join(' ')]);
        }
        if (words.length >= 3) {
          const t = Math.ceil(words.length / 3);
          candidates.push([
            words.slice(0, t).join(' '),
            words.slice(t, t * 2).join(' '),
            words.slice(t * 2).join(' '),
          ]);
        }
      }

      // 評分:估算字級 = min(width-limit, height-limit),挑最大者
      const charW = isCJK ? 1 : CHAR_WIDTH_LATIN;
      const labelRows = hasLabel ? 1.5 : 0;
      function fontEstimate(ls) {
        const maxLen = Math.max(...ls.map(l => l.length), 1);
        const widthLimit = 88 / (maxLen * charW);
        const totalRows = labelRows + ls.length + (ls.length - 1) * 0.1;
        const heightLimit = 47 / totalRows;
        return Math.min(widthLimit, heightLimit);
      }

      let best = candidates[0];
      let bestScore = fontEstimate(best);
      for (let i = 1; i < candidates.length; i++) {
        const s = fontEstimate(candidates[i]);
        if (s > bestScore) { bestScore = s; best = candidates[i]; }
      }
      return best;
    }

    // ────────────────────────────────────────────────────────────────
    // Messy RD parser - full port of parse_song_list_from_text from main.py
    // Phase B 會被 Python sidecar HTTP call 取代
    // ────────────────────────────────────────────────────────────────
    function parseRdMessy(text) {
      const lines = text.split('\n');
      const results = [];
      const seenTitles = new Set();

      function clean(t) {
        t = t.replace(/[((][^))]*[))]/g, '').trim();
        t = t.replace(/<[^>]+>/g, '').trim();
        t = t.replace(/\s+\d+['‘’]\d+["\/].*$/, '').trim();
        t = t.replace(/\s+\d+'\d+".*$/, '').trim();

        const stageKw = /[\s　、,,–—–]+(?:舞者|服裝|服装|[\w]*道具|小舞台|大舞台|升降|左台|右台|合音|合唱|Bass|GT|gt|CO\d|鋼琴|鍵盤|钢琴|键盘|花朵|彩虹|彩條|氣球|風扇|风扇|噴桶|搖滾|摇滚|現身|退場|上場|下場|特製|特制|男舞|女舞|\*\d|樂手|配乐|竖琴|Disco|Intro|打造|人生)/i;
        const m = t.match(stageKw);
        if (m && m.index !== undefined) {
          t = t.slice(0, m.index).trim();
        }
        t = t.replace(/\s+/g, ' ');
        return t.replace(/^[■★▶▷◆◇→←·。,、\/／　'"–—– ]+|[■★▶▷◆◇→←·。,、\/／　'"–—– ]+$/g, '');
      }

      for (const line of lines) {
        const ls = line.trim();
        if (!ls) continue;

        // SONG / S## 編號
        let m = ls.match(/SONG\s*(\d+)\s*[:：]\s*(.+)/i);
        if (!m) m = ls.match(/\bS(\d+)\s*[:：.]\s*(.+)/i);
        if (m) {
          const num = parseInt(m[1], 10);
          const title = clean(m[2]);
          if (title && !seenTitles.has(title)) {
            seenTitles.add(title);
            results.push({ kind: 'song', num, title });
          }
          continue;
        }

        // Talking
        m = ls.match(/Talking\s*(\d+)/i);
        if (m) { results.push({ kind: 'talking', title: `TALKING-${m[1]}` }); continue; }
        if (/^TALKING\s*[-\s]*\d+/i.test(ls)) {
          const m2 = ls.match(/(\d+)/);
          const num = m2 ? m2[1] : '';
          results.push({ kind: 'talking', title: num ? `TALKING-${num}` : 'TALKING' });
          continue;
        }

        // 轉場 / 转场
        if (/^[轉转][場场]/.test(ls)) {
          let rest = ls.replace(/^[轉转][場场]\s*/, '').trim();
          let name;
          if (/^VCR/i.test(rest)) {
            const m2 = rest.match(/VCR\s*[-–]?\s*(\d+)?/i);
            const num = m2 && m2[1] ? m2[1].trim() : '';
            name = num ? `轉場_VCR ${num}` : '轉場_VCR';
          } else {
            rest = rest.replace(/^[_\-\s]+/, '').trim();
            const numM = rest.match(/^(\d+)/);
            if (numM) {
              name = `轉場_${numM[1]}`;
            } else if (rest) {
              rest = rest.split(/\s*[-–—]\s*/)[0].trim();
              name = rest ? `轉場_${rest}` : '轉場';
            } else { name = '轉場'; }
          }
          results.push({ kind: 'transition', title: name });
          continue;
        }

        // 行內 VCR
        if (/\bVCR\b/i.test(ls)) {
          const m2 = ls.match(/VCR[-\s]*(\w[\w\s]*)?/i);
          const after = m2 && m2[1] ? m2[1].trim() : '';
          let before = '';
          const bm = ls.match(/^(.+?)\s+VCR/i);
          if (bm) before = bm[1].replace(/[\d'"‘’]+/g, '').trim();
          const label = clean(after || before);
          results.push({ kind: 'transition', title: label ? `VCR ${label}` : 'VCR' });
          continue;
        }

        // Chaser
        m = ls.match(/Chaser[~~]?(.*)/i);
        if (m) {
          const sub = clean(m[1].trim());
          results.push({ kind: 'chaser', title: sub ? `Chaser~${sub}` : 'Chaser' });
          continue;
        }
      }

      // 有 SONG 編號 → 結構化輸出
      if (results.some(r => r.kind === 'song')) {
        return results.map(r => {
          if (r.kind === 'song') return `S${String(r.num).padStart(2, '0')} ${r.title}`;
          if (r.kind === 'talking') return r.title;
          if (r.kind === 'transition') {
            return /^[轉转][場场]/.test(r.title) ? r.title : `轉場_${r.title}`;
          }
          if (r.kind === 'chaser') return r.title;
          return '';
        }).filter(Boolean).join('\n');
      }

      // 兩欄 fallback
      const nonEmpty = lines.map(l => l.trim()).filter(Boolean);
      const twoColCount = nonEmpty.filter(l =>
        /\t|　|  +/.test(l) && l.split(/\t|　|  +/)[0].length <= 10
      ).length;
      if (twoColCount / Math.max(nonEmpty.length, 1) > 0.5) {
        const titles = []; const seen = new Set();
        for (const line of lines) {
          const ls2 = line.trim();
          if (!ls2) continue;
          if (/歌曲|內容|歌名|曲目|歌手/.test(ls2)) continue;
          if (/^[((].*[))]$/.test(ls2)) continue;
          const parts = ls2.split(/\t|　|  +/);
          if (parts.length >= 2) {
            const t = clean(parts.slice(1).join(' ').trim());
            if (t && !seen.has(t)) { seen.add(t); titles.push(t); }
          }
        }
        if (titles.length) {
          return titles.map((t, i) => `S${String(i + 1).padStart(2, '0')} ${t}`).join('\n');
        }
      }

      // 每行就是歌名
      const titles = []; const seen = new Set();
      for (const line of lines) {
        const ls2 = line.trim();
        if (!ls2) continue;
        if (/^[((].*[))]$/.test(ls2)) continue;
        const t = clean(ls2);
        if (t && !seen.has(t) && t.length >= 1 && t.length <= 60) {
          seen.add(t); titles.push(t);
        }
      }
      return titles.map((t, i) => `S${String(i + 1).padStart(2, '0')} ${t}`).join('\n');
    }

    // 內容對齊的 base key(只用於 alignCardIds 比對,不再當 override 的 storage key)
    function cardKeyBase(card) {
      return `${card.type ?? 'x'}::${card.label ?? ''}::${card.title ?? ''}`;
    }

    // ────────────────────────────────────────────────────────────────
    // Stable card IDs(UUID,跟 cards array 平行存,徹底解 reorder 顏色問題)
    // ────────────────────────────────────────────────────────────────
    // 為什麼用 parallel array 而不是 UUID-in-text:
    // - text 是 user 直接編輯的 textarea,塞 UUID(零寬字元編碼)會讓 user
    //   複製到別的地方時帶到隱藏字元,有副作用
    // - parallel array 配合 alignCardIds(內容對齊)足以處理 textarea 直接編輯
    //   的情境,而 reorder / delete / duplicate 透過顯式維護 cardIds 100% 對齊
    function generateCardId() {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
      return 'id-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
    }

    // 對齊舊 cardIds 到新 cards:對每張新卡,找舊卡第一個內容相同未被 claim 的 → 繼承 ID
    // 沒對應的(新增 / 內容變更 / 刪掉)→ 給新 UUID
    // 注意:此 fn 用於 textarea 直接編輯(內容 mutation)。reorder / delete / duplicate
    // 應顯式提供新 cardIds 順序,不走這條(否則重複內容會錯位)。
    function alignCardIds(prevCards, prevIds, newCards) {
      const claimed = new Set();
      return newCards.map(nc => {
        const baseKey = cardKeyBase(nc);
        for (let i = 0; i < prevCards.length; i++) {
          if (claimed.has(i)) continue;
          if (cardKeyBase(prevCards[i]) === baseKey) {
            claimed.add(i);
            return prevIds[i] || generateCardId();
          }
        }
        return generateCardId();
      });
    }

    // localStorage persistence — F5 不會掉資料
    const STORAGE_KEY = 'arena-cardgen-state-v1';
    function loadPersistedState() {
      try {
        const s = localStorage.getItem(STORAGE_KEY);
        if (!s) return null;
        return JSON.parse(s);
      } catch { return null; }
    }
    function savePersistedState(state) {
      try {
        // 防呆:即使 settings 意外混入 geminiApiKey,也不寫進 localStorage(B3 安全)
        const safe = { ...state };
        if (safe.settings && 'geminiApiKey' in safe.settings) {
          const { geminiApiKey: _drop, ...rest } = safe.settings;
          safe.settings = rest;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
        return true;
      } catch { return false; }
    }

    const TYPE_COLORS = {
      song:       'text-white',
      talking:    'text-yellow-300',
      transition: 'text-[#33ff85]',
      chaser:     'text-red-400',
      section:    'text-white',
    };

    // Hex 對應(用於 Canvas 渲染,跟 TYPE_COLORS 同步)
    // 跟 TYPE_COLORS 保持同步(UI 預覽 vs Canvas 匯出 一致)
    const TYPE_HEX = {
      song:       '#FFFFFF',
      talking:    '#FFFF00',
      transition: '#33FF85',
      chaser:     '#FF0000',
      section:    '#FFFFFF',
    };

    // ────────────────────────────────────────────────────────────────
    // 真 1920×1080 PNG 渲染(用 Canvas)
    // ────────────────────────────────────────────────────────────────
    function renderCardToCanvas(card, settings, w = 1920, h = 1080) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      // 背景畫的條件:
      //   - transparent OFF:一律畫(card.bgOverride > settings.bgColor > 黑)
      //   - transparent ON + 有 card.bgOverride:畫 override 色
      //     (user 明確意圖:「我這張要特別設色,其他保持透明」場景)
      //   - transparent ON + 沒 override:不畫(維持透明)
      if (!settings.transparent || card.bgOverride) {
        ctx.fillStyle = card.bgOverride || settings.bgColor || '#000000';
        ctx.fillRect(0, 0, w, h);
      }

      const originalLabel = (card.label || '').trim();
      const hasOriginalLabel = originalLabel.length > 0;

      // 同 Card 元件邏輯:manualLines 第一行 = label(若原本有)
      let labelText, titleLines;
      if (card.manualLines && card.manualLines.trim()) {
        const all = card.manualLines.split('\n').map(l => l.trim()).filter(Boolean);
        if (hasOriginalLabel) {
          labelText = all[0] || originalLabel;
          titleLines = all.slice(1);
        } else {
          labelText = '';
          titleLines = all;
        }
      } else {
        labelText = originalLabel;
        titleLines = chooseBestLayout(card.title, hasOriginalLabel);
      }
      const showLabel = labelText.length > 0;
      if (titleLines.length === 0 && !showLabel) return canvas;

      const color = card.colorOverride
        || (settings.useTypeColors ? (TYPE_HEX[card.type] || '#FFFFFF') : (settings.textColor || '#FFFFFF'));

      // padding 比例跟 Card 元件對齊(AVAIL_W_RATIO / AVAIL_H_RATIO),確保預覽跟匯出 PNG 一致
      const availW = w * AVAIL_W_RATIO;
      const availH = h * AVAIL_H_RATIO;

      const layout = computeStackLayout({
        titleLines, labelText, hasLabel: showLabel, availW, availH,
      });
      let labelFontSize = layout.labelFontSize;
      const perLineSize = [...layout.perLineSize];

      const fontFamily = '900 {SIZE}px Inter, "Noto Sans TC", "Noto Sans SC", "Microsoft JhengHei", "Microsoft YaHei", "PingFang TC", "PingFang SC", "Heiti TC", "Heiti SC", sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // S-4:用 measureText 真實量測校正字級。CHAR_WIDTH_LATIN 常數對 W/M 等寬字母仍可能低估,
      // 加上 manualLines 是 user 自由輸入(不受 chooseBestLayout 限制),沒這層校正會字超出 1920 寬從中央外溢
      if (showLabel) {
        ctx.font = fontFamily.replace('{SIZE}', labelFontSize.toFixed(0));
        const measured = ctx.measureText(labelText.toUpperCase()).width;
        if (measured > availW) labelFontSize *= availW / measured;
      }
      for (let i = 0; i < titleLines.length; i++) {
        ctx.font = fontFamily.replace('{SIZE}', perLineSize[i].toFixed(0));
        const measured = ctx.measureText(titleLines[i].toUpperCase()).width;
        if (measured > availW) perLineSize[i] *= availW / measured;
      }

      const labelHeight = showLabel ? labelFontSize : 0;
      const labelGap = showLabel ? labelFontSize * 0.06 : 0;
      const titleHeights = perLineSize.map(s => s * 1.05);
      const titleTotal = titleHeights.reduce((s, h2) => s + h2, 0);
      const totalHeight = labelHeight + labelGap + titleTotal;

      let y = (h - totalHeight) / 2;

      if (showLabel) {
        ctx.font = fontFamily.replace('{SIZE}', labelFontSize.toFixed(0));
        ctx.fillText(labelText.toUpperCase(), w / 2, y);
        y += labelHeight + labelGap;
      }

      for (let i = 0; i < titleLines.length; i++) {
        ctx.font = fontFamily.replace('{SIZE}', perLineSize[i].toFixed(0));
        ctx.fillText(titleLines[i].toUpperCase(), w / 2, y);
        y += titleHeights[i];
      }

      return canvas;
    }

    // 安全檔名(白名單:中文 + 英數 + _ - ~ 空格)
    // 額外:過 control chars (U+0000-001F)、剝末尾的點/空格 (Windows 不允許)
    function safeFilename(s) {
      return (s || '')
        .replace(/[\x00-\x1F]/g, '')
        .replace(/[^\w一-鿿~\- ]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[.\s]+$/, '');
    }

    function buildFilename(card, idx) {
      const num = String(idx + 1).padStart(2, '0');
      const label = safeFilename(card.label || '');
      const title = safeFilename(card.title || '');
      const parts = [num];
      if (label) parts.push(label);
      if (title) parts.push(title);
      return parts.join('_') + '.png';
    }

    // 文字跟背景色幾乎同色 → 字卡視覺上看不見(B4 防呆 helper)
    // 用簡單 hex 比對 + WCAG-lite luminance diff,catches 純白底白字 / 同色 hex 等明顯衝突
    function effectiveColors(card, settings) {
      const text = card.colorOverride
        || (settings.useTypeColors ? (TYPE_HEX[card.type] || '#FFFFFF') : (settings.textColor || '#FFFFFF'));
      // bg 邏輯跟 Canvas / Card 一致:
      //   - transparent ON + 沒 override → 沒實底(不檢查 contrast,投到動態背景上)
      //   - transparent ON + 有 override → 仍會畫 override 色,要檢查
      //   - transparent OFF → 用 override 或全域色
      const bg = settings.transparent
        ? (card.bgOverride || null)
        : (card.bgOverride || settings.bgColor || '#000000');
      return { text, bg };
    }
    function isCardInvisible(card, settings) {
      const { text, bg } = effectiveColors(card, settings);
      if (!bg) return false; // 透明背景,不檢查
      // hex 完全相等 → 一定看不見
      if (String(text).toLowerCase() === String(bg).toLowerCase()) return true;
      // luminance 差太小(WCAG 對比 < 1.5)也視為看不見
      const lum = (hex) => {
        const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
        if (!m) return 0.5;
        const n = parseInt(m[1], 16);
        const r = ((n >> 16) & 255) / 255;
        const g = ((n >> 8) & 255) / 255;
        const b = (n & 255) / 255;
        return 0.299 * r + 0.587 * g + 0.114 * b;
      };
      return Math.abs(lum(text) - lum(bg)) < 0.15;
    }

    // 匯出全部到 ZIP
    // originalIndices:若是「只匯出選中」場景,傳原始 setlist 中的位置 array (B1:檔名才不會被打亂)
    async function exportAllToZip(cards, settings, onProgress, originalIndices) {
      const zip = new JSZip();
      const fileEntries = [];

      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        const realIdx = originalIndices ? originalIndices[i] : i;
        const fname = buildFilename(c, realIdx);
        try {
          const canvas = renderCardToCanvas(c, settings);
          const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob 回傳 null')), 'image/png');
          });
          zip.file(fname, blob);
          fileEntries.push({ idx: realIdx + 1, total: cards.length, name: fname });
        } catch (err) {
          // 渲染失敗(canvas tainted、記憶體不足、字型問題)— 不要整批匯出中斷,
          // 標記這張卡有錯,匯出完整體一併報告
          fileEntries.push({ idx: realIdx + 1, total: cards.length, name: fname, error: err.message || String(err) });
        }
        if (onProgress) onProgress(i + 1, cards.length, fname);
        // 讓 UI 有機會更新
        await new Promise(r => setTimeout(r, 0));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arena-cards-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return fileEntries;
    }

    // ────────────────────────────────────────────────────────────────
    // Gemini 2.0 Flash 智慧解析 — 處理規則 parser 解不掉的雜亂 RD
    // 免費 tier:1500 次/天(用戶自填 API key)
    // 取得 key:https://aistudio.google.com/apikey
    // ────────────────────────────────────────────────────────────────
    const GEMINI_SYSTEM_PROMPT = `你是演唱會字卡格式整理助理。從下面的 RD(rundown / 流程表)文字中,提取乾淨的演出順序。

輸出規則(嚴格遵守,不要加任何說明文字):
- 每行一個項目,純文字
- 歌曲格式:S## 歌名(S 後面 2 位數編號,空白後接歌名)
- 歌名只取主標題:剝掉英文翻譯(/Imperative)、cover 註解(cover 阿明)、嘉賓備註(feat. 嘉賓)、舞台說明、樂器、燈光、時間標記
- 主持講話:TALKING-N(序數轉阿拉伯數字。例:1st TALKING → TALKING-1、2nd TALKING → TALKING-2)
- 轉場 / Interlude:轉場_主題(例:Interlude 1. 分離 → 轉場_分離、Interlude 2. 合一與重聚 → 轉場_合一與重聚)
- VCR:轉場_VCR 或 VCR 主題
- 安可:Chaser 或 Chaser~人名
- 中文輸出繁體
- 歌曲編號保留原數字(原本是 S05 就輸出 S05,不要重排)
- 如果輸入完全不是演出順序(YouTube 留言、新聞、廣告等),只輸出單行:(無法辨識為演出順序)

範例輸入:
2.  S01:勢在必行/Imperative *前奏Penny出現在指環Q-0... 1st TALKING ... S11:Medley 1 ... 2nd TALKING ... Interlude 1. 分離 ... S14:密室逃脫/Escape ... S27:雙生火焰/Twin Flame +CHASER

預期輸出:
S01 勢在必行
TALKING-1
S11 Medley 1
TALKING-2
轉場_分離
S14 密室逃脫
S27 雙生火焰
Chaser

只輸出結果。不要 markdown 代碼塊、不要前言、不要解釋。`;

    // 模型 fallback chain — 第一個 limit: 0 / 429 → 嘗試下一個
    // gemini-2.5-flash 最新最快,1.5-flash 全球免費 tier 普及度最高
    const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

    async function callGeminiOne(model, apiKey, prompt) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 32000,  // Flash 系列支援 64K,給 32K 高 buffer
          topK: 1,
          // 2.5-flash 有 thinking mode 會吃 token budget,關掉直接全部給輸出
          thinkingConfig: { thinkingBudget: 0 },
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      };
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await resp.text();
      if (!resp.ok) {
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        const err = new Error(parsed?.error?.message || `${resp.status} ${resp.statusText}`);
        err.status = resp.status;
        err.model = model;
        const lower = (err.message || '').toLowerCase();
        err.isQuota = resp.status === 429 || lower.includes('quota') || lower.includes('limit: 0');
        // thinkingConfig 不支援的 model 會 400 — 自動 fallback 到下個 model
        if (resp.status === 400 && lower.includes('thinking')) err.isQuota = true;
        throw err;
      }
      const data = JSON.parse(text);
      const candidate = data?.candidates?.[0];
      const finishReason = candidate?.finishReason;
      const parts = candidate?.content?.parts || [];
      // 多 parts 時要全部串起來
      const out = parts.map(p => p?.text || '').join('').trim();

      if (!out) {
        const reason = finishReason ? ` (finishReason: ${finishReason})` : '';
        throw new Error('Gemini 回傳空結果' + reason);
      }
      // 截斷警示
      if (finishReason === 'MAX_TOKENS') {
        console.warn('[Gemini] hit MAX_TOKENS, response 可能被截斷');
      }
      return { text: out, finishReason };
    }

    async function parseWithGemini(rdText, apiKey) {
      if (!apiKey) throw new Error('沒有設定 Gemini API key');
      if (!rdText.trim()) throw new Error('沒有 RD 內容');

      const prompt = GEMINI_SYSTEM_PROMPT + '\n\n輸入:\n' + rdText;
      const errors = [];

      for (const model of GEMINI_MODELS) {
        try {
          const { text: out, finishReason } = await callGeminiOne(model, apiKey, prompt);
          const cleaned = out
            .replace(/^```[a-z]*\n?/i, '')
            .replace(/\n?```\s*$/, '')
            .trim();
          return { text: cleaned, model, finishReason };
        } catch (e) {
          errors.push(`${model}: ${e.message}`);
          if (!e.isQuota) throw e;
        }
      }
      throw new Error(`所有模型都被配額限制:\n${errors.join('\n')}\n\n請去 https://aistudio.google.com 重新 create key,或檢查 GCP project 是否啟用了 Generative Language API。`);
    }

    const TYPE_LABEL = {
      song: 'Song',
      talking: 'Talking',
      transition: 'Transition',
      chaser: 'Chaser',
      section: 'Section',
    };

    // ────────────────────────────────────────────────────────────────
    // Icons (inline SVG, lucide-style stroke)
    // ────────────────────────────────────────────────────────────────
    const Icon = {
      file: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
      settings: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
      upload: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
      stack: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
      arrowRight: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
      check: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="20 6 9 17 4 12"/></svg>,
      close: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
      logo: (p) => <svg viewBox="0 0 40 40" fill="none" {...p}>
        <rect x="0" y="0" width="40" height="40" rx="9" fill="url(#g)"/>
        <path d="M11 27 L20 11 L29 27 M14.5 22 L25.5 22" stroke="black" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        <defs><linearGradient id="g" x1="0" y1="0" x2="40" y2="40">
          <stop offset="0" stopColor="#33ff85"/><stop offset="1" stopColor="#00cc55"/>
        </linearGradient></defs>
      </svg>,
    };

    // ────────────────────────────────────────────────────────────────
    // Card component
    // ────────────────────────────────────────────────────────────────
    function Card({ card, idx, isSelected, onClick, transparent, bgColor, useTypeColors, customColor, onDragStart, onDragEnd, onDragOver, onDrop, dropPosition }) {
      const t = useT();
      // 任何非空 label 都顯示大字 prefix(S## / INTRO / 轉場 / Chaser~ 等)
      const originalLabel = (card.label || '').trim();
      const hasOriginalLabel = originalLabel.length > 0;

      // manualLines 內容:第一行 = label(若原本有),其餘 = title rows
      const { labelText, lines } = useMemo(() => {
        if (card.manualLines && card.manualLines.trim()) {
          const all = card.manualLines.split('\n').map(l => l.trim()).filter(Boolean);
          if (hasOriginalLabel) {
            return { labelText: all[0] || originalLabel, lines: all.slice(1) };
          }
          return { labelText: '', lines: all };
        }
        return {
          labelText: originalLabel,
          lines: chooseBestLayout(card.title, hasOriginalLabel),
        };
      }, [card.title, card.manualLines, originalLabel, hasOriginalLabel]);
      const showLabel = labelText.length > 0;
      const colorClass = useTypeColors ? TYPE_COLORS[card.type] : null;
      const inlineStyle = !useTypeColors && customColor ? { color: customColor } : {};

      // 字級 layout — 跟 Canvas 渲染共用 computeStackLayout,杜絕未來 drift
      // Card 用 cqw 單位:availW = 100 × AVAIL_W_RATIO = 88cqw
      //                  availH = 56.25 × AVAIL_H_RATIO ≈ 47cqw
      const { labelFontSize: labelSizeRaw, perLineSize, maxLineWidth } = computeStackLayout({
        titleLines: lines,
        labelText,
        hasLabel: showLabel,
        availW: 100 * AVAIL_W_RATIO,
        availH: 56.25 * AVAIL_H_RATIO,
      });
      const labelFontSize = labelSizeRaw.toFixed(1);

      return (
        <div
          className={`flex flex-col gap-1.5 card-enter card-container relative ${dropPosition === 'before' ? 'before:absolute before:left-[-6px] before:top-0 before:bottom-0 before:w-[3px] before:bg-[#00ff66] before:rounded before:shadow-[0_0_8px_rgba(0,255,102,0.8)]' : ''} ${dropPosition === 'after' ? 'after:absolute after:right-[-6px] after:top-0 after:bottom-0 after:w-[3px] after:bg-[#00ff66] after:rounded after:shadow-[0_0_8px_rgba(0,255,102,0.8)]' : ''}`}
          draggable={true}
          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; if (onDragStart) onDragStart(idx, e); }}
          onDragEnd={(e) => { if (onDragEnd) onDragEnd(e); }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (onDragOver) onDragOver(idx, e); }}
          onDrop={(e) => { e.preventDefault(); if (onDrop) onDrop(idx, e); }}
        >
          <button
            onClick={onClick}
            className={`
              aspect-video rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden
              ${(transparent && !card.bgOverride) ? 'card-tex-checker' : ''}
              border transition-all duration-150 cursor-grab active:cursor-grabbing outline-none
              ${isSelected
                ? 'border-[#00ff66]/90 glow-pink scale-[1.025]'
                : 'border-slate-800/60 hover:border-slate-600/80 hover:scale-[1.015]'}
            `}
            style={(!transparent || card.bgOverride)
              ? { backgroundColor: card.bgOverride || bgColor || '#000000' }
              : undefined}
          >
            {isSelected && (
              <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-[#00ff66] flex items-center justify-center text-black shadow-lg shadow-[#00ff66]/50 z-10">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            )}
            <div
              className={`text-center card-font ${colorClass || ''} font-black uppercase tracking-tight leading-[0.92] select-none w-full flex flex-col items-center justify-center`}
              style={inlineStyle}
            >
              {showLabel && (
                <div style={{ fontSize: `${labelFontSize}cqw`, lineHeight: 1, marginBottom: '0.06em', whiteSpace: 'nowrap' }}>
                  {labelText}
                </div>
              )}
              {lines.map((l, i) => (
                <div key={i} style={{ fontSize: `${perLineSize[i].toFixed(1)}cqw`, lineHeight: 1.05, whiteSpace: 'nowrap' }}>{l}</div>
              ))}
            </div>
          </button>
          <div className="px-1 text-[11px] text-slate-500 mono tracking-wider flex items-center justify-between">
            <span>#{idx + 1}{labelText && ` · ${labelText}`}</span>
            <span className="text-slate-700">{lines.length} {t('grid.row')} · {Math.round(maxLineWidth)} {t('grid.width')}</span>
          </div>
        </div>
      );
    }

    // ────────────────────────────────────────────────────────────────
    // Card Edit Panel(slide-in from right)
    // ────────────────────────────────────────────────────────────────
    const TEXT_COLORS = [
      { nameKey: 'color.white', hex: '#FFFFFF' },
      { nameKey: 'color.red', hex: '#FF0000' },
      { nameKey: 'color.pink', hex: '#FF0080' },
      { nameKey: 'color.yellow', hex: '#FFFF00' },
    ];
    // 背景色 preset(全域 bgColor 跟 card.bgOverride 共用)
    // 黑是 default、白配深字、螢光綠是品牌色、螢光粉常用作 LIVE 強調
    const BG_COLORS = [
      { nameKey: 'color.black', hex: '#000000' },
      { nameKey: 'color.white', hex: '#FFFFFF' },
      { nameKey: 'color.neonGreen', hex: '#00FF66' },
      { nameKey: 'color.neonPink', hex: '#FF0080' },
    ];

    // S3:抽 BgColorPicker — SettingsModal 跟 DefaultPanel 共用,免重複定義 drift
    function BgColorPicker({ settings, setSettings, showHint }) {
      const t = useT();
      if (settings.transparent) return null;
      const set = (k, v) => setSettings(s => ({ ...s, [k]: v }));
      const current = (settings.bgColor || '#000000').toLowerCase();
      return (
        <section>
          <label className="text-[11px] uppercase tracking-widest text-slate-500 mb-2 block">{t('settings.bgColor')}</label>
          <div className="flex items-center gap-2">
            {BG_COLORS.map(c => (
              <button
                key={c.hex}
                onClick={() => set('bgColor', c.hex)}
                className={`w-9 h-9 rounded-full border-2 transition ${
                  current === c.hex.toLowerCase()
                    ? 'border-[#00ff66] scale-110'
                    : 'border-slate-700 hover:border-slate-500'
                }`}
                style={{ backgroundColor: c.hex }}
                title={t(c.nameKey)}
              />
            ))}
            <div className="flex-1" />
            <input
              type="color"
              value={settings.bgColor || '#000000'}
              onChange={e => set('bgColor', e.target.value)}
              className="w-9 h-9 rounded cursor-pointer border-2 border-slate-700"
            />
          </div>
          {showHint && (
            <div className="text-[10px] text-slate-500 mt-2">
              {t('settings.bgColorHint')}
            </div>
          )}
        </section>
      );
    }

    function CardEditPanel({ card, idx, settings, onUpdate, onDelete, onDuplicate }) {
      const t = useT();
      const isTransparentMode = !!(settings && settings.transparent);

      const safeLabel = String(card?.label || '').trim();
      const safeTitle = String(card?.title || '');

      // 編輯區預填「完整原文」(只剝 parens,不截斷)
      const autoLines = useMemo(() => {
        const cleanFull = safeTitle.replace(/[((][^))]*[))]/g, '').trim();
        return [safeLabel, cleanFull].filter(Boolean).join('\n');
      }, [safeLabel, safeTitle]);

      // 卡片實際渲染的 lines(會被 8 字截斷)— 用來顯示「目前顯示」預覽
      const renderedLines = useMemo(() => {
        try {
          const titleLines = chooseBestLayout(safeTitle, !!safeLabel) || [];
          return [safeLabel, ...titleLines].filter(Boolean);
        } catch (e) {
          console.error('renderedLines error:', e);
          return safeLabel ? [safeLabel] : [];
        }
      }, [safeLabel, safeTitle]);

      // 偵測:原文有沒有超過 8 字導致截斷
      const cleanFullTitle = safeTitle.replace(/[((][^))]*[))]/g, '').trim();
      const isCJK = /[一-鿿]/.test(cleanFullTitle);
      const isTruncated = (isCJK && cleanFullTitle.length > 8) || (!isCJK && cleanFullTitle.length > 18);

      const initialDraft = card.manualLines || autoLines;

      const [type, setType] = useState(card.type);
      const [color, setColor] = useState(card.colorOverride || '#FF0080');
      const [useOverride, setUseOverride] = useState(!!card.colorOverride);
      // N3:local state 改名 bgOverrideHex,跟 settings.bgColor / Card props bgColor 區分
      const [bgOverrideHex, setBgOverrideHex] = useState(card.bgOverride || '#000000');
      const [useBgOverride, setUseBgOverride] = useState(!!card.bgOverride);
      const [showBgSection, setShowBgSection] = useState(!!card.bgOverride); // S4:背景色 section 預設 collapsed
      const [linesDraft, setLinesDraft] = useState(initialDraft);
      const hasLineOverride = !!card.manualLines;
      const skipSyncRef = useRef(true); // 切卡片時跳過第一次 sync,避免把 colorOverride: null 寫進 store

      // 切換到別張卡 → 重新初始化
      useEffect(() => {
        skipSyncRef.current = true;
        setType(card.type);
        setColor(card.colorOverride || '#FF0080');
        setUseOverride(!!card.colorOverride);
        setBgOverrideHex(card.bgOverride || '#000000');
        setUseBgOverride(!!card.bgOverride);
        setShowBgSection(!!card.bgOverride);
        setLinesDraft(card.manualLines || autoLines);
      }, [card._key]);

      // 同步 type / color / bg override 到 store(linesDraft 走另一條 onChange)
      useEffect(() => {
        if (skipSyncRef.current) {
          skipSyncRef.current = false;
          return;
        }
        // 只有真的跟 card 既有值不同才 update,避免把 null 寫進原本沒這欄的卡
        const nextColorOverride = useOverride ? color : null;
        const nextBgOverride = useBgOverride ? bgOverrideHex : null;
        if (type === card.type
            && (card.colorOverride || null) === nextColorOverride
            && (card.bgOverride || null) === nextBgOverride) return;
        onUpdate(idx, {
          ...card,
          type,
          colorOverride: nextColorOverride,
          bgOverride: nextBgOverride,
        });
      }, [type, color, useOverride, bgOverrideHex, useBgOverride]);

      // S5:文字跟背景幾乎同色 → inline 警告
      // (isCardInvisible 內部已處理 transparent + override 的邏輯)
      const previewCard = { ...card, colorOverride: useOverride ? color : null, bgOverride: useBgOverride ? bgOverrideHex : null };
      const invisible = isCardInvisible(previewCard, settings);

      // linesDraft 改變 → 判斷是否變成 override
      const onLinesChange = (val) => {
        setLinesDraft(val);
        if (val.trim() === '' || val === autoLines) {
          // 空 或 跟自動一樣 → 清掉 override
          onUpdate(idx, { ...card, manualLines: null });
        } else {
          onUpdate(idx, { ...card, manualLines: val });
        }
      };

      const revertToAuto = () => {
        setLinesDraft(autoLines);
        onUpdate(idx, { ...card, manualLines: null });
      };

      return (
        <div className="h-full flex flex-col">
          <div className="px-5 py-4 border-b border-slate-800/60">
            <div className="text-[10px] uppercase tracking-widest text-[#33ff85]">{t('cardEdit.title')}</div>
            <div className="text-lg font-semibold mt-0.5">#{idx + 1} · {safeLabel || safeTitle.slice(0, 8) || '—'}</div>
          </div>

            <div className="flex-1 overflow-auto scrollbar-pretty p-5 space-y-5">
              {/* Card lines — 直接編輯字卡內容,Enter 換行 */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] uppercase tracking-widest text-slate-500">
                    {t('cardEdit.content')} <span className="text-slate-600 normal-case tracking-normal">{t('cardEdit.contentEnter')}</span>
                  </label>
                  {hasLineOverride ? (
                    <button
                      onClick={revertToAuto}
                      className="text-[11px] px-2 py-0.5 rounded bg-[#00ff66]/15 text-[#99ffaa] hover:bg-[#00ff66]/25 transition"
                    >
                      {t('cardEdit.revertAuto')}
                    </button>
                  ) : (
                    <span className="text-[10px] text-emerald-500/70">{t('cardEdit.autoLayout')}</span>
                  )}
                </div>
                <textarea
                  value={linesDraft || ''}
                  onChange={e => onLinesChange(e.target.value)}
                  onKeyDown={e => e.stopPropagation()}
                  rows={4}
                  className={`w-full card-font text-base font-black uppercase px-3 py-2.5 rounded-lg border focus:outline-none resize-none leading-tight tracking-tight ${
                    hasLineOverride
                      ? 'bg-[#00ff66]/5 border-[#00ff66]/40 focus:border-[#00ff66]/80'
                      : 'bg-slate-800/40 border-slate-700/50 focus:border-[#00ff66]/60'
                  }`}
                />

                {/* 截斷警示 + 實際渲染預覽 */}
                {!hasLineOverride && isTruncated && (
                  <div className="mt-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300/90 leading-relaxed">
                    <div className="font-semibold mb-1">{t('cardEdit.truncatedTitle')}</div>
                    <div className="text-amber-200/70 mb-1.5">
                      {t('cardEdit.truncatedHint', { n: cleanFullTitle.length })}
                    </div>
                    <div className="text-amber-200/60">{t('cardEdit.truncatedActual')}</div>
                    <div className="mono text-amber-100 font-bold mt-1 pl-2 border-l-2 border-amber-500/40">
                      {renderedLines.map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                    <div className="text-amber-200/60 mt-1.5">
                      {t('cardEdit.truncatedTip')}
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-slate-600 mt-1.5 leading-relaxed">
                  {hasLineOverride
                    ? t('cardEdit.contentOverridden')
                    : t('cardEdit.contentPlaceholder')}
                </div>
              </section>

              {/* Type */}
              <section>
                <label className="text-[11px] uppercase tracking-widest text-slate-500 mb-2 block">{t('cardEdit.type')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(TYPE_LABEL).filter(([k]) => k !== 'section').map(([k]) => (
                    <button
                      key={k}
                      onClick={() => setType(k)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                        type === k
                          ? 'bg-[#00ff66]/15 border-[#00ff66]/60 text-[#99ffaa]'
                          : 'bg-slate-800/30 border-slate-700/50 hover:border-slate-600/80 text-slate-300'
                      }`}
                    >
                      {t('type.' + k)}
                    </button>
                  ))}
                </div>
              </section>

              {/* Color */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] uppercase tracking-widest text-slate-500">{t('cardEdit.colorOverride')}</label>
                  <button
                    onClick={() => setUseOverride(!useOverride)}
                    className={`text-xs px-2 py-0.5 rounded ${useOverride ? 'bg-[#00ff66]/20 text-[#99ffaa]' : 'bg-slate-800 text-slate-400'}`}
                  >
                    {useOverride ? t('cardEdit.overrideOn') : t('cardEdit.autoFromType')}
                  </button>
                </div>
                <div className={`flex items-center gap-2 ${!useOverride ? 'opacity-40 pointer-events-none' : ''}`}>
                  {TEXT_COLORS.map(c => (
                    <button
                      key={c.hex}
                      onClick={() => { setColor(c.hex); setUseOverride(true); }}
                      className={`w-9 h-9 rounded-full border-2 transition ${
                        color.toLowerCase() === c.hex.toLowerCase() && useOverride
                          ? 'border-[#00ff66] scale-110'
                          : 'border-slate-700 hover:border-slate-500'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={t(c.nameKey)}
                    />
                  ))}
                  <div className="flex-1" />
                  <input
                    type="color"
                    value={color}
                    onChange={e => { setColor(e.target.value); setUseOverride(true); }}
                    className="w-9 h-9 rounded cursor-pointer border-2 border-slate-700"
                  />
                </div>
                <input
                  type="text"
                  value={color.toUpperCase()}
                  onChange={e => { setColor(e.target.value); setUseOverride(true); }}
                  className={`mt-2 w-full mono text-xs px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 focus:border-[#00ff66]/60 focus:outline-none ${!useOverride ? 'opacity-40' : ''}`}
                  disabled={!useOverride}
                />
              </section>

              {/* S5:contrast 警告 — 背景跟文字幾乎同色,匯出後字看不見 */}
              {invisible && (
                <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                  {t('cardEdit.invisibleWarn')}
                </div>
              )}

              {/* 背景色 override — S4 預設 collapsed(只有 user 已 override 才展開)*/}
              <section>
                <button
                  onClick={() => setShowBgSection(s => !s)}
                  className="flex items-center justify-between w-full text-left group"
                >
                  <label className="text-[11px] uppercase tracking-widest text-slate-500 group-hover:text-slate-400 cursor-pointer">
                    {t('cardEdit.bgOverride')}
                    {useBgOverride && (
                      <span className="ml-2 normal-case tracking-normal text-[10px] text-[#33ff85]">
                        · {bgOverrideHex.toUpperCase()}
                      </span>
                    )}
                  </label>
                  <span className="text-slate-500 text-xs">{showBgSection ? '▾' : '▸'}</span>
                </button>

                {showBgSection && (
                  <div className="mt-2 space-y-2">
                    {isTransparentMode && useBgOverride && (
                      <div className="rounded-lg border border-[#00ff66]/30 bg-[#00ff66]/5 px-3 py-2 text-[11px] text-[#99ffaa]">
                        {t('cardEdit.transparentBgNote')}
                      </div>
                    )}
                    <div className={`flex items-center justify-between`}>
                      <span className="text-[10px] text-slate-500">{t('cardEdit.bgOverrideHint')}</span>
                      <button
                        onClick={() => setUseBgOverride(!useBgOverride)}
                        className={`text-xs px-2 py-0.5 rounded ${useBgOverride ? 'bg-[#00ff66]/20 text-[#99ffaa]' : 'bg-slate-800 text-slate-400'}`}
                      >
                        {useBgOverride ? t('cardEdit.overrideOn') : t('cardEdit.overrideOff')}
                      </button>
                    </div>
                    <div className={`flex items-center gap-2 ${!useBgOverride ? 'opacity-40 pointer-events-none' : ''}`}>
                      {BG_COLORS.map(c => (
                        <button
                          key={c.hex}
                          onClick={() => { setBgOverrideHex(c.hex); setUseBgOverride(true); }}
                          className={`w-9 h-9 rounded-full border-2 transition ${
                            bgOverrideHex.toLowerCase() === c.hex.toLowerCase() && useBgOverride
                              ? 'border-[#00ff66] scale-110'
                              : 'border-slate-700 hover:border-slate-500'
                          }`}
                          style={{ backgroundColor: c.hex }}
                          title={t(c.nameKey)}
                        />
                      ))}
                      <div className="flex-1" />
                      <input
                        type="color"
                        value={bgOverrideHex}
                        onChange={e => { setBgOverrideHex(e.target.value); setUseBgOverride(true); }}
                        className="w-9 h-9 rounded cursor-pointer border-2 border-slate-700"
                      />
                    </div>
                    <input
                      type="text"
                      value={bgOverrideHex.toUpperCase()}
                      onChange={e => { setBgOverrideHex(e.target.value); setUseBgOverride(true); }}
                      className={`w-full mono text-xs px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 focus:border-[#00ff66]/60 focus:outline-none ${!useBgOverride ? 'opacity-40' : ''}`}
                      disabled={!useBgOverride}
                    />
                  </div>
                )}
              </section>

            </div>

          <div className="border-t border-slate-800/60 p-4 flex gap-3">
            <button
              onClick={() => onDelete(idx)}
              className="flex-1 py-2.5 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm font-medium transition"
            >
              {t('cardEdit.delete')}
            </button>
            <button
              onClick={() => onDuplicate(idx)}
              className="flex-1 py-2.5 rounded-lg bg-[#00ff66] hover:bg-[#33ff85] text-black text-sm font-semibold transition shadow-lg shadow-[#00ff66]/30"
            >
              {t('cardEdit.duplicate')}
            </button>
          </div>
        </div>
      );
    }

    // ────────────────────────────────────────────────────────────────
    // Bulk Edit Panel(2+ 張選取時)
    // ────────────────────────────────────────────────────────────────
    function BulkEditPanel({ ids, cards, settings, onApply, onClear }) {
      const t = useT();
      const previewCards = ids.slice(0, 6).map(i => cards[i]).filter(Boolean);
      const moreCount = ids.length - previewCards.length;
      const isTransparentMode = !!(settings && settings.transparent);

      const applyColor = (hex) => onApply(ids, { colorOverride: hex });
      const clearColor = () => onApply(ids, { colorOverride: null });
      const applyBg = (hex) => onApply(ids, { bgOverride: hex });
      const clearBg = () => onApply(ids, { bgOverride: null });
      const applyType = (type) => onApply(ids, { type });

      return (
        <div className="h-full flex flex-col">
          <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#33ff85]">{t('bulk.title')}</div>
              <div className="text-lg font-semibold mt-0.5">{ids.length} {t('bulk.cardsCount')}</div>
            </div>
            <button onClick={onClear} className="text-xs px-2.5 py-1 rounded text-slate-400 hover:text-white hover:bg-slate-800/50 transition">
              {t('bulk.cancelSelection')}
            </button>
          </div>

            {/* 預覽縮圖列 — N1:套上實際 bgColor / bgOverride 才能反映 user 看到的效果 */}
            <div className="px-5 py-3 border-b border-slate-800/40">
              <div className="grid grid-cols-3 gap-1.5">
                {previewCards.map((c, i) => {
                  // 跟 Card 元件邏輯一致:transparent ON + override 仍顯示色;沒 override 才透明
                  const showBg = !isTransparentMode || c.bgOverride;
                  const bg = showBg ? (c.bgOverride || (settings && settings.bgColor) || '#000000') : null;
                  const text = c.colorOverride || (settings && settings.useTypeColors ? (TYPE_HEX[c.type] || '#FFFFFF') : (settings && settings.textColor) || '#FFFFFF');
                  return (
                    <div
                      key={i}
                      className={`aspect-video rounded border border-[#00ff66]/40 flex items-center justify-center text-[10px] font-bold uppercase tracking-tight px-1 truncate ${!bg ? 'card-tex-checker' : ''}`}
                      style={bg ? { backgroundColor: bg, color: text } : { color: text }}
                    >
                      {(c.label ? c.label + ' ' : '') + (c.title || '').slice(0, 6)}
                    </div>
                  );
                })}
                {moreCount > 0 && (
                  <div className="aspect-video rounded bg-slate-800/40 border border-slate-700/40 flex items-center justify-center text-xs text-slate-400">
                    +{moreCount}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto scrollbar-pretty p-5 space-y-5">
              {/* 一次改顏色 */}
              <section>
                <label className="text-[11px] uppercase tracking-widest text-slate-500 mb-3 block">{t('bulk.applyColor')}</label>
                <div className="grid grid-cols-4 gap-2">
                  {TEXT_COLORS.map(c => (
                    <button
                      key={c.hex}
                      onClick={() => applyColor(c.hex)}
                      className="aspect-square rounded-xl border-2 border-slate-700 hover:border-[#00ff66] hover:scale-105 transition flex flex-col items-center justify-center gap-1.5"
                      style={{ backgroundColor: c.hex }}
                    >
                      <div className="text-xs font-bold mix-blend-difference text-white">{t(c.nameKey)}</div>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <input
                    type="color"
                    onChange={e => applyColor(e.target.value)}
                    className="w-12 h-10 rounded cursor-pointer border-2 border-slate-700"
                    title={t('app.colorCustom')}
                  />
                  <button onClick={clearColor} className="flex-1 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 text-sm transition">
                    {t('bulk.clearColor')}
                  </button>
                </div>
              </section>

              {/* 一次改背景色 */}
              <section>
                <label className="text-[11px] uppercase tracking-widest text-slate-500 mb-3 block">{t('bulk.applyBg')}</label>
                <div className="grid grid-cols-4 gap-2">
                  {BG_COLORS.map(c => (
                    <button
                      key={c.hex}
                      onClick={() => applyBg(c.hex)}
                      className="aspect-square rounded-xl border-2 border-slate-700 hover:border-[#00ff66] hover:scale-105 transition flex flex-col items-center justify-center gap-1.5"
                      style={{ backgroundColor: c.hex }}
                    >
                      <div className="text-xs font-bold mix-blend-difference text-white">{t(c.nameKey)}</div>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <input
                    type="color"
                    onChange={e => applyBg(e.target.value)}
                    className="w-12 h-10 rounded cursor-pointer border-2 border-slate-700"
                    title={t('app.bgCustom')}
                  />
                  <button onClick={clearBg} className="flex-1 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 text-sm transition">
                    {t('bulk.clearBg')}
                  </button>
                </div>
              </section>

              {/* 一次改類型 */}
              <section>
                <label className="text-[11px] uppercase tracking-widest text-slate-500 mb-3 block">{t('bulk.applyType')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(TYPE_LABEL).filter(([k]) => k !== 'section').map(([k]) => (
                    <button
                      key={k}
                      onClick={() => applyType(k)}
                      className="px-3 py-2.5 rounded-lg text-sm font-medium border border-slate-700/50 bg-slate-800/30 hover:border-[#00ff66]/60 hover:bg-[#00ff66]/10 transition"
                    >
                      {t('type.' + k)}
                    </button>
                  ))}
                </div>
              </section>
            </div>

          <div className="pt-2 px-5 pb-5 text-xs text-slate-500 leading-relaxed border-t border-slate-800/40">
            <div className="font-semibold text-slate-400 mb-1 mt-3">{t('bulk.tipTitle')}</div>
            {t('bulk.tipBody', { n: ids.length })}<br/>
            <kbd>Esc</kbd> {t('bulk.escTip')}
          </div>
        </div>
      );
    }

    // ────────────────────────────────────────────────────────────────
    // Settings Modal
    // ────────────────────────────────────────────────────────────────
    function SettingsModal({ open, onClose, settings, setSettings, appVersion, onCheckUpdate }) {
      const t = useT();
      const [checkState, setCheckState] = useState(''); // '', 'checking', 'latest', 'newer:vX.Y.Z', 'error'
      if (!open) return null;
      const set = (k, v) => setSettings(s => ({ ...s, [k]: v }));

      const handleCheck = async () => {
        if (!onCheckUpdate) return;
        setCheckState('checking');
        const r = await onCheckUpdate();
        setCheckState(r);
      };

      return (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
          <div className="fixed top-0 right-0 bottom-0 w-[420px] bg-[#0c0c10] border-l border-slate-800/80 z-50 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/60">
              <h2 className="text-xl font-semibold tracking-tight">{t('settings.title')}</h2>
              <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-800/50 flex items-center justify-center transition">
                <Icon.close className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-auto scrollbar-pretty p-6 space-y-6">
              <section>
                <label className="text-[11px] uppercase tracking-widest text-slate-500 mb-3 block">{t('settings.textColor')}</label>
                <div className="flex gap-3">
                  {TEXT_COLORS.map(c => (
                    <button
                      key={c.hex}
                      onClick={() => set('textColor', c.hex)}
                      className={`w-12 h-12 rounded-full border-2 transition ${
                        settings.textColor.toLowerCase() === c.hex.toLowerCase()
                          ? 'border-[#00ff66] scale-110 glow-pink-soft'
                          : 'border-slate-700 hover:border-slate-500'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={t(c.nameKey)}
                    />
                  ))}
                </div>
              </section>

              <Toggle
                label={t('settings.useTypeColors')}
                desc={t('settings.useTypeColorsDesc')}
                checked={settings.useTypeColors}
                onChange={v => set('useTypeColors', v)}
              />

              <Toggle
                label={t('settings.transparent')}
                desc={t('settings.transparentDesc')}
                checked={settings.transparent}
                onChange={v => set('transparent', v)}
              />

              <BgColorPicker settings={settings} setSettings={setSettings} showHint />

              <section>
                <label className="text-[11px] uppercase tracking-widest text-slate-500 mb-2 block">{t('settings.split5')}</label>
                <div className="flex bg-slate-800/30 border border-slate-700/50 rounded-lg p-1">
                  {['3/2', '2/3'].map(opt => (
                    <button
                      key={opt}
                      onClick={() => set('split5', opt)}
                      className={`flex-1 py-2 text-sm rounded transition ${
                        settings.split5 === opt
                          ? 'bg-[#00ff66] text-black font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </section>

              {/* useJieba / checkUpdate toggle 已移除:背後沒實作,留著會誤導 VJ 以為有效。
                  之後若實作再加回來,設定該長怎樣到時再決定。 */}
            </div>

            <div className="border-t border-slate-800/60 px-6 py-3 flex items-center justify-between gap-3">
              <button
                onClick={handleCheck}
                disabled={checkState === 'checking'}
                className="text-[11px] px-2.5 py-1 rounded bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 transition disabled:opacity-50"
              >
                {checkState === 'checking' ? t('settings.checking') : t('settings.checkUpdate')}
              </button>
              {checkState === 'latest' && <span className="text-[11px] text-emerald-400/80">{t('settings.latest')}</span>}
              {checkState.startsWith('newer:') && <span className="text-[11px] text-[#33ff85]">{checkState.slice(6)} {t('settings.newer')}</span>}
              {checkState === 'error' && <span className="text-[11px] text-amber-400/80">{t('settings.checkError')}</span>}
              <span className="text-[11px] text-slate-600 ml-auto">{formatVersion(appVersion)}</span>
            </div>
          </div>
        </>
      );
    }

    function Toggle({ label, desc, checked, onChange }) {
      return (
        <section className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-sm font-medium">{label}</div>
            {desc && <div className="text-xs text-slate-500 mt-0.5">{desc}</div>}
          </div>
          <button
            onClick={() => onChange(!checked)}
            className={`relative w-11 h-6 rounded-full transition ${checked ? 'bg-[#00ff66]' : 'bg-slate-700'}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${checked ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </section>
      );
    }

    // ────────────────────────────────────────────────────────────────
    // Rundown Parser Modal
    // ────────────────────────────────────────────────────────────────
    function GeminiKeyRow({ geminiApiKey, setGeminiApiKey, geminiKeyError }) {
      const t = useT();
      const [draft, setDraft] = useState(geminiApiKey || '');
      useEffect(() => { setDraft(geminiApiKey || ''); }, [geminiApiKey]);
      const dirty = draft !== (geminiApiKey || '');
      const commit = () => { if (dirty) setGeminiApiKey(draft); };
      return (
        <div className="border-t border-slate-800/60 px-6 py-2.5 bg-slate-900/40 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 shrink-0">{t('parser.geminiKey')}</span>
            <input
              type="password"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); e.target.blur(); } }}
              placeholder={t('parser.geminiKeyPlaceholder')}
              className="flex-1 mono px-3 py-1.5 rounded bg-slate-800/60 border border-slate-700 focus:border-[#00ff66]/60 focus:outline-none placeholder-slate-600 text-slate-100"
            />
            {!dirty && draft && !geminiKeyError && (
              <span className="text-[10px] text-emerald-500/80 shrink-0">{t('parser.geminiKeySaved')}</span>
            )}
            {dirty && (
              <span className="text-[10px] text-amber-400/80 shrink-0">{t('parser.geminiKeyDirty')}</span>
            )}
            <a
              href="https://aistudio.google.com/apikey"
              onClick={e => { e.preventDefault(); window.open('https://aistudio.google.com/apikey', '_blank'); }}
              className="text-[#33ff85] hover:underline shrink-0"
            >
              {t('parser.geminiKeyGet')}
            </a>
          </div>
          {geminiKeyError && (
            <div className="mt-1.5 text-[11px] text-red-400">⚠ {geminiKeyError}</div>
          )}
          {/* 隱私說明 — 公開版本 user 不認識我們,要把資料流明確講出來 */}
          <div className="mt-2 text-[10px] text-slate-500 leading-relaxed">
            {t('parser.geminiKeyPrivacy1')}
            <br />
            {t('parser.geminiKeyPrivacy2')}
          </div>
        </div>
      );
    }

    function ParserModal({ open, onClose, onImport, geminiApiKey, setGeminiApiKey, geminiKeyError }) {
      const t = useT();
      const [raw, setRaw] = useState('');
      const [result, setResult] = useState('');
      const [lang, setLang] = useState('繁');
      const [status, setStatus] = useState('');
      const [smartLoading, setSmartLoading] = useState(false);
      // Undo history:每次 parse / 清除前 push (raw, result, status) snapshot
      const [history, setHistory] = useState([]);

      // Modal 開啟時綁 Ctrl+Z(textarea 內由瀏覽器原生 undo 處理,只在按鈕區攔截)
      useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
          if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
            const tag = (e.target?.tagName || '');
            if (tag !== 'TEXTAREA' && tag !== 'INPUT') {
              e.preventDefault();
              e.stopPropagation();
              undoSnapshot();
            }
          }
        };
        document.addEventListener('keydown', onKey, true); // capture 階段攔截,優先於 App 的 handler
        return () => document.removeEventListener('keydown', onKey, true);
      }, [open, history]);

      if (!open) return null;

      const pushSnapshot = () => {
        setHistory(h => {
          const next = [...h, { raw, result, status }];
          return next.length > 20 ? next.slice(1) : next;
        });
      };

      const undoSnapshot = () => {
        // 不要在 setHistory 的 updater 裡呼叫其他 setter:React 不保證 updater 只跑一次
        if (history.length === 0) return;
        const last = history[history.length - 1];
        setRaw(last.raw);
        setResult(last.result);
        setStatus(last.status ? t('parser.statusUndonePrefix') + last.status : t('parser.statusUndone'));
        setHistory(h => h.slice(0, -1));
      };

      const doParse = () => {
        if (!raw.trim()) { setStatus(t('parser.statusEmpty')); return; }
        pushSnapshot();
        const out = parseRdMessy(raw);
        setResult(out);
        const count = out.split('\n').filter(Boolean).length;
        setStatus(count ? t('parser.statusRuleFound', { n: count }) : t('parser.statusRuleNone'));
      };

      // ────── PDF 上傳:抽文字到 raw textarea ──────
      const handlePdfFile = async (file) => {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.pdf')) {
          setStatus(t('parser.statusOnlyPdf'));
          return;
        }
        if (!window.pdfjsLib) {
          setStatus(t('parser.statusPdfNotLoaded'));
          return;
        }
        setStatus(t('parser.statusPdfLoading', { kb: (file.size / 1024).toFixed(1) }));
        try {
          const buf = await file.arrayBuffer();
          const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
          const pages = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            setStatus(t('parser.statusPdfPage', { i, total: pdf.numPages }));
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            // 用 item 的 y 座標(transform[5])還原行結構 — 同 y 同行 join 空格,
            // 不同 y 用換行。否則 parser 會看到一坨單行文字無法切 setlist。
            // PDF y 座標是下到上,但 PDF.js 通常按閱讀順序(上到下)輸出 items。
            const Y_TOLERANCE = 2; // y 差 < 2 視為同行
            const lines = [];
            let currentLine = [];
            let lastY = null;
            for (const item of content.items) {
              if (!item.str) continue;
              const y = item.transform ? item.transform[5] : null;
              if (lastY !== null && y !== null && Math.abs(y - lastY) > Y_TOLERANCE) {
                if (currentLine.length) lines.push(currentLine.join(' ').trim());
                currentLine = [];
              }
              currentLine.push(item.str);
              if (y !== null) lastY = y;
            }
            if (currentLine.length) lines.push(currentLine.join(' ').trim());
            pages.push(lines.filter(Boolean).join('\n'));
          }
          const text = pages.join('\n\n').trim();
          if (!text) {
            setStatus(t('parser.statusPdfNoText'));
            return;
          }
          pushSnapshot();
          setRaw(text);
          setStatus(t('parser.statusPdfFromN', { pages: pdf.numPages, chars: text.length }));
        } catch (e) {
          setStatus(t('parser.statusPdfFail', { err: e.message }));
        }
      };

      const onPdfButtonClick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/pdf,.pdf';
        input.onchange = (e) => handlePdfFile(e.target.files?.[0]);
        input.click();
      };

      const onRawDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files?.[0];
        if (file) handlePdfFile(file);
      };

      const doSmartParse = async () => {
        if (!raw.trim()) { setStatus(t('parser.statusEmpty')); return; }
        if (!geminiApiKey) {
          setStatus(t('parser.statusNoKey'));
          return;
        }
        // 首次使用顯式警告:把 RD 內容送 Google Gemini API,NDA 曲目請改用規則 parser
        const GEMINI_WARN_KEY = 'arena-cardgen-gemini-warned';
        if (!localStorage.getItem(GEMINI_WARN_KEY)) {
          const ok = window.confirm(
            t('parser.geminiWarnTitle') + '\n\n' + t('parser.geminiWarnBody')
          );
          if (!ok) return;
          localStorage.setItem(GEMINI_WARN_KEY, '1');
        }
        pushSnapshot();
        setSmartLoading(true);
        setStatus(t('parser.statusSmartLoading'));
        try {
          const r = await parseWithGemini(raw, geminiApiKey);
          setResult(r.text);
          const count = r.text.split('\n').filter(Boolean).length;
          const truncWarn = r.finishReason === 'MAX_TOKENS' ? t('parser.statusTruncated') : '';
          setStatus(t('parser.statusSmartFound', { model: r.model, n: count }) + truncWarn);
        } catch (e) {
          setStatus('❌ ' + (e.message || t('parser.statusUnknown')));
        } finally {
          setSmartLoading(false);
        }
      };

      return (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-40" onClick={onClose} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
            <div className="bg-[#0c0c10] border border-slate-800/80 rounded-2xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/60">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">{t('parser.title')}</h2>
                  <p className="text-xs text-slate-500 mt-1">{t('parser.subtitle')}</p>
                </div>
                <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-slate-800/50 flex items-center justify-center transition">
                  <Icon.close className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 grid grid-cols-2 gap-4 p-6 overflow-hidden">
                <div
                  className="flex flex-col bg-slate-900/30 rounded-xl border border-slate-800/50 overflow-hidden"
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('ring-2','ring-[#00ff66]/60'); }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove('ring-2','ring-[#00ff66]/60'); }}
                  onDrop={(e) => { e.currentTarget.classList.remove('ring-2','ring-[#00ff66]/60'); onRawDrop(e); }}
                >
                  <div className="px-4 py-2.5 text-[11px] uppercase tracking-widest text-slate-500 border-b border-slate-800/50 flex items-center justify-between">
                    <span>{t('parser.rawLabel')}</span>
                    <button
                      onClick={onPdfButtonClick}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[#33ff85] normal-case tracking-normal text-xs font-semibold flex items-center gap-1"
                    >
                      {t('parser.pdfBtn')}
                    </button>
                  </div>
                  <textarea
                    value={raw}
                    onChange={e => setRaw(e.target.value)}
                    placeholder={t('parser.pdfPlaceholder')}
                    className="flex-1 mono text-sm p-4 bg-transparent resize-none focus:outline-none text-slate-200 placeholder-slate-600"
                    spellCheck="false"
                  />
                </div>
                <div className="flex flex-col bg-emerald-950/20 rounded-xl border border-emerald-900/40 overflow-hidden">
                  <div className="px-4 py-2.5 text-[11px] uppercase tracking-widest text-emerald-500/80 border-b border-emerald-900/40">{t('parser.resultLabel')}</div>
                  <textarea
                    value={result}
                    onChange={e => setResult(e.target.value)}
                    className="flex-1 mono text-sm p-4 bg-transparent resize-none focus:outline-none text-emerald-300"
                    spellCheck="false"
                  />
                </div>
              </div>

              <div className="border-t border-slate-800/60 px-6 py-4 flex items-center gap-3 flex-wrap">
                <button
                  onClick={doParse}
                  disabled={smartLoading}
                  className="px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition flex items-center gap-2 disabled:opacity-50"
                >
                  {t('parser.btnRule')}
                </button>
                <button
                  onClick={doSmartParse}
                  disabled={smartLoading}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition shadow-lg flex items-center gap-2 ${
                    geminiApiKey
                      ? 'bg-[#00ff66] hover:bg-[#33ff85] text-black shadow-[#00ff66]/30'
                      : 'bg-slate-800 text-slate-500 cursor-pointer hover:bg-slate-700'
                  } disabled:opacity-50`}
                  title={geminiApiKey ? t('parser.smartTitle') : t('parser.smartTitleNoKey')}
                >
                  {smartLoading ? t('parser.btnSmartLoading') : geminiApiKey ? t('parser.btnSmart') : t('parser.btnSmartNoKey')}
                </button>
                <div className="flex bg-slate-800/40 border border-slate-700/50 rounded-lg p-0.5">
                  {['繁', '簡'].map(L => (
                    <button
                      key={L}
                      onClick={() => setLang(L)}
                      className={`px-3 py-1.5 text-xs rounded transition ${lang === L ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
                    >
                      {L === '繁' ? '繁體' : '简体'}
                    </button>
                  ))}
                </div>
                {status && (
                  <div className={`text-xs ml-2 ${status.startsWith('✓') ? 'text-emerald-400' : status.startsWith('❌') ? 'text-red-400' : 'text-amber-400'}`}>
                    {status}
                  </div>
                )}
                <button
                  onClick={undoSnapshot}
                  disabled={history.length === 0}
                  className={`px-3 py-2.5 rounded-lg text-sm transition flex items-center gap-1 ${
                    history.length > 0
                      ? 'text-slate-300 hover:text-white hover:bg-slate-800/50 border border-slate-700'
                      : 'text-slate-600 border border-slate-800 cursor-not-allowed'
                  }`}
                  title={t('parser.undoTitle', { n: history.length })}
                >
                  {t('parser.btnUndo')} {history.length > 0 && <span className="text-xs opacity-60">({history.length})</span>}
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => {
                    if (raw || result) pushSnapshot();
                    setRaw(''); setResult(''); setStatus('');
                  }}
                  className="px-4 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 text-sm transition"
                >
                  {t('parser.btnClear')}
                </button>
                <button
                  onClick={() => { if (result) { onImport(result); onClose(); } }}
                  disabled={!result}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
                    result
                      ? 'bg-slate-700 hover:bg-slate-600 text-white'
                      : 'bg-slate-800/40 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  {t('parser.btnImport')}
                  <Icon.arrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Gemini API key 列(常駐底部)
                  S-5:用 local draft + onBlur 才寫進 safeStorage,避免每字元 fire 一次 keychain encrypt + disk write */}
              <GeminiKeyRow
                geminiApiKey={geminiApiKey}
                setGeminiApiKey={setGeminiApiKey}
                geminiKeyError={geminiKeyError}
              />
            </div>
          </div>
        </>
      );
    }

    // ────────────────────────────────────────────────────────────────
    // Pre-Export Checklist
    // ────────────────────────────────────────────────────────────────
    function ExportChecklist({ open, cards, selectedIds, settings, fontsReady, onClose, onConfirm }) {
      const t = useT();
      const hasSelection = selectedIds && selectedIds.size > 0;
      // scope:default 'all'(主流操作是匯出全部);user 想 narrow 才主動切「只選中」
      const [scope, setScope] = useState('all');
      useEffect(() => { if (open) setScope('all'); }, [open]);

      // 把選中的 idx 排序好,filter cards 跟 originalIndices 用
      const selectedIdxArr = useMemo(
        () => hasSelection ? Array.from(selectedIds).sort((a, b) => a - b) : [],
        [selectedIds, hasSelection]
      );

      if (!open) return null;

      const { exportCards, originalIndices } = scope === 'selected' && hasSelection
        ? {
            exportCards: selectedIdxArr.map(i => cards[i]).filter(Boolean),
            originalIndices: selectedIdxArr,  // B1:傳原始 idx,檔名才能對齊原 setlist 編號
          }
        : { exportCards: cards, originalIndices: null };

      const empties = exportCards.filter(c => !c.title).length;
      const truncated = exportCards.filter(c => {
        const cleanTitle = (c.title || '').replace(/[((][^))]*[))]/g, '').trim();
        const isCJK = /[一-鿿]/.test(cleanTitle);
        return (isCJK && cleanTitle.length > 8) || (!isCJK && cleanTitle.length > 18);
      }).length;
      const dupes = exportCards.length - new Set(exportCards.map(c => `${c.label}_${c.title}`)).size;
      // B4:文字跟背景幾乎同色 → 字卡看不見
      const invisible = exportCards.filter(c => isCardInvisible(c, settings)).length;

      const checks = [
        { ok: !!fontsReady,         label: t('checklist.checkFonts'),     detail: fontsReady ? t('checklist.checkFontsOk') : t('checklist.checkFontsLoading') },
        { ok: empties === 0,        label: t('checklist.checkEmpty'),     detail: empties === 0 ? t('checklist.checkNone') : `${empties}` },
        { ok: dupes === 0,          label: t('checklist.checkDupes'),     detail: dupes === 0 ? '0' : `${dupes} ${t('checklist.checkDupesGroups')}` },
        { ok: truncated === 0,      label: t('checklist.checkTruncated'), detail: truncated === 0 ? t('checklist.checkNone') : `${truncated} ${t('checklist.checkTruncatedSuffix')}` },
        { ok: invisible === 0,      label: t('checklist.checkInvisible'), detail: invisible === 0 ? t('checklist.checkInvisibleOk') : `${invisible} ${t('checklist.checkInvisibleSuffix')}` },
      ];
      const allOk = checks.every(c => c.ok);
      const canExport = fontsReady && exportCards.length > 0;

      return (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-40" onClick={onClose} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
            <div className="bg-[#0c0c10] border border-slate-800/80 rounded-2xl w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/60">
                <h2 className="text-lg font-semibold">{t('checklist.title')}</h2>
                <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-800/50 flex items-center justify-center transition">
                  <Icon.close className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <div className="p-6 space-y-3">
                {/* 範圍選擇:全部 vs 只選中(只有 hasSelection 時才顯示)*/}
                {hasSelection && (
                  <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3 space-y-2">
                    <div className="text-[11px] uppercase tracking-widest text-slate-500">{t('checklist.scope')}</div>
                    <div role="radiogroup" aria-label={t('checklist.scope')} className="grid grid-cols-2 gap-2">
                      <button
                        role="radio"
                        aria-checked={scope === 'all'}
                        onClick={() => setScope('all')}
                        className={`py-2 px-3 rounded text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-[#00ff66]/60 ${
                          scope === 'all'
                            ? 'bg-[#00ff66] text-black'
                            : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
                        }`}
                      >{t('checklist.all')} ({cards.length})</button>
                      <button
                        role="radio"
                        aria-checked={scope === 'selected'}
                        onClick={() => setScope('selected')}
                        className={`py-2 px-3 rounded text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-[#00ff66]/60 ${
                          scope === 'selected'
                            ? 'bg-[#00ff66] text-black'
                            : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
                        }`}
                      >{t('checklist.selected')} ({selectedIds.size})</button>
                    </div>
                  </div>
                )}
                {checks.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 py-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center ${c.ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {c.ok ? <Icon.check className="w-4 h-4" /> : '⚠'}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm">{c.label}</div>
                      <div className="text-xs text-slate-500">{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 pb-6 pt-2">
                <button
                  onClick={() => onConfirm(exportCards, originalIndices)}
                  disabled={!canExport}
                  className={`w-full py-3.5 rounded-xl text-base font-bold transition ${
                    !canExport
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : allOk
                      ? 'bg-[#00ff66] hover:bg-[#33ff85] text-black shadow-lg shadow-[#00ff66]/40'
                      : 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/30'
                  }`}
                >
                  {!canExport ? (fontsReady ? t('checklist.btnEmpty') : t('checklist.btnLoading')) : allOk ? t('checklist.btnExport', { n: exportCards.length }) : t('checklist.btnExportWarn', { n: exportCards.length })}
                </button>
              </div>
            </div>
          </div>
        </>
      );
    }

    // ────────────────────────────────────────────────────────────────
    // Export Progress(canvas → png → zip)
    // ────────────────────────────────────────────────────────────────
    function ExportProgress({ state, onClose }) {
      const t = useT();
      if (!state) return null;
      const pct = state.total > 0 ? Math.round((state.current / state.total) * 100) : 0;
      const errors = (state.errors || []);
      const hasErrors = errors.length > 0;
      return (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-40" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
            <div className="bg-[#0c0c10] border border-slate-800/80 rounded-2xl w-full max-w-md shadow-2xl">
              <div className="px-6 py-5 border-b border-slate-800/60 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {state.complete
                    ? (hasErrors ? t('export.titleDoneErrors', { n: errors.length }) : t('export.titleDone'))
                    : t('export.titleRunning')}
                </h2>
                {state.complete && (
                  <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-800/50 flex items-center justify-center transition">
                    <Icon.close className="w-4 h-4 text-slate-400" />
                  </button>
                )}
              </div>
              <div className="p-6 space-y-4">
                <div className="text-sm text-slate-300">
                  {state.complete
                    ? t('export.bodyDone', { done: state.total - errors.length, total: state.total })
                    : t('export.bodyRunning', { current: state.current, total: state.total })}
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-200 ${hasErrors ? 'bg-amber-500' : 'bg-[#00ff66]'}`}
                    style={{ width: `${state.complete ? 100 : pct}%` }}
                  />
                </div>
                {state.currentFile && !state.complete && (
                  <div className="mono text-xs text-slate-500 truncate">{state.currentFile}</div>
                )}
                {state.complete && hasErrors && (
                  <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 max-h-48 overflow-auto">
                    <div className="text-amber-300 text-xs font-semibold mb-2">{t('export.errorsTitle')}</div>
                    <ul className="space-y-1 text-[11px] text-amber-200/90 mono">
                      {errors.map((e, i) => (
                        <li key={i}>#{e.idx} {e.name} — {e.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {state.complete && (
                  <button
                    onClick={onClose}
                    className={`w-full py-3 rounded-xl font-semibold transition shadow-lg ${
                      hasErrors
                        ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/30'
                        : 'bg-[#00ff66] hover:bg-[#33ff85] text-black shadow-[#00ff66]/30'
                    }`}
                  >
                    {hasErrors ? t('export.btnDoneErrors') : t('export.btnDone')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      );
    }

    // ────────────────────────────────────────────────────────────────
    // Update Toast
    // ────────────────────────────────────────────────────────────────
    // UpdateToast — 5 個狀態:
    //   'web'         → 沒 Electron(瀏覽器跑),點 Download 開新分頁(舊行為)
    //   'available'   → Electron 偵測到新版,正在 / 即將下載(autoDownload=true)
    //   'downloading' → 下載中,顯示進度條
    //   'downloaded'  → 已下載,顯示「立即安裝 / 稍後」
    //   'error'       → 更新失敗,顯示錯誤訊息
    function UpdateToast({ info, onDismiss, onInstallNow, onDownloadWeb }) {
      const t = useT();
      if (!info) return null;
      const state = info.state || 'web';
      const ver = info.version ? formatVersion(info.version) : '';
      const fmtSize = (bytes) => {
        if (!bytes) return '';
        const mb = bytes / 1024 / 1024;
        return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
      };
      return (
        <div className="fixed bottom-12 right-6 z-30 px-4 py-3 rounded-xl bg-[#0c0c10] border border-[#00ff66]/60 glow-pink-soft animate-in min-w-[280px] max-w-[360px]">
          {state === 'web' && (
            <div className="flex items-center gap-3">
              <div className="text-sm">{ver} {t('update.available')}</div>
              <button onClick={onDownloadWeb} className="text-[#33ff85] hover:text-[#99ffaa] text-sm font-medium">
                {t('update.btnDownload')}
              </button>
              <button onClick={onDismiss} className="text-slate-500 hover:text-white p-1 ml-auto" aria-label={t('update.btnDismiss')}>
                <Icon.close className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {state === 'available' && (
            <div className="flex items-center gap-3">
              <div className="text-sm flex-1">{ver} · {t('update.downloading')}…</div>
              <button onClick={onDismiss} className="text-slate-500 hover:text-white p-1" aria-label={t('update.btnDismiss')}>
                <Icon.close className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {state === 'downloading' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm">{ver} · {t('update.downloading')}</div>
                <div className="text-xs text-slate-400 mono">
                  {Math.round(info.percent || 0)}%
                  {info.transferred && info.total && (
                    <> · {fmtSize(info.transferred)} / {fmtSize(info.total)}</>
                  )}
                </div>
                <button onClick={onDismiss} className="text-slate-500 hover:text-white p-1" aria-label={t('update.btnDismiss')}>
                  <Icon.close className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-[#00ff66] transition-all duration-200"
                  style={{ width: `${Math.max(0, Math.min(100, info.percent || 0))}%` }}
                />
              </div>
            </div>
          )}
          {state === 'downloaded' && (
            <div className="flex items-center gap-3">
              <div className="text-sm flex-1">{ver} · {t('update.downloaded')}</div>
              <button
                onClick={onInstallNow}
                className="px-3 py-1.5 rounded bg-[#00ff66] hover:bg-[#33ff85] text-black text-xs font-bold transition"
              >
                {t('update.installNow')}
              </button>
              <button onClick={onDismiss} className="text-slate-500 hover:text-white p-1" aria-label={t('update.installLater')}>
                <Icon.close className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {state === 'error' && (
            <div className="flex items-center gap-3">
              <div className="text-xs text-amber-300 flex-1 break-words">
                {t('update.errorPrefix')}{info.message}
              </div>
              <button onClick={onDismiss} className="text-slate-500 hover:text-white p-1" aria-label={t('update.btnDismiss')}>
                <Icon.close className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      );
    }

    // ────────────────────────────────────────────────────────────────
    // Default Panel(沒選任何卡時顯示在右欄)
    // ────────────────────────────────────────────────────────────────
    function DefaultPanel({ settings, setSettings, cardsCount }) {
      const t = useT();
      const set = (k, v) => setSettings(s => ({ ...s, [k]: v }));
      return (
        <div className="h-full flex flex-col">
          <div className="px-5 py-4 border-b border-slate-800/60">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">{t('default.title')}</div>
            <div className="text-lg font-semibold mt-0.5">{t('default.subtitle')}</div>
          </div>
          <div className="flex-1 overflow-auto scrollbar-pretty p-5 space-y-5">
            <section>
              <label className="text-[11px] uppercase tracking-widest text-slate-500 mb-3 block">{t('settings.textColor')}</label>
              <div className="flex gap-2">
                {TEXT_COLORS.map(c => (
                  <button
                    key={c.hex}
                    onClick={() => set('textColor', c.hex)}
                    className={`w-11 h-11 rounded-full border-2 transition ${
                      settings.textColor.toLowerCase() === c.hex.toLowerCase()
                        ? 'border-[#00ff66] scale-110 glow-pink-soft'
                        : 'border-slate-700 hover:border-slate-500'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={t(c.nameKey)}
                  />
                ))}
              </div>
            </section>

            <Toggle label={t('settings.useTypeColors')}
              desc={t('settings.useTypeColorsDesc')}
              checked={settings.useTypeColors}
              onChange={v => set('useTypeColors', v)} />

            <Toggle label={t('settings.transparent')}
              desc={t('settings.transparentDesc')}
              checked={settings.transparent}
              onChange={v => set('transparent', v)} />

            <BgColorPicker settings={settings} setSettings={setSettings} showHint={false} />

            <section>
              <label className="text-[11px] uppercase tracking-widest text-slate-500 mb-2 block">{t('settings.split5')}</label>
              <div className="flex bg-slate-800/30 border border-slate-700/50 rounded-lg p-1">
                {['3/2', '2/3'].map(opt => (
                  <button key={opt} onClick={() => set('split5', opt)}
                    className={`flex-1 py-2 text-sm rounded transition ${
                      settings.split5 === opt
                        ? 'bg-[#00ff66] text-black font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}>{opt}</button>
                ))}
              </div>
            </section>

            <div className="pt-3 border-t border-slate-800/40 text-xs text-slate-500 leading-relaxed">
              <div className="font-semibold text-slate-400 mb-2">{t('default.tipTitle')}</div>
              <p className="mb-1.5">{t('default.tip1')}</p>
              <p className="mb-1.5"><kbd>Ctrl</kbd>/<kbd>⌘</kbd>{t('default.tip2')}</p>
              <p className="mb-1.5"><kbd>Shift</kbd>{t('default.tip3')}</p>
              <p className="mb-1.5"><kbd>Ctrl+A</kbd> {t('default.tip4Prefix')} ({cardsCount})</p>
              <p><kbd>Ctrl+Enter</kbd> → {t('footer.export')}</p>
            </div>
          </div>
        </div>
      );
    }

    // ────────────────────────────────────────────────────────────────
    // Main App
    // ────────────────────────────────────────────────────────────────
    const SAMPLE_TEXT = `INTRO - 'Cosmic Gate'
S01 皮卡丘
S02 小火龍
TALKING-1
轉場_VCR
S03 皮卡丘進化
Chaser~阿明
感謝名單`;

    function App({ locale, setLocale }) {
      const t = useT();
      // 從 localStorage 還原(只跑一次,當作 useState initializer)
      const initial = useMemo(() => loadPersistedState() || {}, []);

      const [text, setText] = useState(initial.text || '');
      const [selectedIds, setSelectedIds] = useState(new Set());
      const [lastClickedIdx, setLastClickedIdx] = useState(null);
      const [showSettings, setShowSettings] = useState(false);
      const [showParser, setShowParser] = useState(false);
      const [showChecklist, setShowChecklist] = useState(false);
      const [overrides, setOverrides] = useState(initial.overrides || {});
      const [savedAt, setSavedAt] = useState('');
      // 還原上次工作的提示 — 用 effect 在 mount 後 set,讓 t() 能拿到 locale
      useEffect(() => { if (initial.text) setSavedAt(t('footer.statusRestored')); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
      const [fontsReady, setFontsReady] = useState(false);
      const [exportState, setExportState] = useState(null);
      const [gridCols, setGridCols] = useState(initial.gridCols || 5);
      // Ctrl+滾輪 = 調整 grid 欄數(zoom);用 native listener 確保 preventDefault 生效
      // (React onWheel 在某些情況是 passive,preventDefault 會被 ignore,瀏覽器仍會 zoom 整頁)
      const gridScrollRef = useRef(null);
      useEffect(() => {
        const el = gridScrollRef.current;
        if (!el) return;
        const onWheel = (e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          setGridCols(c => {
            const next = e.deltaY > 0 ? c + 1 : c - 1;
            return Math.max(2, Math.min(16, next));
          });
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
      }, []);
      const [leftWidth, setLeftWidth] = useState(initial.leftWidth || 340);
      const [rightWidth, setRightWidth] = useState(initial.rightWidth || 380);
      // Quick template state
      const [tplSFrom, setTplSFrom] = useState(1);
      const [tplSTo,   setTplSTo]   = useState(20);
      const [tplTk,    setTplTk]    = useState(5);
      const [tplTr,    setTplTr]    = useState(3);
      const [tplCh,    setTplCh]    = useState(2);

      // ────── Undo / Redo history ──────
      // 存 text + overrides 的 snapshot,Ctrl+Z 還原
      const historyRef = useRef([]);  // Array<{ text, overrides }>
      const historyIdxRef = useRef(-1);
      const skipNextHistoryRef = useRef(false);

      // ────── Filter:依類型過濾卡片顯示 ──────
      const [filterTypes, setFilterTypes] = useState(new Set(['song', 'talking', 'transition', 'chaser', 'section']));

      // ────── Drag-to-reorder ──────
      const [dragIdx, setDragIdx] = useState(null);
      const [dropTargetIdx, setDropTargetIdx] = useState(null);  // {idx, position: 'before'|'after'}

      const [settings, setSettings] = useState(() => {
        // 從 initial.settings 過濾掉 geminiApiKey(B3:改用 safeStorage IPC 儲存,
        // 不再寫進 localStorage settings)
        const { geminiApiKey: _legacyKey, ...rest } = initial.settings || {};
        return {
          textColor: '#FFFFFF',
          useTypeColors: true,
          transparent: true,
          bgColor: '#000000',  // 全域預設背景色(transparent off 時生效,可被 card.bgOverride 覆蓋)
          split5: '3/2',
          ...rest,
        };
      });

      // Gemini API key — 用 OS keychain (Electron safeStorage) 加密存,不落 localStorage
      // web fallback:沒 electronAPI 時用 sessionStorage(僅當前分頁,關掉就清)
      const [geminiApiKey, setGeminiApiKeyState] = useState('');
      const [geminiKeyError, setGeminiKeyError] = useState('');

      // 把 legacy plaintext key 從 localStorage settings 移除(B3 安全:migration 後不該留)
      const purgeLegacyKey = useCallback(() => {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (parsed.settings && 'geminiApiKey' in parsed.settings) {
            const { geminiApiKey: _drop, ...rest } = parsed.settings;
            parsed.settings = rest;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
          }
        } catch {}
      }, []);

      useEffect(() => {
        let cancelled = false;
        (async () => {
          // 1. 從 safeStorage 讀(Electron)/ sessionStorage 讀(web fallback)
          let stored = '';
          if (window.electronAPI?.getGeminiKey) {
            try { stored = await window.electronAPI.getGeminiKey() || ''; } catch {}
          } else {
            stored = sessionStorage.getItem('gemini-key') || '';
          }
          // 2. Migration:若舊版 localStorage 還有 geminiApiKey,搬到 safeStorage 再清掉
          const legacyKey = (initial.settings && initial.settings.geminiApiKey) || '';
          if (legacyKey && !stored) {
            // 嘗試 migrate;失敗就保留 legacy 在 memory(下次 user 修改時再試)
            if (window.electronAPI?.setGeminiKey) {
              try {
                const r = await window.electronAPI.setGeminiKey(legacyKey);
                if (r && r.ok) {
                  stored = legacyKey;
                  purgeLegacyKey();  // migrate 成功才清 legacy
                } else {
                  console.warn('[migration] safeStorage 不可用,key 仍在 localStorage:', r && r.error);
                  stored = legacyKey;
                }
              } catch (err) {
                console.warn('[migration] failed:', err);
                stored = legacyKey;
              }
            } else {
              sessionStorage.setItem('gemini-key', legacyKey);
              stored = legacyKey;
              purgeLegacyKey();
            }
          } else if (legacyKey && stored) {
            // safeStorage 已有 key,localStorage legacy 一定要清掉
            purgeLegacyKey();
          }
          if (!cancelled) setGeminiApiKeyState(stored);
        })();
        return () => { cancelled = true; };
      }, [purgeLegacyKey]);

      const setGeminiApiKey = useCallback(async (key) => {
        const k = String(key || '').trim();
        setGeminiApiKeyState(k);
        setGeminiKeyError('');
        if (window.electronAPI?.setGeminiKey) {
          try {
            const r = await window.electronAPI.setGeminiKey(k);
            if (r && !r.ok) {
              // OS keychain 不可用(Linux 沒 secret service 等),別讓 user 以為 key 已存
              setGeminiKeyError(r.error || 'key 未儲存');
              console.warn('[setGeminiKey]', r.error);
            }
          } catch (err) {
            setGeminiKeyError(err.message || 'IPC 失敗');
            console.error('setGeminiKey:', err);
          }
        } else {
          if (k) sessionStorage.setItem('gemini-key', k);
          else sessionStorage.removeItem('gemini-key');
        }
      }, []);

      // App version 從 Electron IPC 讀(動態,跟 package.json 對齊),fallback 給 web 環境用
      // 用 versionLoaded 控制:沒拿到真版本前不要 fire update check(否則會拿 fallback 跟 GitHub
      // 比,造成「同版本一直跳新版 toast」的 race condition)
      const [appVersion, setAppVersion] = useState(APP_VERSION_FALLBACK);
      const [versionLoaded, setVersionLoaded] = useState(!window.electronAPI?.appVersion);
      useEffect(() => {
        if (!window.electronAPI?.appVersion) return;
        window.electronAPI.appVersion()
          .then(v => { if (v) setAppVersion(v); })
          .catch(() => {})
          .finally(() => setVersionLoaded(true));
      }, []);

      // Auto-update:Electron 用 main.js autoUpdater 的 IPC 事件(in-app 下載 + 進度條 + 一鍵安裝)
      // Web 用 GitHub API 檢查 + 點 Download 跳新分頁 fallback
      // updateInfo state shape:
      //   null
      //   { state: 'web',         version, url }
      //   { state: 'available',   version }
      //   { state: 'downloading', version, percent, transferred, total }
      //   { state: 'downloaded',  version }
      //   { state: 'error',       message }
      const [updateInfo, setUpdateInfo] = useState(null);
      // 全平台都走 Tier 2 — Mac 用 .zip + ad-hoc 簽名讓 Squirrel.Mac 允許 in-place replace
      // 若 Mac 撞 Gatekeeper,update-error event 會走 fallback「Download」按鈕引到 release 頁
      const isElectronUpdate = !!window.electronAPI?.onUpdateAvailable;

      // Electron mode:訂閱 main.js 的 autoUpdater IPC 事件
      useEffect(() => {
        if (!isElectronUpdate) return;
        const dismissed = () => localStorage.getItem(DISMISSED_VERSION_KEY) || '';
        const subs = [
          window.electronAPI.onUpdateAvailable(({ version }) => {
            if (version && version === dismissed()) return; // 用戶已 dismiss 過這版
            setUpdateInfo({ state: 'available', version });
          }),
          window.electronAPI.onDownloadProgress((p) => {
            setUpdateInfo(prev => prev && prev.state !== 'downloaded' && prev.state !== 'error'
              ? { ...prev, state: 'downloading', percent: p.percent, transferred: p.transferred, total: p.total }
              : prev);
          }),
          window.electronAPI.onUpdateDownloaded(({ version }) => {
            // 下載完成 — 即使 user 之前 dismiss 過,也要顯示「立即安裝」(東西已下載完,不顯示太可惜)
            setUpdateInfo({ state: 'downloaded', version });
          }),
          window.electronAPI.onUpdateError(({ message }) => {
            // 錯誤 toast 不要打擾(autoUpdater 在離線 / GitHub 鎖時會吵),只 console log
            console.warn('[update]', message);
          }),
        ];
        return () => subs.forEach(unsub => { try { unsub && unsub(); } catch {} });
      }, [isElectronUpdate]);

      // 真正執行 GitHub API 檢查的函式 — 給 SettingsModal 的「檢查更新」按鈕用
      // Electron mode 仍跑(用來給 status 顯示),但不會 setUpdateInfo(那是 IPC 事件的職責)
      const checkForUpdates = useCallback(async (opts = {}) => {
        const { ignoreDismissed = false } = opts;
        try {
          // 加 5 秒 timeout 避免離線環境 hang
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 5000);
          const r = await fetch(RELEASES_API, {
            headers: { 'Accept': 'application/vnd.github+json' },
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          if (!r.ok) return 'error';
          const release = await r.json();
          const latest = release && release.tag_name;
          if (!latest) return 'error';
          const cmp = compareVersion(latest, appVersion);
          if (cmp <= 0) {
            // 已是最新 — 清掉任何 stale toast(race fix:之前用 fallback 版本誤觸發的 toast)
            if (!isElectronUpdate) setUpdateInfo(null);
            return 'latest';
          }
          const dismissed = localStorage.getItem(DISMISSED_VERSION_KEY) || '';
          if (!ignoreDismissed && latest === dismissed) return 'latest'; // dismiss 過就當 latest
          // Web mode 才設 updateInfo;Electron mode 由 IPC 事件驅動 toast,GitHub API 只回 status text
          if (!isElectronUpdate) {
            setUpdateInfo({ state: 'web', version: latest, url: release.html_url });
          }
          return 'newer:' + formatVersion(latest);
        } catch {
          return 'error';
        }
      }, [appVersion, isElectronUpdate]);

      // 啟動時自動檢查 — 只在 web mode 跑(Electron mode 由 main.js autoUpdater 處理)
      // 必須等 versionLoaded 才跑,避免拿 fallback 版本誤判成「有新版」
      useEffect(() => {
        if (isElectronUpdate) return;
        if (!versionLoaded) return;
        let cancelled = false;
        (async () => {
          if (cancelled) return;
          checkForUpdates({ ignoreDismissed: false });
        })();
        return () => { cancelled = true; };
      }, [checkForUpdates, versionLoaded, isElectronUpdate]);

      const dismissUpdate = useCallback(() => {
        if (updateInfo && updateInfo.version) {
          localStorage.setItem(DISMISSED_VERSION_KEY, updateInfo.version);
        }
        setUpdateInfo(null);
      }, [updateInfo]);

      const downloadUpdateWeb = useCallback(() => {
        if (updateInfo && updateInfo.url) {
          window.open(updateInfo.url, '_blank');
        }
        // 點下載後拿掉 toast(但不寫進 dismissed,改主意可從 SettingsModal「檢查更新」再觸發)
        setUpdateInfo(null);
      }, [updateInfo]);

      const installUpdateNow = useCallback(async () => {
        if (!window.electronAPI?.installUpdateNow) return;
        try {
          await window.electronAPI.installUpdateNow();
          // 成功的話 app 會立刻退出重啟,後續 code 不會跑
        } catch (err) {
          console.error('[installUpdateNow]', err);
          setUpdateInfo({ state: 'error', message: String(err && err.message || err) });
        }
      }, []);

      // ────── Stable card IDs(UUID per card,跨 reorder 不會跑掉)──────
      // initial 從 localStorage 載;若舊版資料沒 cardIds,用 alignCardIds 從 text 推出來
      const [cardIds, setCardIds] = useState(() => {
        const saved = initial.cardIds;
        if (Array.isArray(saved) && saved.length > 0) return saved;
        // 啟動時根據 initial text 算出來
        // 沒 initial.text(全新安裝)→ 空陣列即可,user 第一次貼 setlist 會走 alignCardIds 補 UUID
        const parsed = parseSetlist(initial.text || '');
        return parsed.map(() => generateCardId());
      });

      // 統一的 text + cardIds 更新函式 — 所有改 text 的地方都走這條
      // 確保 cardIds 永遠跟 cards 對齊。模式:
      //   - 預設(textarea 編輯):用 alignCardIds 對內容比對,新增的卡給新 UUID
      //   - newIds:顯式提供新順序(reorder / delete / duplicate / replace 都用這個)
      const updateText = useCallback((newTextOrUpdater, opts = {}) => {
        const { newIds: explicitIds } = opts;
        setText(prev => {
          const newText = typeof newTextOrUpdater === 'function' ? newTextOrUpdater(prev) : newTextOrUpdater;
          if (explicitIds) {
            setCardIds(explicitIds);
          } else {
            // align — 對內容比對,新增的卡(內容沒對應到舊卡的)給新 UUID
            const prevCards = parseSetlist(prev);
            setCardIds(prevIds => alignCardIds(prevCards, prevIds, parseSetlist(newText)));
          }
          return newText;
        });
      }, []);

      // ────── Quick template helpers ──────
      const appendLines = (lines) => {
        const cleanedLines = lines.filter(Boolean);
        if (!cleanedLines.length) return;
        // append 場景:既有 cardIds 全留,新增 N 個新 UUID
        const newIds = cleanedLines.map(() => generateCardId());
        updateText(prev => {
          const trimmed = prev.split('\n').filter(l => l.trim()).join('\n');
          return (trimmed ? trimmed + '\n' : '') + cleanedLines.join('\n');
        }, { newIds: [...cardIds, ...newIds] });
      };
      const tplAddSongs = () => {
        let a = parseInt(tplSFrom, 10);
        let b = parseInt(tplSTo, 10);
        if (isNaN(a) || a < 1) a = 1;
        if (isNaN(b) || b < 1) b = 1;
        if (a > 99) a = 99;
        if (b > 99) b = 99;
        if (a > b) [a, b] = [b, a];
        if (b - a > 99) { alert(t('app.tplRangeTooBig')); return; }
        const lines = [];
        for (let n = a; n <= b; n++) lines.push(`S${String(n).padStart(2, '0')} `);
        appendLines(lines);
      };
      const tplAddTalking = () => {
        const n = parseInt(tplTk, 10) || 1;
        appendLines(Array.from({ length: n }, (_, i) => `TALKING-${i + 1}`));
      };
      const tplAddTransition = () => {
        const n = parseInt(tplTr, 10) || 1;
        appendLines(Array.from({ length: n }, (_, i) => `轉場_${String(i + 1).padStart(2, '0')}`));
      };
      const tplAddChaser = () => {
        const n = parseInt(tplCh, 10) || 1;
        appendLines(Array.from({ length: n }, () => `Chaser~`));
      };

      // ────── Column resize ──────
      const startColResize = (which) => (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = which === 'left' ? leftWidth : rightWidth;
        const dividerEl = e.currentTarget;
        dividerEl.classList.add('dragging');

        const onMove = (ev) => {
          const dx = ev.clientX - startX;
          if (which === 'left') {
            setLeftWidth(Math.max(240, Math.min(700, startW + dx)));
          } else {
            setRightWidth(Math.max(280, Math.min(700, startW - dx)));
          }
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          dividerEl.classList.remove('dragging');
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      };

      // Auto-save (debounced 400ms)
      useEffect(() => {
        const tid = setTimeout(() => {
          const ok = savePersistedState({ text, overrides, cardIds, settings, gridCols, leftWidth, rightWidth });
          if (ok) setSavedAt(new Date().toLocaleTimeString(locale, { hour12: false }));
        }, 400);
        return () => clearTimeout(tid);
      }, [text, overrides, settings, gridCols, leftWidth, rightWidth, locale]);

      // History snapshot (debounced 600ms,只在 text 或 overrides 改變時 push)
      useEffect(() => {
        if (skipNextHistoryRef.current) {
          // undo/redo 觸發的更新,不要 push 新 history
          skipNextHistoryRef.current = false;
          return;
        }
        const tid = setTimeout(() => {
          const last = historyRef.current[historyIdxRef.current];
          if (last && last.text === text
              && JSON.stringify(last.overrides) === JSON.stringify(overrides)
              && JSON.stringify(last.cardIds) === JSON.stringify(cardIds)) {
            return; // 無實質改動,不 push
          }
          // 砍掉 idx 之後的 redo 歷史
          historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1);
          historyRef.current.push({ text, overrides: { ...overrides }, cardIds: [...cardIds] });
          if (historyRef.current.length > 50) historyRef.current.shift();
          historyIdxRef.current = historyRef.current.length - 1;
        }, 600);
        return () => clearTimeout(tid);
      }, [text, overrides, cardIds]);

      const undo = () => {
        if (historyIdxRef.current <= 0) return;
        historyIdxRef.current -= 1;
        const snap = historyRef.current[historyIdxRef.current];
        skipNextHistoryRef.current = true;
        // 還原時 cardIds 也跟著還原(老 snapshot 沒 cardIds 就用 align fallback)
        if (snap.cardIds) {
          setCardIds(snap.cardIds);
          setOverrides(snap.overrides || {});
        } else {
          // backwards compat:舊 snapshot 沒 cardIds → align 從 text 推
          const prevCards = parseSetlist(text);
          setCardIds(prevIds => alignCardIds(prevCards, prevIds, parseSetlist(snap.text)));
          setOverrides(snap.overrides || {});
        }
        setText(snap.text);
        setSavedAt(t('footer.statusUndone'));
      };
      const redo = () => {
        if (historyIdxRef.current >= historyRef.current.length - 1) return;
        historyIdxRef.current += 1;
        const snap = historyRef.current[historyIdxRef.current];
        skipNextHistoryRef.current = true;
        if (snap.cardIds) {
          setCardIds(snap.cardIds);
          setOverrides(snap.overrides || {});
        } else {
          const prevCards = parseSetlist(text);
          setCardIds(prevIds => alignCardIds(prevCards, prevIds, parseSetlist(snap.text)));
          setOverrides(snap.overrides || {});
        }
        setText(snap.text);
        setSavedAt(t('footer.statusRedone'));
      };

      const toggleFilterType = (t) => {
        setFilterTypes(prev => {
          const next = new Set(prev);
          if (next.has(t)) next.delete(t); else next.add(t);
          return next;
        });
      };

      // ────── Reorder helpers(操作 textarea source of truth)──────
      // 把 cards 的 idx N 移到位置 M 之前 / 之後 → 同步重排 textarea 的非空行
      const moveCard = (fromIdx, toIdx, position /* 'before' | 'after' */) => {
        const lines = text.split('\n');
        const realIdxes = []; // 對應到 cards 的非空非 divider 行的 textarea 行號
        lines.forEach((l, i) => {
          if (l.trim() && !/^-+$/.test(l.trim())) realIdxes.push(i);
        });
        if (fromIdx >= realIdxes.length || toIdx >= realIdxes.length) return;
        if (fromIdx === toIdx) return;
        const fromLineIdx = realIdxes[fromIdx];
        const fromLine = lines[fromLineIdx];
        // 暫時抽出
        const newLines = [...lines];
        newLines.splice(fromLineIdx, 1);
        // 重算 toLineIdx(因為我們抽出後行號可能變)
        let targetLineIdx;
        if (toIdx < fromIdx) {
          // 往前移 — toLineIdx 在 fromLineIdx 之前,沒受 splice 影響
          targetLineIdx = realIdxes[toIdx];
        } else {
          // 往後移 — toLineIdx 在 fromLineIdx 之後,要 -1 補償
          targetLineIdx = realIdxes[toIdx] - 1;
        }
        if (position === 'after') targetLineIdx += 1;
        newLines.splice(targetLineIdx, 0, fromLine);
        const newText = newLines.join('\n');
        // 顯式 reorder cardIds — 卡片 ID 跟著卡走,override 100% 對齊(包含重複內容卡)
        const newIds = [...cardIds];
        const [movedId] = newIds.splice(fromIdx, 1);
        // 重算 toIdx 在 splice 後的位置
        let targetIdsIdx = toIdx < fromIdx ? toIdx : toIdx - 1;
        if (position === 'after') targetIdsIdx += 1;
        newIds.splice(targetIdsIdx, 0, movedId);
        updateText(newText, { newIds });
        // 若移到的卡片類型被 filter 過濾掉,目標卡會看不見 → 清 selection 比較不困惑
        const movedCard = cards[fromIdx];
        if (movedCard && !filterTypes.has(movedCard.type)) {
          setSelectedIds(new Set());
        } else {
          setSelectedIds(new Set([toIdx]));
        }
      };

      const onCardDragStart = (idx) => {
        setDragIdx(idx);
        setDropTargetIdx(null);
      };
      const onCardDragOver = (idx, e) => {
        if (dragIdx === null || dragIdx === idx) return;
        // 偵測滑鼠在卡片左半 vs 右半
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const position = x < rect.width / 2 ? 'before' : 'after';
        setDropTargetIdx({ idx, position });
      };
      const onCardDrop = (idx, e) => {
        if (dragIdx === null || dragIdx === idx) {
          setDragIdx(null);
          setDropTargetIdx(null);
          return;
        }
        const target = dropTargetIdx || { idx, position: 'before' };
        moveCard(dragIdx, target.idx, target.position);
        setDragIdx(null);
        setDropTargetIdx(null);
      };
      const onCardDragEnd = () => {
        setDragIdx(null);
        setDropTargetIdx(null);
      };

      // Font preload — Canvas 匯出前必須等 web font 載入
      useEffect(() => {
        if (!document.fonts) { setFontsReady(true); return; }
        Promise.all([
          document.fonts.load('900 100px Inter'),
          document.fonts.load('900 100px "Noto Sans TC"'),
          document.fonts.load('900 60px "Noto Sans TC"'),
          document.fonts.load('900 100px "Noto Sans SC"'),
          document.fonts.load('900 60px "Noto Sans SC"'),
          document.fonts.load('500 14px "JetBrains Mono"'),
        ]).then(() => setFontsReady(true)).catch(err => {
          // 字型載入失敗(網路問題、CDN 掛了)— 仍 setFontsReady(true) 讓使用者能匯出,
          // 但 console.warn 留紀錄,匯出的 PNG 字型可能 fallback 到系統字型,跟預覽不一樣
          console.warn('[arena-cardgen] 字型預載失敗,匯出可能 fallback 系統字型:', err);
          setFontsReady(true);
        });
      }, []);

      const cards = useMemo(() => {
        const parsed = parseSetlist(text);
        // _id 用 cardIds 對齊;mismatch(剛 setText 但 cardIds 還沒同步的瞬間)用 fallback,
        // 不會 crash,下一個 render 就對齊
        return parsed.map((c, i) => {
          const id = cardIds[i] || `__pending-${i}`;
          return { ...c, ...(overrides[id] || {}), _id: id, _key: id };
        });
      }, [text, overrides, cardIds]);

      const handleCardClick = (i, e) => {
        if (e) e.stopPropagation(); // 不讓 click 冒泡到 grid 容器,否則會立刻又 clearSelection
        const isMod = e && (e.ctrlKey || e.metaKey);
        const isShift = e && e.shiftKey;
        setSelectedIds(prev => {
          const next = new Set(prev);
          if (isShift && lastClickedIdx !== null) {
            // 範圍選取
            const [a, b] = [Math.min(lastClickedIdx, i), Math.max(lastClickedIdx, i)];
            for (let k = a; k <= b; k++) next.add(k);
          } else if (isMod) {
            // toggle
            if (next.has(i)) next.delete(i); else next.add(i);
          } else {
            // 單選
            return new Set([i]);
          }
          return next;
        });
        setLastClickedIdx(i);
      };
      const clearSelection = () => setSelectedIds(new Set());
      const selectAll = () => setSelectedIds(new Set(cards.map((_, i) => i)));

      const updateCard = (i, partial) => {
        const c = cards[i];
        if (!c || !c._id) return;
        const { _key, _id, ...rest } = partial;
        setOverrides(o => ({ ...o, [c._id]: { ...(o[c._id] || {}), ...rest } }));
      };
      const updateMultipleCards = (ids, partial) => {
        const { _key, _id, ...rest } = partial;
        setOverrides(o => {
          const next = { ...o };
          ids.forEach(i => {
            const c = cards[i];
            if (!c || !c._id) return;
            next[c._id] = { ...(next[c._id] || {}), ...rest };
          });
          return next;
        });
      };
      const deleteCard = (i) => {
        // 用行號而非內容匹配 — 重複內容的 setlist(例如兩個 Chaser~)才不會誤刪第一個
        const lines = text.split('\n');
        const realIdxToLine = [];
        lines.forEach((l, idx) => { if (l.trim() && !/^-+$/.test(l.trim())) realIdxToLine.push(idx); });
        if (i >= realIdxToLine.length) return;
        const newLines = lines.filter((_, idx) => idx !== realIdxToLine[i]);
        const newText = newLines.join('\n');
        // 顯式從 cardIds 移除被刪那張的 ID — 其餘卡的 ID 完全不動,override 跟著卡
        const newIds = cardIds.filter((_, idx) => idx !== i);
        updateText(newText, { newIds });
        setSelectedIds(new Set());
      };
      const duplicateCard = (i) => {
        const lines = text.split('\n');
        const realIdxToLine = [];
        lines.forEach((l, idx) => { if (l.trim() && !/^-+$/.test(l.trim())) realIdxToLine.push(idx); });
        if (i < realIdxToLine.length) {
          const lineIdx = realIdxToLine[i];
          const newLines = [...lines];
          newLines.splice(lineIdx + 1, 0, lines[lineIdx]);
          const newText = newLines.join('\n');
          // 複製出的新卡給新 UUID,原本那張保留原 ID 跟 override
          const newIds = [...cardIds];
          newIds.splice(i + 1, 0, generateCardId());
          updateText(newText, { newIds });
        }
      };

      // keyboard shortcuts
      useEffect(() => {
        const onKey = (e) => {
          // 匯出中(尚未 complete)忽略所有 shortcut — 否則按 Ctrl+Z 會改 text,
          // 跟 snapshot 進去匯出的內容對不起來,VJ 會誤以為「我以為我存的是 undo 前那份」
          if (exportState && !exportState.complete) return;

          // 不要攔截 input / textarea 內的按鍵
          const tag = (e.target && e.target.tagName) || '';
          const inEditor = tag === 'INPUT' || tag === 'TEXTAREA';

          if (e.key === 'Escape' && !inEditor) {
            setSelectedIds(new Set());
            setShowSettings(false);
            setShowParser(false);
            setShowChecklist(false);
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            if (cards.length) setShowChecklist(true);
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !inEditor) {
            e.preventDefault();
            selectAll();
          }
          // Undo / Redo — textarea 內的 Ctrl+Z 由瀏覽器處理(只 undo 該欄位文字),app-level undo 只在外面工作
          if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey && !inEditor) {
            e.preventDefault();
            undo();
          }
          if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' || e.key === 'Z') && e.shiftKey || e.key === 'y') && !inEditor) {
            e.preventDefault();
            redo();
          }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [cards.length, exportState]);

      const selectedIdxArr = useMemo(() => Array.from(selectedIds).sort((a, b) => a - b), [selectedIds]);
      const singleSelected = selectedIdxArr.length === 1 ? selectedIdxArr[0] : null;
      const selectedCard = singleSelected !== null && singleSelected < cards.length ? cards[singleSelected] : null;

      return (
        <div className="h-screen flex flex-col">
          {/* Top Bar */}
          <header className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/40 bg-[#08080a]">
            <div className="flex items-center gap-3">
              <Icon.logo className="w-9 h-9" />
              <h1 className="text-[19px] font-bold tracking-tight">{t('app.title')}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowParser(true)}
                className="px-3.5 py-2 rounded-lg bg-slate-900/50 hover:bg-slate-800/70 border border-slate-800/60 text-[13px] flex items-center gap-2 transition"
              >
                <Icon.file className="w-3.5 h-3.5" /> {t('header.parser')}
              </button>
              <LangPicker locale={locale} onChange={setLocale} />
              <button
                onClick={() => setShowSettings(true)}
                className="px-3.5 py-2 rounded-lg bg-slate-900/50 hover:bg-slate-800/70 border border-slate-800/60 text-[13px] flex items-center gap-2 transition"
              >
                <Icon.settings className="w-3.5 h-3.5" /> {t('header.settings')}
              </button>
              <button
                disabled={cards.length === 0}
                onClick={() => setShowChecklist(true)}
                className={`px-4 py-2 rounded-lg text-[13px] font-semibold flex items-center gap-2 transition ${
                  cards.length > 0
                    ? 'bg-[#00ff66] hover:bg-[#33ff85] text-black shadow-lg shadow-[#00ff66]/30'
                    : 'bg-[#00ff66]/20 text-[#66ff99]/40 cursor-not-allowed'
                }`}
              >
                <Icon.upload className="w-3.5 h-3.5" /> {t('header.export')}
              </button>
            </div>
          </header>

          {/* Main flex 三欄,中間 dividers 可拖曳 */}
          <main className="flex-1 flex gap-0 p-3 overflow-hidden">
            {/* Setlist input */}
            <div className="flex flex-col bg-[#0a0a0c] rounded-xl border border-slate-800/40 overflow-hidden relative" style={{ width: `${leftWidth}px`, flexShrink: 0 }}>
              <div className="px-4 py-2.5 border-b border-slate-800/40 text-[10px] font-bold tracking-[0.18em] text-slate-500 uppercase flex items-center justify-between">
                <span>{t('input.label')}</span>
                {!text && (
                  <button
                    onClick={() => {
                      const sampleParsed = parseSetlist(SAMPLE_TEXT);
                      updateText(SAMPLE_TEXT, { newIds: sampleParsed.map(() => generateCardId()) });
                    }}
                    className="text-[#33ff85] hover:text-[#99ffaa] normal-case tracking-normal text-xs font-normal"
                  >
                    {t('input.tplSample')} →
                  </button>
                )}
              </div>

              {/* Quick template panel */}
              <div className="border-b border-slate-800/40 px-3 py-2.5 bg-slate-900/40">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 font-bold">{t('input.tplTitle')}</div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#33ff85] font-bold text-xs w-12">{t('input.tplSong')}</span>
                    <span className="text-slate-500 text-xs">S</span>
                    <input type="number" min="1" max="99" value={tplSFrom} onChange={e => setTplSFrom(parseInt(e.target.value) || 1)}
                      className="w-12 px-1.5 py-1 mono text-xs text-center bg-slate-800/60 border border-slate-700 rounded focus:border-[#00ff66] focus:outline-none" />
                    <span className="text-slate-500 text-xs">–</span>
                    <input type="number" min="1" max="99" value={tplSTo} onChange={e => setTplSTo(parseInt(e.target.value) || 1)}
                      className="w-12 px-1.5 py-1 mono text-xs text-center bg-slate-800/60 border border-slate-700 rounded focus:border-[#00ff66] focus:outline-none" />
                    <button onClick={tplAddSongs}
                      className="ml-auto px-2.5 py-1 text-xs font-bold bg-[#00ff66] hover:bg-[#33ff85] text-black rounded transition">{t('input.tplAdd')}</button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs w-12" style={{ color: '#ffeb3b' }}>{t('input.tplTalking')}</span>
                    <span className="text-slate-500 text-xs">{t('input.tplCount')}</span>
                    <input type="number" min="1" max="50" value={tplTk} onChange={e => setTplTk(parseInt(e.target.value) || 1)}
                      className="w-12 px-1.5 py-1 mono text-xs text-center bg-slate-800/60 border border-slate-700 rounded focus:border-[#00ff66] focus:outline-none" />
                    <button onClick={tplAddTalking}
                      className="ml-auto px-2.5 py-1 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-100 rounded transition">{t('input.tplAdd')}</button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs w-12" style={{ color: '#ff80ab' }}>{t('input.tplTransition')}</span>
                    <span className="text-slate-500 text-xs">{t('input.tplCount')}</span>
                    <input type="number" min="1" max="50" value={tplTr} onChange={e => setTplTr(parseInt(e.target.value) || 1)}
                      className="w-12 px-1.5 py-1 mono text-xs text-center bg-slate-800/60 border border-slate-700 rounded focus:border-[#00ff66] focus:outline-none" />
                    <button onClick={tplAddTransition}
                      className="ml-auto px-2.5 py-1 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-100 rounded transition">{t('input.tplAdd')}</button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs w-12" style={{ color: '#ff5252' }}>{t('input.tplChaser')}</span>
                    <span className="text-slate-500 text-xs">{t('input.tplCount')}</span>
                    <input type="number" min="1" max="50" value={tplCh} onChange={e => setTplCh(parseInt(e.target.value) || 1)}
                      className="w-12 px-1.5 py-1 mono text-xs text-center bg-slate-800/60 border border-slate-700 rounded focus:border-[#00ff66] focus:outline-none" />
                    <button onClick={tplAddChaser}
                      className="ml-auto px-2.5 py-1 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-100 rounded transition">{t('input.tplAdd')}</button>
                  </div>
                </div>
              </div>

              <div className="flex-1 relative overflow-hidden editor-wrap">
                <div className="lineno">
                  {Array.from({ length: Math.max(text.split('\n').length, 1) }, (_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <textarea
                  value={text}
                  onChange={e => updateText(e.target.value)}
                  placeholder={t('input.placeholder')}
                  wrap="off"
                  className="w-full h-full editor-area mono text-[13px] text-slate-200 placeholder-slate-600 bg-transparent resize-none focus:outline-none scrollbar-pretty"
                  spellCheck="false"
                />
              </div>
            </div>

            {/* Divider:左 ⇄ 中 */}
            <div className="col-divider" onMouseDown={startColResize('left')} title={t('app.dragLeft')} />

            {/* Card grid */}
            <div className="flex flex-col bg-[#0a0a0c] rounded-xl border border-slate-800/40 overflow-hidden flex-1 min-w-0">
              <div className="px-4 py-2.5 border-b border-slate-800/40 flex items-center justify-between gap-3 text-[10px] font-bold tracking-[0.18em] text-slate-500 uppercase">
                <span>{t('grid.title')}</span>
                <div className="flex items-center gap-3 flex-1 justify-end">
                  {selectedIds.size > 0 ? (
                    <div className="flex items-center gap-2 normal-case tracking-normal">
                      <span className="text-[#33ff85] font-semibold">{t('grid.selected')} {selectedIds.size}</span>
                      <button onClick={selectAll} className="text-slate-400 hover:text-white px-2">{t('grid.selectAll')}</button>
                      <button onClick={clearSelection} className="text-slate-400 hover:text-white px-2">{t('grid.deselect')}</button>
                    </div>
                  ) : cards.length > 0 && (
                    <span className="text-slate-600 normal-case tracking-normal hidden xl:inline">
                      {t('grid.click')} · <kbd>Ctrl</kbd>+{t('grid.click')} · <kbd>Shift</kbd>+{t('grid.click')}
                    </span>
                  )}
                  {/* Zoom slider:2~16 cols */}
                  <div className="flex items-center gap-2 normal-case tracking-normal">
                    <button
                      onClick={() => setGridCols(c => Math.max(2, c - 1))}
                      className="w-6 h-6 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white text-base flex items-center justify-center"
                      title={t('app.zoomIn')}
                    >−</button>
                    <input
                      type="range"
                      min="2"
                      max="16"
                      value={gridCols}
                      onChange={e => setGridCols(parseInt(e.target.value))}
                      className="w-24 accent-[#00ff66]"
                      title={`${gridCols} × N grid`}
                    />
                    <button
                      onClick={() => setGridCols(c => Math.min(16, c + 1))}
                      className="w-6 h-6 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white text-base flex items-center justify-center"
                      title={t('app.zoomOut')}
                    >+</button>
                    <span className="text-[#33ff85] font-mono w-8 text-right">{gridCols}×</span>
                  </div>
                </div>
              </div>
              {/* Filter chips:依類型過濾顯示 */}
              {cards.length > 0 && (
                <div className="px-4 py-2 border-b border-slate-800/40 flex items-center gap-2 text-xs">
                  <span className="text-slate-500 mr-1">{t('grid.filter')}</span>
                  {[
                    { key: 'song', tkey: 'type.song', color: '#FFFFFF' },
                    { key: 'talking', tkey: 'type.talking', color: '#FFEB3B' },
                    { key: 'transition', tkey: 'type.transition', color: '#33FF85' },
                    { key: 'chaser', tkey: 'type.chaser', color: '#FF5252' },
                  ].map(ft => {
                    const active = filterTypes.has(ft.key);
                    const count = cards.filter(c => c.type === ft.key).length;
                    if (count === 0) return null;
                    return (
                      <button
                        key={ft.key}
                        onClick={() => toggleFilterType(ft.key)}
                        className={`px-2.5 py-1 rounded-md border transition ${
                          active
                            ? 'bg-slate-800 border-slate-600 text-slate-100'
                            : 'bg-transparent border-slate-800 text-slate-600 line-through'
                        }`}
                        style={active ? { borderColor: ft.color + '60' } : undefined}
                      >
                        <span style={{ color: active ? ft.color : undefined }}>{t(ft.tkey)}</span>
                        <span className="ml-1 text-slate-500">({count})</span>
                      </button>
                    );
                  })}
                  {filterTypes.size < 4 && (
                    <button
                      onClick={() => setFilterTypes(new Set(['song', 'talking', 'transition', 'chaser', 'section']))}
                      className="ml-auto text-slate-400 hover:text-white"
                    >{t('grid.showAll')}</button>
                  )}
                </div>
              )}
              <div
                ref={gridScrollRef}
                className="flex-1 overflow-auto scrollbar-pretty p-4"
                onClick={(e) => {
                  // 點空白(非卡片)= 清掉選取,回 DefaultPanel
                  // Card 內部 onClick 已 stopPropagation,不會誤觸
                  if (selectedIds.size > 0) clearSelection();
                }}
              >
                {cards.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-5">
                    <Icon.stack className="w-16 h-16 opacity-25" />
                    <p className="text-sm text-center max-w-xs">{t('grid.empty')}</p>
                  </div>
                ) : (
                  <div
                    className="grid gap-2"
                    style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
                  >
                    {cards.map((card, i) => {
                      if (!filterTypes.has(card.type)) return null;
                      const dropPos = dropTargetIdx && dropTargetIdx.idx === i ? dropTargetIdx.position : null;
                      const isDragging = dragIdx === i;
                      return (
                        <div key={card._key || `${i}-${card.title}`} style={{ opacity: isDragging ? 0.4 : 1 }}>
                          <Card
                            card={card}
                            idx={i}
                            isSelected={selectedIds.has(i)}
                            onClick={(e) => handleCardClick(i, e)}
                            transparent={settings.transparent}
                            bgColor={settings.bgColor}
                            useTypeColors={settings.useTypeColors && !card.colorOverride}
                            customColor={card.colorOverride || settings.textColor}
                            onDragStart={onCardDragStart}
                            onDragOver={onCardDragOver}
                            onDrop={onCardDrop}
                            onDragEnd={onCardDragEnd}
                            dropPosition={dropPos}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Divider:中 ⇄ 右 */}
            <div className="col-divider" onMouseDown={startColResize('right')} title={t('app.dragRight')} />

            {/* 右欄常駐 — 內容依選取狀態切換 */}
            <div className="flex flex-col bg-[#0a0a0c] rounded-xl border border-slate-800/40 overflow-hidden" style={{ width: `${rightWidth}px`, flexShrink: 0 }}>
              {selectedIds.size >= 2 ? (
                <BulkEditPanel
                  ids={selectedIdxArr}
                  cards={cards}
                  settings={settings}
                  onApply={updateMultipleCards}
                  onClear={clearSelection}
                />
              ) : selectedIds.size === 1 && selectedCard ? (
                <CardEditPanel
                  card={selectedCard}
                  idx={singleSelected}
                  settings={settings}
                  onUpdate={updateCard}
                  onDelete={deleteCard}
                  onDuplicate={duplicateCard}
                />
              ) : (
                <DefaultPanel settings={settings} setSettings={setSettings} cardsCount={cards.length} />
              )}
            </div>
          </main>

          {/* Status bar */}
          <footer className="px-5 py-2 border-t border-slate-800/40 bg-[#08080a] flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              {cards.length > 0 && <Icon.check className="w-3 h-3 text-emerald-400" />}
              <span>{cards.length} {t('footer.cards')}</span>
              {selectedIds.size > 0 && (
                <span className="text-[#33ff85] ml-3">
                  · {selectedIds.size === 1 ? `${t('footer.editing')}: #${singleSelected + 1}` : `${t('footer.multiSelect')} ${selectedIds.size}`}
                </span>
              )}
              {savedAt && (
                <span className="text-emerald-500/80 ml-3">
                  · {t('footer.savedAt')} {savedAt}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <kbd>Ctrl+Enter</kbd> <span>{t('footer.export')}</span>
              <span className="text-slate-700">|</span>
              <kbd>Ctrl+Z</kbd> <span>{t('footer.undo')}</span>
              <span className="text-slate-700">|</span>
              <kbd>Ctrl+A</kbd> <span>{t('footer.selectAll')}</span>
              <span className="text-slate-700">|</span>
              <span>{t('footer.fonts')}: <span className={fontsReady ? 'text-emerald-500' : 'text-amber-400'}>{fontsReady ? t('footer.fontsReady') : t('footer.fontsLoading')}</span></span>
              <span className="text-slate-700">|</span>
              <span>{formatVersion(appVersion)}</span>
            </div>
          </footer>

          {/* Modals only(CardEdit / BulkEdit / Default 都已 inline 在右欄) */}
          <SettingsModal
            open={showSettings}
            onClose={() => setShowSettings(false)}
            settings={settings}
            setSettings={setSettings}
            appVersion={appVersion}
            onCheckUpdate={() => checkForUpdates({ ignoreDismissed: true })}
          />
          <ParserModal
            open={showParser}
            onClose={() => setShowParser(false)}
            onImport={(t) => {
              // 從 ParserModal import 的是全新的 setlist,給每張卡新 UUID
              const importedParsed = parseSetlist(t);
              updateText(t, { newIds: importedParsed.map(() => generateCardId()) });
            }}
            geminiApiKey={geminiApiKey}
            setGeminiApiKey={setGeminiApiKey}
            geminiKeyError={geminiKeyError}
          />
          <ExportChecklist
            open={showChecklist}
            cards={cards}
            selectedIds={selectedIds}
            settings={settings}
            fontsReady={fontsReady}
            onClose={() => setShowChecklist(false)}
            onConfirm={async (exportCards, originalIndices) => {
              setShowChecklist(false);
              const list = exportCards || cards;
              setExportState({ current: 0, total: list.length, currentFile: '', complete: false, errors: [] });
              try {
                const fileEntries = await exportAllToZip(list, settings, (current, total, currentFile) => {
                  setExportState(s => ({ ...(s || {}), current, total, currentFile, complete: false }));
                }, originalIndices);
                // 標記哪些卡渲染失敗(B-1:不能 silent dropped,VJ 在演唱會少 1 張字卡 = LIVE 災難)
                const errors = (fileEntries || []).filter(e => e.error);
                setExportState(s => ({ ...s, complete: true, errors }));
              } catch (err) {
                console.error(err);
                alert(t('app.exportFailed', { err: err.message }));
                setExportState(null);
              }
            }}
          />
          <ExportProgress
            state={exportState}
            onClose={() => setExportState(null)}
          />
          <UpdateToast
            info={updateInfo}
            onDismiss={dismissUpdate}
            onDownloadWeb={downloadUpdateWeb}
            onInstallNow={installUpdateNow}
          />
        </div>
      );
    }

    // Error boundary — 出錯時顯示訊息而不是黑畫面
    // CrashScreen 是 functional,可用 useT();ErrorBoundary 是 class(catch error 必要),
    // 因此把 ErrorBoundary 放在 LocaleContext.Provider 內,CrashScreen 才能讀 locale
    function CrashScreen({ error, onRetry }) {
      const t = useT();
      return (
        <div className="h-screen flex items-center justify-center p-8">
          <div className="max-w-2xl bg-red-950/40 border border-red-500/40 rounded-xl p-6">
            <h2 className="text-red-300 font-bold text-lg mb-2">⚠ {t('common.appCrashed')}</h2>
            <pre className="text-xs text-red-200 mono whitespace-pre-wrap mb-4">{String(error)}{'\n'}{error?.stack || ''}</pre>
            <div className="flex gap-3">
              <button onClick={onRetry} className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold">{t('common.btnRetry')}</button>
              <button onClick={() => { localStorage.removeItem(STORAGE_KEY); location.reload(); }} className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm">{t('common.btnClearReload')}</button>
            </div>
          </div>
        </div>
      );
    }

    class ErrorBoundary extends React.Component {
      constructor(p) { super(p); this.state = { error: null }; }
      static getDerivedStateFromError(error) { return { error }; }
      componentDidCatch(error, info) { console.error('App error:', error, info); }
      render() {
        if (this.state.error) {
          return <CrashScreen error={this.state.error} onRetry={() => this.setState({ error: null })} />;
        }
        return this.props.children;
      }
    }

    function Root() {
      const [locale, setLocaleState] = useState(getInitialLocale);
      const setLocale = useCallback((l) => { setLocaleState(l); persistLocale(l); }, []);
      return (
        <LocaleContext.Provider value={locale}>
          <ErrorBoundary>
            <App locale={locale} setLocale={setLocale} />
          </ErrorBoundary>
        </LocaleContext.Provider>
      );
    }

    createRoot(document.getElementById('root')).render(<Root />);