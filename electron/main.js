const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const https = require('https');
const http = require('http');
const { randomUUID } = require('crypto');
const uuidv4 = () => randomUUID();

// Optional launcher modules (won't crash if missing)
let fabric = null, forge = null, modrinthInstall = null;
try { fabric = require('./launcher/fabric'); } catch (e) { console.warn(e.message); }
try { forge = require('./launcher/forge'); } catch (e) { console.warn(e.message); }
try { modrinthInstall = require('./launcher/modrinth-install'); } catch (e) { console.warn(e.message); }

process.on('uncaughtException', (err) => {
  console.error('Uncaught:', err);
  try { dialog.showErrorBox('BlockLauncher Error', String(err && err.stack || err)); } catch {}
});

const USER_DATA = app.getPath('userData');
const INSTANCES_DIR = path.join(USER_DATA, 'instances');
const VERSIONS_DIR = path.join(USER_DATA, 'versions');
const JAVA_DIR = path.join(USER_DATA, 'java');
const ACCOUNTS_FILE = path.join(USER_DATA, 'accounts.json');
const CONFIG_FILE = path.join(USER_DATA, 'config.json');

[INSTANCES_DIR, VERSIONS_DIR, JAVA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'BlockLauncher',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function readJson(file, fallback = null) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  return fallback;
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;
    const request = proto.get(url, { headers: { 'User-Agent': 'BlockLauncher/0.3.1' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest, onProgress).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress && total) onProgress(downloaded / total);
      });
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    });
    request.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

ipcMain.handle('accounts:list', () => readJson(ACCOUNTS_FILE, []));

ipcMain.handle('accounts:add-offline', (event, username) => {
  const accounts = readJson(ACCOUNTS_FILE, []);
  const account = {
    id: uuidv4(),
    type: 'offline',
    username: String(username || '').trim(),
    uuid: uuidv4().replace(/-/g, ''),
    accessToken: '0',
    createdAt: new Date().toISOString()
  };
  accounts.push(account);
  writeJson(ACCOUNTS_FILE, accounts);
  return account;
});

ipcMain.handle('accounts:remove', (event, id) => {
  let accounts = readJson(ACCOUNTS_FILE, []);
  accounts = accounts.filter(a => a.id !== id);
  writeJson(ACCOUNTS_FILE, accounts);
  return true;
});

ipcMain.handle('instances:list', () => {
  const list = [];
  if (!fs.existsSync(INSTANCES_DIR)) return list;
  for (const name of fs.readdirSync(INSTANCES_DIR)) {
    const instPath = path.join(INSTANCES_DIR, name);
    const metaPath = path.join(instPath, 'instance.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        list.push({ ...meta, path: instPath });
      } catch {}
    }
  }
  return list.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
});

