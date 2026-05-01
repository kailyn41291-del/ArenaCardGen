// Electron preload — 暴露安全的 IPC API 給 renderer(window.electronAPI)
const { contextBridge, ipcRenderer } = require('electron');

// 把 main process 送來的 update 事件包成 listener API
// 回傳 unsubscribe 函式,讓 React useEffect cleanup 容易寫
const onChannel = (channel) => (cb) => {
  const handler = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('electronAPI', {
  appVersion: () => ipcRenderer.invoke('app-version'),
  // 平台偵測 — renderer 用來決定 auto-update 走 Tier 2(IPC + autoUpdater)還是 Tier 1
  // (web mode toast,點 Download 開新分頁)。macOS 因未做 Apple notarization,
  // autoUpdater.quitAndInstall() 會被 Gatekeeper 擋,改走 web mode 比較誠實。
  platform: process.platform,                           // 'darwin' / 'win32' / 'linux'
  // Gemini API key 透過 OS keychain 加密儲存,不落 localStorage
  getGeminiKey: () => ipcRenderer.invoke('get-gemini-key'),
  setGeminiKey: (key) => ipcRenderer.invoke('set-gemini-key', key),
  // ── Auto-update IPC(只在非 darwin 上有用)──
  // main process 偵測 / 下載 update,renderer 訂閱事件顯示 toast / 進度條 / 安裝鍵
  onUpdateAvailable: onChannel('update-available'),     // payload: { version }
  onDownloadProgress: onChannel('download-progress'),   // payload: { percent, transferred, total, bytesPerSecond }
  onUpdateDownloaded: onChannel('update-downloaded'),   // payload: { version }
  onUpdateError: onChannel('update-error'),             // payload: { message }
  installUpdateNow: () => ipcRenderer.invoke('install-update-now'),
  // ── 匯出直接字卡到資料夾(Electron only;web 走 ZIP fallback)──
  selectExportFolder: () => ipcRenderer.invoke('select-export-folder'),
  writePng: (args) => ipcRenderer.invoke('write-png', args),
  revealFolder: (folder) => ipcRenderer.invoke('reveal-folder', folder),
});
