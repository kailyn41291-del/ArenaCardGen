// Electron preload — 暴露安全的 IPC API 給 renderer(window.electronAPI)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectExportFolder: () => ipcRenderer.invoke('select-export-folder'),
  writePng: (folder, filename, dataBase64) =>
    ipcRenderer.invoke('write-png', { folder, filename, dataBase64 }),
  openFolder: (folder) => ipcRenderer.invoke('open-folder', folder),
  appVersion: () => ipcRenderer.invoke('app-version'),
  appPlatform: () => ipcRenderer.invoke('app-platform'),
});
