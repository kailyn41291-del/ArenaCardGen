const { app, BrowserWindow, ipcMain, shell, safeStorage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;

// Auto-update Tier 2 設定 — 啟動後自動檢查 GitHub Releases,有新版自動下載並提示重啟安裝
// 對 portable .exe 不 work,只支援 NSIS installer 跟 macOS dmg(zip 版會 silent skip)
autoUpdater.autoDownload = true;       // 自動下載
autoUpdater.autoInstallOnAppQuit = true; // app 退出時自動裝
autoUpdater.allowPrerelease = true;     // beta 版也納入(因為我們現在主要是 prerelease)

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
      // TODO: 改用 sidecar / IPC-only 架構,讓 sandbox 回到 true
      // 目前 preload 需要 require('fs') 寫 Gemini key 加密檔,所以 sandbox: false
      // tracking issue: https://github.com/kailyn41291-del/ArenaCardGen/issues
      // (需要重構 preload → 改全用 ipcMain.handle 的 IPC 操作 file system)
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

  // Auto-update — 只在 packaged build 跑(dev 跑會報錯找不到 update server)
  // 全平台跑 Tier 2 — Mac 走 .zip 路徑(electron-builder 同時 ship .dmg + .zip,
  // electron-updater 在 Mac 自動挑 .zip 下載解壓 → ad-hoc 簽名兩邊一致下
  // Squirrel.Mac 允許 in-place replace,quitAndInstall 不會撞 Gatekeeper)
  // beta9 起這條路徑啟用;若 Mac 端真的撞牆,再 revert 回 platform gate
  if (!isDev) {
    const send = (channel, payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
      }
    };
    autoUpdater.on('update-available', (info) => {
      send('update-available', { version: info.version });
    });
    autoUpdater.on('update-not-available', () => {
      send('update-not-available', {});
    });
    autoUpdater.on('download-progress', (p) => {
      // p = { percent, transferred, total, bytesPerSecond }
      send('download-progress', {
        percent: p.percent,
        transferred: p.transferred,
        total: p.total,
        bytesPerSecond: p.bytesPerSecond,
      });
    });
    autoUpdater.on('update-downloaded', (info) => {
      send('update-downloaded', { version: info.version });
    });
    autoUpdater.on('error', (err) => {
      console.warn('[autoUpdater]', err.message);
      send('update-error', { message: err.message || String(err) });
    });
    // 用 checkForUpdates 而不是 checkForUpdatesAndNotify(後者會跳 native notification,
    // 我們改用 renderer 內 toast)
    autoUpdater.checkForUpdates().catch(() => {});
  }
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

// 立即重啟並安裝下載好的更新
ipcMain.handle('install-update-now', () => {
  try {
    autoUpdater.quitAndInstall();
    return { ok: true };
  } catch (err) {
    console.error('[install-update-now]', err);
    return { ok: false, error: err.message };
  }
});

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
