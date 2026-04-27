// Copy pdfjs-dist worker file 到 web/dist/(esbuild bundle 不會自動處理 worker)
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const dstDir = path.join(__dirname, '..', 'web', 'dist');
const dst = path.join(dstDir, 'pdf.worker.min.mjs');

if (!fs.existsSync(src)) {
  console.error('[copy-pdf-worker] source not found:', src);
  process.exit(1);
}

fs.mkdirSync(dstDir, { recursive: true });
fs.copyFileSync(src, dst);
const size = (fs.statSync(dst).size / 1024).toFixed(1);
console.log(`[copy-pdf-worker] ${dst} (${size} KB)`);
