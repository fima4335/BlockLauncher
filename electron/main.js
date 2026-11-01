const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const ROOT = app.getPath('userData');
const DIR = {
  instances: path.join(ROOT, 'instances'),
  versions: path.join(ROOT, 'versions'),
  libraries: path.join(ROOT, 'libraries'),
  assets: path.join(ROOT, 'assets'),
};
const ACCOUNTS = path.join(ROOT, 'accounts.json');

for (const d of Object.values(DIR)) fs.mkdirSync(d, { recursive: true });

let win = null;
const send = (ch, data) => win && win.webContents.send(ch, data);

function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  return fallback;
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function download(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'BlockLauncher/1.1' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        return download(res.headers.location, dest, onProgress).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let done = 0;
      res.on('data', (c) => {
        done += c.length;
        if (onProgress && total) onProgress(done / total);
      });
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    });
    req.on('error', (e) => {
      fs.unlink(dest, () => {});
      reject(e);
    });
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'BlockLauncher/1.1' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function installFabric(gameVersion) {
  send('progress', 'Поиск Fabric Loader...');
  const loaders = await fetchJson('https://meta.fabricmc.net/v2/versions/loader/' + gameVersion);
  if (!loaders || !loaders.length) throw new Error('Нет Fabric для ' + gameVersion);
  const stable = loaders.find((x) => x.loader && x.loader.stable) || loaders[0];
  const loaderVersion = stable.loader.version;
  const versionId = gameVersion + '-fabric-' + loaderVersion;

  send('progress', 'Установка Fabric ' + loaderVersion);
  const profile = await fetchJson(
    'https://meta.fabricmc.net/v2/versions/loader/' + gameVersion + '/' + loaderVersion + '/profile/json'
  );
  profile.id = versionId;

  const vDir = path.join(DIR.versions, versionId);
  fs.mkdirSync(vDir, { recursive: true });
  writeJson(path.join(vDir, versionId + '.json'), profile);

  // libraries from fabric profile
  for (const lib of profile.libraries || []) {
    let url = null;
    let rel = null;
    if (lib.downloads && lib.downloads.artifact) {
      url = lib.downloads.artifact.url;
      rel = lib.downloads.artifact.path;
    } else if (lib.name && lib.url) {
      const parts = lib.name.split(':');
      if (parts.length >= 3) {
        const [group, artifact, ver] = parts;
        const gpath = group.replace(/\./g, '/');
        rel = path.join(gpath, artifact, ver, artifact + '-' + ver + '.jar');
        url = lib.url.replace(/\/$/, '') + '/' + gpath + '/' + artifact + '/' + ver + '/' + artifact + '-' + ver + '.jar';
      }
    }
    if (!url || !rel) continue;
    const lp = path.join(DIR.libraries, rel);
    if (fs.existsSync(lp)) continue;
    fs.mkdirSync(path.dirname(lp), { recursive: true });
    try { await download(url, lp); } catch (e) { console.warn(e.message); }
  }

  return { versionId, loaderVersion };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 740,
    backgroundColor: '#0b1220',
    title: 'BlockLauncher',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (!app.isPackaged) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('accounts:list', () => readJson(ACCOUNTS, []));
ipcMain.handle('accounts:add', (_e, name) => {
  const list = readJson(ACCOUNTS, []);
  const acc = {
    id: randomUUID(),
    username: String(name || 'Player').trim(),
    uuid: randomUUID().replace(/-/g, ''),
    type: 'offline',
  };
  list.push(acc);
  writeJson(ACCOUNTS, list);
  return acc;
});
ipcMain.handle('accounts:remove', (_e, id) => {
  writeJson(ACCOUNTS, readJson(ACCOUNTS, []).filter((a) => a.id !== id));
});

ipcMain.handle('instances:list', () => {
  const out = [];
  for (const name of fs.readdirSync(DIR.instances)) {
    const meta = path.join(DIR.instances, name, 'instance.json');
    if (fs.existsSync(meta)) {
      try { out.push(JSON.parse(fs.readFileSync(meta, 'utf8'))); } catch {}
    }
  }
  return out;
});

ipcMain.handle('instances:create', async (_e, { name, version, loader }) => {
  const safe = String(name).replace(/[<>:"/\\|?*]/g, '_').trim();
  const dir = path.join(DIR.instances, safe);
  if (fs.existsSync(dir)) throw new Error('Инстанс уже существует');
  fs.mkdirSync(path.join(dir, 'mods'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'saves'), { recursive: true });

  let launchVersion = version;
  let loaderVersion = null;
  const selectedLoader = loader || 'vanilla';

  if (selectedLoader === 'fabric') {
    try {
      // ensure vanilla json exists first for inheritsFrom
      const manifest = readJson(path.join(DIR.versions, 'manifest.json'), null);
      if (manifest) {
        const info = manifest.versions.find((v) => v.id === version);
        if (info) {
          const vDir = path.join(DIR.versions, version);
          fs.mkdirSync(vDir, { recursive: true });
          const vJsonPath = path.join(vDir, version + '.json');
          if (!fs.existsSync(vJsonPath)) await download(info.url, vJsonPath);
          const vJson = readJson(vJsonPath, null);
          const jar = path.join(vDir, version + '.jar');
          if (vJson && vJson.downloads && vJson.downloads.client && !fs.existsSync(jar)) {
            send('progress', 'Скачивание Minecraft...');
            await download(vJson.downloads.client.url, jar);
          }
        }
      }
      const fab = await installFabric(version);
      launchVersion = fab.versionId;
      loaderVersion = fab.loaderVersion;
    } catch (e) {
      console.error(e);
      send('progress', 'Fabric не установлен: ' + e.message);
      // keep vanilla version id
    }
  }

  const meta = {
    id: randomUUID(),
    name: safe,
    version: launchVersion,
    gameVersion: version,
    loader: selectedLoader,
    loaderVersion,
    createdAt: Date.now(),
  };
  writeJson(path.join(dir, 'instance.json'), meta);
  send('progress', 'Инстанс создан');
  return meta;
});

ipcMain.handle('instances:delete', (_e, name) => {
  const dir = path.join(DIR.instances, name);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
});

ipcMain.handle('versions:list', async () => {
  const cache = path.join(DIR.versions, 'manifest.json');
  try {
    await download('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', cache);
  } catch (e) {
    if (!fs.existsSync(cache)) throw e;
  }
  return readJson(cache, { versions: [] });
});

ipcMain.handle('versions:download', async (_e, versionId) => {
  send('progress', 'Подготовка ' + versionId);
  const manifest = readJson(path.join(DIR.versions, 'manifest.json'), null);

  // fabric profile may already exist
  const existing = path.join(DIR.versions, versionId, versionId + '.json');
  let vJson = readJson(existing, null);

  if (!vJson) {
    if (!manifest) throw new Error('Нет манифеста версий');
    const info = manifest.versions.find((v) => v.id === versionId);
    if (!info) throw new Error('Версия не найдена: ' + versionId);
    const vDir = path.join(DIR.versions, versionId);
    fs.mkdirSync(vDir, { recursive: true });
    await download(info.url, existing);
    vJson = readJson(existing, null);
  }

  if (!vJson) throw new Error('Не удалось загрузить профиль версии');

  // inheritsFrom (fabric)
  let baseId = vJson.inheritsFrom || null;
  if (baseId) {
    const baseDir = path.join(DIR.versions, baseId);
    const baseJsonPath = path.join(baseDir, baseId + '.json');
    if (!fs.existsSync(baseJsonPath) && manifest) {
      const info = manifest.versions.find((v) => v.id === baseId);
      if (info) {
        fs.mkdirSync(baseDir, { recursive: true });
        await download(info.url, baseJsonPath);
      }
    }
    const baseJson = readJson(baseJsonPath, null);
    if (baseJson) {
      const jar = path.join(baseDir, baseId + '.jar');
      if (!fs.existsSync(jar) && baseJson.downloads && baseJson.downloads.client) {
        send('progress', 'Скачивание клиента...');
        await download(baseJson.downloads.client.url, jar);
      }
      for (const lib of baseJson.libraries || []) {
        const art = lib.downloads && lib.downloads.artifact;
        if (!art) continue;
        const lp = path.join(DIR.libraries, art.path);
        if (fs.existsSync(lp)) continue;
        fs.mkdirSync(path.dirname(lp), { recursive: true });
        try { await download(art.url, lp); } catch {}
      }
    }
  } else {
    const vDir = path.join(DIR.versions, versionId);
    const jar = path.join(vDir, versionId + '.jar');
    if (!fs.existsSync(jar) && vJson.downloads && vJson.downloads.client) {
      send('progress', 'Скачивание клиента...');
      await download(vJson.downloads.client.url, jar);
    }
  }

  send('progress', 'Библиотеки...');
  for (const lib of vJson.libraries || []) {
    if (lib.downloads && lib.downloads.artifact) {
      const art = lib.downloads.artifact;
      const lp = path.join(DIR.libraries, art.path);
      if (fs.existsSync(lp)) continue;
      fs.mkdirSync(path.dirname(lp), { recursive: true });
      try { await download(art.url, lp); } catch {}
    } else if (lib.name && lib.url) {
      const parts = lib.name.split(':');
      if (parts.length >= 3) {
        const [group, artifact, ver] = parts;
        const gpath = group.replace(/\./g, '/');
        const rel = path.join(gpath, artifact, ver, artifact + '-' + ver + '.jar');
        const lp = path.join(DIR.libraries, rel);
        if (fs.existsSync(lp)) continue;
        const url = lib.url.replace(/\/$/, '') + '/' + gpath + '/' + artifact + '/' + ver + '/' + artifact + '-' + ver + '.jar';
        fs.mkdirSync(path.dirname(lp), { recursive: true });
        try { await download(url, lp); } catch {}
      }
    }
  }

  const nativesDir = path.join(DIR.versions, versionId, 'natives');
  fs.mkdirSync(nativesDir, { recursive: true });

  if (vJson.assetIndex && vJson.assetIndex.url) {
    const idxDir = path.join(DIR.assets, 'indexes');
    fs.mkdirSync(idxDir, { recursive: true });
    const idxPath = path.join(idxDir, vJson.assetIndex.id + '.json');
    if (!fs.existsSync(idxPath)) await download(vJson.assetIndex.url, idxPath);
  }

  send('progress', 'Готово');
});

ipcMain.handle('launch', async (_e, { instanceName, accountId }) => {
  const instDir = path.join(DIR.instances, instanceName);
  const meta = readJson(path.join(instDir, 'instance.json'), null);
  if (!meta) throw new Error('Инстанс не найден');
  const acc = readJson(ACCOUNTS, []).find((a) => a.id === accountId);
  if (!acc) throw new Error('Аккаунт не найден');

  const versionId = meta.version;
  const vDir = path.join(DIR.versions, versionId);
  const vJson = readJson(path.join(vDir, versionId + '.json'), null);
  if (!vJson) throw new Error('Профиль версии не найден');

  // merge libraries with inheritsFrom
  let libraries = [...(vJson.libraries || [])];
  let mainClass = vJson.mainClass || 'net.minecraft.client.main.Main';
  let assetIndex = vJson.assetIndex;
  let jarPath = path.join(vDir, versionId + '.jar');

  if (vJson.inheritsFrom) {
    const baseId = vJson.inheritsFrom;
    const baseJson = readJson(path.join(DIR.versions, baseId, baseId + '.json'), null);
    if (baseJson) {
      libraries = [...(baseJson.libraries || []), ...libraries];
      if (!assetIndex) assetIndex = baseJson.assetIndex;
      jarPath = path.join(DIR.versions, baseId, baseId + '.jar');
      if (!vJson.mainClass && baseJson.mainClass) mainClass = baseJson.mainClass;
    }
  }

  if (!fs.existsSync(jarPath)) throw new Error('Клиент не скачан');

  const cp = [jarPath];
  for (const lib of libraries) {
    if (lib.downloads && lib.downloads.artifact) {
      const lp = path.join(DIR.libraries, lib.downloads.artifact.path);
      if (fs.existsSync(lp)) cp.push(lp);
    } else if (lib.name) {
      const parts = lib.name.split(':');
      if (parts.length >= 3) {
        const [group, artifact, ver] = parts;
        const gpath = group.replace(/\./g, '/');
        const rel = path.join(gpath, artifact, ver, artifact + '-' + ver + '.jar');
        const lp = path.join(DIR.libraries, rel);
        if (fs.existsSync(lp)) cp.push(lp);
      }
    }
  }

  const nativesDir = path.join(vDir, 'natives');
  fs.mkdirSync(nativesDir, { recursive: true });
  const sep = process.platform === 'win32' ? ';' : ':';

  const args = [
    '-Xmx2G', '-Xms512M',
    '-Djava.library.path=' + nativesDir,
    '-cp', cp.join(sep),
    mainClass,
    '--username', acc.username,
    '--version', versionId,
    '--gameDir', instDir,
    '--assetsDir', DIR.assets,
    '--assetIndex', (assetIndex && assetIndex.id) || meta.gameVersion || versionId,
    '--uuid', acc.uuid,
    '--accessToken', '0',
    '--userType', 'legacy',
    '--versionType', 'release',
  ];

  send('progress', 'Запуск...');
  const proc = spawn('java', args, { cwd: instDir, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.on('data', (d) => send('log', d.toString()));
  proc.stderr.on('data', (d) => send('log', d.toString()));
  proc.unref();
  return { pid: proc.pid };
});

ipcMain.handle('mods:search', async (_e, q) => {
  const url = 'https://api.modrinth.com/v2/search?query=' + encodeURIComponent(q || '') +
    '&limit=20&facets=' + encodeURIComponent('[["project_type:mod"]]');
  return fetchJson(url);
});
ipcMain.handle('mods:list', (_e, instanceName) => {
  const modsDir = path.join(DIR.instances, instanceName, 'mods');
  if (!fs.existsSync(modsDir)) return [];
  return fs.readdirSync(modsDir).filter((f) => f.endsWith('.jar')).map((f) => ({ filename: f }));
});
ipcMain.handle('mods:remove', (_e, { instanceName, file }) => {
  const p = path.join(DIR.instances, instanceName, 'mods', file);
  if (fs.existsSync(p)) fs.unlinkSync(p);
});
ipcMain.handle('mods:install', async (_e, { instanceName, slug }) => {
  const modsDir = path.join(DIR.instances, instanceName, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });
  send('progress', 'Установка мода ' + slug);
  const project = await fetchJson('https://api.modrinth.com/v2/project/' + slug);
  const versions = await fetchJson('https://api.modrinth.com/v2/project/' + project.id + '/version');
  if (!versions.length) throw new Error('Нет версий мода');
  const ver = versions[0];
  const file = ver.files.find((f) => f.primary) || ver.files[0];
  if (!file) throw new Error('Нет файла');
  const dest = path.join(modsDir, file.filename);
  if (!fs.existsSync(dest)) await download(file.url, dest);
  const installed = [{ title: project.title, filename: file.filename }];
  for (const dep of ver.dependencies || []) {
    if (dep.dependency_type !== 'required' || !dep.project_id) continue;
    try {
      const dp = await fetchJson('https://api.modrinth.com/v2/project/' + dep.project_id);
      const dvs = await fetchJson('https://api.modrinth.com/v2/project/' + dep.project_id + '/version');
      if (!dvs.length) continue;
      const df = dvs[0].files.find((f) => f.primary) || dvs[0].files[0];
      if (!df) continue;
      const ddest = path.join(modsDir, df.filename);
      if (!fs.existsSync(ddest)) await download(df.url, ddest);
      installed.push({ title: dp.title, filename: df.filename });
    } catch {}
  }
  send('progress', 'Моды установлены');
  return installed;
});

console.log('BlockLauncher:', ROOT);
