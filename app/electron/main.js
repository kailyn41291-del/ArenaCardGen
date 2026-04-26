const { app, BrowserWindow, ipcMain, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#050505',
    title: 'Arena Card Generator',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox: false 因為 preload 需要 require('fs') 寫檔。將來若改用 sidecar IPC 可改回 true
      sandbox: false,
    },
    icon: getIconPath(),
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'web', 'index.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // 攔截外部連結到系統瀏覽器
  // 只允許 http/https。file:// 等 scheme 一律拒絕,避免任意本機路徑/exe 觸發
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

function getIconPath() {
  // 開發時找 ../assets/logo.png,packaged 時找 resources/assets/logo.png
  const devPath = path.join(__dirname, '..', '..', 'assets', 'logo.png');
  const prodPath = path.join(process.resourcesPath || '', 'assets', 'logo.png');
  if (fs.existsSync(devPath)) return devPath;
  if (fs.existsSync(prodPath)) return prodPath;
  return undefined;
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ────────────────────────────────────────────────────────────────
// IPC handlers
// 註:select-export-folder / write-png / open-folder / app-platform 都拿掉了
// (renderer 沒呼叫,匯出走瀏覽器 ZIP 下載)。將來改原生 folder export 時再加回。
// ────────────────────────────────────────────────────────────────

ipcMain.handle('app-version', () => app.getVersion());

// ────────────────────────────────────────────────────────────────
// Gemini API key — 用 safeStorage 加密(OS keychain:Windows DPAPI / macOS Keychain)
// 不同機器解不開,且不會跟 localStorage 一起 export(JSON serialize 不到)
// ────────────────────────────────────────────────────────────────
function geminiKeyPath() {
  return path.join(app.getPath('userData'), 'gemini-key.enc');
}

ipcMain.handle('get-gemini-key', async () => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return '';
    const file = geminiKeyPath();
    if (!fs.existsSync(file)) return '';
    const encrypted = fs.readFileSync(file);
    return safeStorage.decryptString(encrypted);
  } catch (err) {
    console.error('[get-gemini-key]', err);
    return '';
  }
});

ipcMain.handle('set-gemini-key', async (event, key) => {
  try {
    // 先檢查 keychain 可用性 — 不可用時連 unlink 都不做,
    // 否則 keychain 暫時失效時 user 觸發清空,過去加密的 key 會永久消失
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: 'OS keychain 不可用,key 未儲存' };
    }
    const k = String(key || '').trim();
    const file = geminiKeyPath();
    if (!k) {
      // 清空 — 刪檔(不存空 string,免得有殘檔)
      if (fs.existsSync(file)) fs.unlinkSync(file);
      return { ok: true };
    }
    const encrypted = safeStorage.encryptString(k);
    fs.writeFileSync(file, encrypted);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
