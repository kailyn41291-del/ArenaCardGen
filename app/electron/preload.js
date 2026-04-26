// Electron preload — 暴露安全的 IPC API 給 renderer(window.electronAPI)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  appVersion: () => ipcRenderer.invoke('app-version'),
  // Gemini API key 透過 OS keychain 加密儲存,不落 localStorage
  getGeminiKey: () => ipcRenderer.invoke('get-gemini-key'),
  setGeminiKey: (key) => ipcRenderer.invoke('set-gemini-key', key),
  // 匯出走瀏覽器 ZIP 下載,不需要 native folder write IPC
  // (將來改成原生 export 時再加回 selectExportFolder / writePng / openFolder)
});
