const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  addAccount: (name) => ipcRenderer.invoke('accounts:add', name),
  removeAccount: (id) => ipcRenderer.invoke('accounts:remove', id),

  listInstances: () => ipcRenderer.invoke('instances:list'),
  createInstance: (data) => ipcRenderer.invoke('instances:create', data),
  deleteInstance: (name) => ipcRenderer.invoke('instances:delete', name),

  getVersions: () => ipcRenderer.invoke('versions:list'),
  downloadVersion: (id) => ipcRenderer.invoke('versions:download', id),
  launch: (instanceName, accountId) => ipcRenderer.invoke('launch', { instanceName, accountId }),

  searchMods: (q) => ipcRenderer.invoke('mods:search', q),
  installMod: (instanceName, slug) => ipcRenderer.invoke('mods:install', { instanceName, slug }),
  listMods: (instanceName) => ipcRenderer.invoke('mods:list', instanceName),
  removeMod: (instanceName, file) => ipcRenderer.invoke('mods:remove', { instanceName, file }),

  onLog: (cb) => {
    const h = (_e, line) => cb(line);
    ipcRenderer.on('log', h);
    return () => ipcRenderer.removeListener('log', h);
  },
  onProgress: (cb) => {
    const h = (_e, msg) => cb(msg);
    ipcRenderer.on('progress', h);
    return () => ipcRenderer.removeListener('progress', h);
  },
});
