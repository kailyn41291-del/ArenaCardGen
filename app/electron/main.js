const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
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
// IPC handlers — 取代瀏覽器 ZIP 下載,直接寫到使用者指定的資料夾
// ────────────────────────────────────────────────────────────────

// 記住最後一次使用者透過 dialog 選的資料夾,write-png 只允許寫到這個白名單路徑下
let allowedExportFolder = null;

ipcMain.handle('select-export-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '選擇字卡匯出資料夾',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  allowedExportFolder = path.resolve(result.filePaths[0]);
  return allowedExportFolder;
});

ipcMain.handle('write-png', async (event, { folder, filename, dataBase64 }) => {
  try {
    if (!allowedExportFolder) {
      return { ok: false, error: '請先選擇匯出資料夾' };
    }
    // 路徑必須在使用者選的資料夾底下,防止 path traversal / 任意寫入
    const resolvedFolder = path.resolve(folder);
    if (resolvedFolder !== allowedExportFolder &&
        !resolvedFolder.startsWith(allowedExportFolder + path.sep)) {
      return { ok: false, error: '未授權的寫入路徑' };
    }
    const buf = Buffer.from(dataBase64, 'base64');
    // 過 Windows 禁用字、control chars、末尾點/空格(Windows 不允許)
    const safe = String(filename)
      .replace(/[\x00-\x1F]/g, '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/[.\s]+$/, '');
    if (!safe) return { ok: false, error: '檔名為空或全是無效字元' };
    const fullPath = path.join(resolvedFolder, safe);
    fs.writeFileSync(fullPath, buf);
    return { ok: true, path: fullPath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('open-folder', async (event, folder) => {
  if (!allowedExportFolder) return;
  const resolved = path.resolve(String(folder));
  if (resolved !== allowedExportFolder &&
      !resolved.startsWith(allowedExportFolder + path.sep)) {
    return;
  }
  shell.openPath(resolved);
});

ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('app-platform', () => process.platform);