ipcMain.handle('instances:create', async (event, options) => {
  const { name, version, loader = 'vanilla', loaderVersion = null } = options;
  const safeName = String(name || '').replace(/[<>:"/\\|?*]/g, '_').trim();
  const instPath = path.join(INSTANCES_DIR, safeName);
  if (fs.existsSync(instPath)) throw new Error('Инстанс с таким именем уже существует');

  fs.mkdirSync(instPath, { recursive: true });
  fs.mkdirSync(path.join(instPath, 'mods'), { recursive: true });
  fs.mkdirSync(path.join(instPath, 'resourcepacks'), { recursive: true });
  fs.mkdirSync(path.join(instPath, 'saves'), { recursive: true });

  let resolvedVersion = version;
  let resolvedLoaderVersion = loaderVersion;
  const send = (data) => mainWindow?.webContents.send('loader:progress', data);

  if (loader && loader !== 'vanilla') {
    try {
      if (loader === 'fabric' && fabric) {
        const result = await fabric.installFabric(VERSIONS_DIR, version, loaderVersion, send);
        resolvedVersion = result.versionId;
        resolvedLoaderVersion = result.loaderVersion;
      } else if (loader === 'forge' && forge) {
        const result = await forge.installForge(VERSIONS_DIR, version, loaderVersion, send);
        resolvedVersion = result.versionId;
        resolvedLoaderVersion = result.loaderVersion;
      } else if (loader === 'neoforge' && forge) {
        const result = await forge.installNeoForge(VERSIONS_DIR, version, loaderVersion, send);
        resolvedVersion = result.versionId;
        resolvedLoaderVersion = result.loaderVersion;
      }
    } catch (e) {
      console.error('Loader install error:', e);
    }
  }

  const meta = {
    id: uuidv4(),
    name: safeName,
    version: resolvedVersion,
    gameVersion: version,
    loader,
    loaderVersion: resolvedLoaderVersion,
    createdAt: new Date().toISOString(),
    lastPlayed: null,
    javaArgs: '-Xmx4G -Xms1G',
    icon: null
  };
  writeJson(path.join(instPath, 'instance.json'), meta);
  return { ...meta, path: instPath };
});

ipcMain.handle('instances:delete', (event, name) => {
  const instPath = path.join(INSTANCES_DIR, name);
  if (fs.existsSync(instPath)) fs.rmSync(instPath, { recursive: true, force: true });
  return true;
});

ipcMain.handle('instances:get-mods', (event, name) => {
  const modsDir = path.join(INSTANCES_DIR, name, 'mods');
  if (!fs.existsSync(modsDir)) return [];
  return fs.readdirSync(modsDir).filter(f => f.endsWith('.jar')).map(f => ({ name: f, path: path.join(modsDir, f) }));
});

ipcMain.handle('versions:manifest', async () => {
  const cacheFile = path.join(VERSIONS_DIR, 'version_manifest_v2.json');
  const url = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
  try { await downloadFile(url, cacheFile); } catch (e) {
    if (!fs.existsSync(cacheFile)) throw e;
  }
  return readJson(cacheFile);
});

ipcMain.handle('versions:download', async (event, versionId) => {
  const manifest = readJson(path.join(VERSIONS_DIR, 'version_manifest_v2.json'));
  if (!manifest) throw new Error('Манифест версий не загружен');
  const versionInfo = manifest.versions.find(v => v.id === versionId);
  if (!versionInfo) throw new Error('Версия ' + versionId + ' не найдена');
  const versionDir = path.join(VERSIONS_DIR, versionId);
  fs.mkdirSync(versionDir, { recursive: true });
  const versionJsonPath = path.join(versionDir, versionId + '.json');
  await downloadFile(versionInfo.url, versionJsonPath);
  const versionJson = readJson(versionJsonPath);
  const clientJar = path.join(versionDir, versionId + '.jar');
  if (!fs.existsSync(clientJar)) {
    await downloadFile(versionJson.downloads.client.url, clientJar, (p) => {
      mainWindow?.webContents.send('download:progress', { type: 'client', progress: p, version: versionId });
    });
  }
  const librariesDir = path.join(VERSIONS_DIR, 'libraries');
  fs.mkdirSync(librariesDir, { recursive: true });
  for (const lib of versionJson.libraries || []) {
    if (!lib.downloads?.artifact) continue;
    const artifact = lib.downloads.artifact;
    const libPath = path.join(librariesDir, artifact.path);
    if (!fs.existsSync(libPath)) {
      fs.mkdirSync(path.dirname(libPath), { recursive: true });
      try { await downloadFile(artifact.url, libPath); } catch (e) { console.warn(e.message); }
    }
  }
  return { versionId, path: versionDir };
});

ipcMain.handle('launch:start', async (event, { instanceName, accountId }) => {
  const instPath = path.join(INSTANCES_DIR, instanceName);
  const metaPath = path.join(instPath, 'instance.json');
  if (!fs.existsSync(metaPath)) throw new Error('Инстанс не найден');
  const meta = readJson(metaPath);
  const accounts = readJson(ACCOUNTS_FILE, []);
  const account = accounts.find(a => a.id === accountId);
  if (!account) throw new Error('Аккаунт не найден');
  const versionId = meta.version;
  const versionDir = path.join(VERSIONS_DIR, versionId);
  const versionJsonPath = path.join(versionDir, versionId + '.json');
  const clientJar = path.join(versionDir, versionId + '.jar');
  if (!fs.existsSync(versionJsonPath) || !fs.existsSync(clientJar)) {
    throw new Error('Версия ' + versionId + ' не скачана. Сначала скачайте её.');
  }
  const versionJson = readJson(versionJsonPath);
  const librariesDir = path.join(VERSIONS_DIR, 'libraries');
  const classpath = [clientJar];
  for (const lib of versionJson.libraries || []) {
    if (lib.downloads?.artifact) {
      const libPath = path.join(librariesDir, lib.downloads.artifact.path);
      if (fs.existsSync(libPath)) classpath.push(libPath);
    }
  }
  const nativesDir = path.join(versionDir, 'natives');
  fs.mkdirSync(nativesDir, { recursive: true });
  const assetsDir = path.join(VERSIONS_DIR, 'assets');
  const args = [
    ...(meta.javaArgs || '-Xmx4G -Xms1G').split(/\s+/).filter(Boolean),
    '-Djava.library.path=' + nativesDir,
    '-cp', classpath.join(process.platform === 'win32' ? ';' : ':'),
    versionJson.mainClass || 'net.minecraft.client.main.Main',
    '--username', account.username,
    '--version', versionId,
    '--gameDir', instPath,
    '--assetsDir', assetsDir,
    '--assetIndex', (versionJson.assetIndex && versionJson.assetIndex.id) || versionId,
    '--uuid', account.uuid,
    '--accessToken', account.accessToken || '0',
    '--userType', account.type === 'offline' ? 'legacy' : 'msa',
    '--versionType', 'release'
  ];
  meta.lastPlayed = Date.now();
  writeJson(metaPath, meta);
  const proc = spawn('java', args, { cwd: instPath, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.on('data', (data) => mainWindow?.webContents.send('launch:log', data.toString()));
  proc.stderr.on('data', (data) => mainWindow?.webContents.send('launch:log', data.toString()));
  proc.unref();
  return { pid: proc.pid, instance: instanceName };
});

ipcMain.handle('loaders:fabric-versions', async (e, gv) => {
  if (!fabric) throw new Error('Fabric module not loaded');
  return fabric.getLoaderVersions(gv);
});
ipcMain.handle('loaders:forge-versions', async (e, gv) => {
  if (!forge) throw new Error('Forge module not loaded');
  return forge.getForgeVersions(gv);
});
ipcMain.handle('loaders:neoforge-versions', async (e, gv) => {
  if (!forge) throw new Error('Forge module not loaded');
  return forge.getNeoForgeVersions(gv);
});
ipcMain.handle('loaders:install', async (e, opts) => {
  throw new Error('Use instance create with loader selected');
});

ipcMain.handle('mods:search', async (e, { query, loaders, gameVersions, limit }) => {
  if (!modrinthInstall) throw new Error('Modrinth module not loaded');
  return modrinthInstall.searchMods(query, { loaders, gameVersions, limit });
});
ipcMain.handle('mods:install', async (e, { instanceName, slug, loaders, gameVersions }) => {
  if (!modrinthInstall) throw new Error('Modrinth module not loaded');
  const modsDir = path.join(INSTANCES_DIR, instanceName, 'mods');
  const send = (data) => mainWindow?.webContents.send('mods:progress', data);
  return modrinthInstall.installModToInstance(modsDir, slug, {
    loaders: loaders || ['fabric', 'forge', 'neoforge', 'quilt'],
    gameVersions: gameVersions || [],
    onProgress: send
  });
});
ipcMain.handle('mods:list', (e, instanceName) => {
  if (!modrinthInstall) return [];
  return modrinthInstall.listInstalledMods(path.join(INSTANCES_DIR, instanceName, 'mods'));
});
ipcMain.handle('mods:remove', (e, { instanceName, filename }) => {
  if (!modrinthInstall) throw new Error('Modrinth module not loaded');
  return modrinthInstall.removeMod(path.join(INSTANCES_DIR, instanceName, 'mods'), filename);
});
ipcMain.handle('mods:toggle', (e, { instanceName, filename }) => {
  if (!modrinthInstall) throw new Error('Modrinth module not loaded');
  return modrinthInstall.toggleMod(path.join(INSTANCES_DIR, instanceName, 'mods'), filename);
});

ipcMain.handle('config:get', () => readJson(CONFIG_FILE, { language: 'ru', theme: 'dark', maxMemory: 4096 }));
ipcMain.handle('config:set', (e, config) => { writeJson(CONFIG_FILE, config); return true; });

console.log('BlockLauncher started');
console.log('User data:', USER_DATA);
