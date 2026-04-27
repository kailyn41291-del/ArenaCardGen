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
  // Gemini API key 透過 OS keychain 加密儲存,不落 localStorage
  getGeminiKey: () => ipcRenderer.invoke('get-gemini-key'),
  setGeminiKey: (key) => ipcRenderer.invoke('set-gemini-key', key),
  // ── Auto-update IPC ──
  // main process 偵測 / 下載 update,renderer 訂閱事件顯示 toast / 進度條 / 安裝鍵
  onUpdateAvailable: onChannel('update-available'),     // payload: { version }
  onDownloadProgress: onChannel('download-progress'),   // payload: { percent, transferred, total, bytesPerSecond }
  onUpdateDownloaded: onChannel('update-downloaded'),   // payload: { version }
  onUpdateError: onChannel('update-error'),             // payload: { message }
  installUpdateNow: () => ipcRenderer.invoke('install-update-now'),
});
