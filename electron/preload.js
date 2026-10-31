const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blockLauncher', {
  // Аккаунты
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  addOfflineAccount: (username) => ipcRenderer.invoke('accounts:add-offline', username),
  removeAccount: (id) => ipcRenderer.invoke('accounts:remove', id),

  // Инстансы
  listInstances: () => ipcRenderer.invoke('instances:list'),
  createInstance: (options) => ipcRenderer.invoke('instances:create', options),
  deleteInstance: (name) => ipcRenderer.invoke('instances:delete', name),
  getMods: (name) => ipcRenderer.invoke('instances:get-mods', name),

  // Версии
  getVersionManifest: () => ipcRenderer.invoke('versions:manifest'),
  downloadVersion: (versionId) => ipcRenderer.invoke('versions:download', versionId),

  // Запуск
  launch: (data) => ipcRenderer.invoke('launch:start', data),

  // Конфиг
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (config) => ipcRenderer.invoke('config:set', config),

  // События
  onDownloadProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('download:progress', handler);
    return () => ipcRenderer.removeListener('download:progress', handler);
  },
  onLaunchLog: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('launch:log', handler);
    return () => ipcRenderer.removeListener('launch:log', handler);
  }
});
