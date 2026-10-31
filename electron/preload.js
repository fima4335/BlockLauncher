const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blockLauncher', {
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  addOfflineAccount: (username) => ipcRenderer.invoke('accounts:add-offline', username),
  removeAccount: (id) => ipcRenderer.invoke('accounts:remove', id),

  listInstances: () => ipcRenderer.invoke('instances:list'),
  createInstance: (options) => ipcRenderer.invoke('instances:create', options),
  deleteInstance: (name) => ipcRenderer.invoke('instances:delete', name),
  getMods: (name) => ipcRenderer.invoke('instances:get-mods', name),

  getVersionManifest: () => ipcRenderer.invoke('versions:manifest'),
  downloadVersion: (versionId) => ipcRenderer.invoke('versions:download', versionId),

  getFabricVersions: (gameVersion) => ipcRenderer.invoke('loaders:fabric-versions', gameVersion),
  getForgeVersions: (gameVersion) => ipcRenderer.invoke('loaders:forge-versions', gameVersion),
  getNeoForgeVersions: (gameVersion) => ipcRenderer.invoke('loaders:neoforge-versions', gameVersion),
  installLoader: (opts) => ipcRenderer.invoke('loaders:install', opts),

  searchMods: (opts) => ipcRenderer.invoke('mods:search', opts),
  installMod: (opts) => ipcRenderer.invoke('mods:install', opts),
  listMods: (instanceName) => ipcRenderer.invoke('mods:list', instanceName),
  removeMod: (opts) => ipcRenderer.invoke('mods:remove', opts),
  toggleMod: (opts) => ipcRenderer.invoke('mods:toggle', opts),

  launch: (data) => ipcRenderer.invoke('launch:start', data),

  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (config) => ipcRenderer.invoke('config:set', config),

  onDownloadProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('download:progress', handler);
    return () => ipcRenderer.removeListener('download:progress', handler);
  },
  onLaunchLog: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('launch:log', handler);
    return () => ipcRenderer.removeListener('launch:log', handler);
  },
  onLoaderProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('loader:progress', handler);
    return () => ipcRenderer.removeListener('loader:progress', handler);
  },
  onModsProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('mods:progress', handler);
    return () => ipcRenderer.removeListener('mods:progress', handler);
  },
});
