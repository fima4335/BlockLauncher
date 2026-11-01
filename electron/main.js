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
    const req = lib.get(url, { headers: { 'User-Agent': 'BlockLauncher/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        return download(res.headers.location, dest, onProgress).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error('HTTP ' + res.statusCode + ' ' + url));
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
    lib.get(url, { headers: { 'User-Agent': 'BlockLauncher/1.0' } }, (res) => {
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

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (!app.isPackaged) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// Accounts
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

// Instances
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
ipcMain.handle('instances:create', (_e, { name, version }) => {
  const safe = String(name).replace(/[<>:"/\\|?*]/g, '_').trim();
  const dir = path.join(DIR.instances, safe);
  if (fs.existsSync(dir)) throw new Error('Уже существует');
  fs.mkdirSync(path.join(dir, 'mods'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'saves'), { recursive: true });
  const meta = { id: randomUUID(), name: safe, version, createdAt: Date.now() };
  writeJson(path.join(dir, 'instance.json'), meta);
  return meta;
});
ipcMain.handle('instances:delete', (_e, name) => {
  const dir = path.join(DIR.instances, name);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
});

// Versions
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
  send('progress', 'Манифест ' + versionId);
  const manifest = readJson(path.join(DIR.versions, 'manifest.json'), null);
  if (!manifest) throw new Error('Сначала открой список версий');
  const info = manifest.versions.find((v) => v.id === versionId);
  if (!info) throw new Error('Версия не найдена');

  const vDir = path.join(DIR.versions, versionId);
  fs.mkdirSync(vDir, { recursive: true });
  const vJsonPath = path.join(vDir, versionId + '.json');
  await download(info.url, vJsonPath);
  const vJson = readJson(vJsonPath, null);
  if (!vJson) throw new Error('Не удалось прочитать version json');

  const jar = path.join(vDir, versionId + '.jar');
  if (!fs.existsSync(jar)) {
    send('progress', 'Скачивание клиента ' + versionId);
    await download(vJson.downloads.client.url, jar, (p) => send('progress', 'Клиент ' + Math.round(p * 100) + '%'));
  }

  send('progress', 'Библиотеки...');
  for (const lib of vJson.libraries || []) {
    const art = lib.downloads && lib.downloads.artifact;
    if (!art) continue;
    const lp = path.join(DIR.libraries, art.path);
    if (fs.existsSync(lp)) continue;
    fs.mkdirSync(path.dirname(lp), { recursive: true });
    try { await download(art.url, lp); } catch (e) { console.warn(e.message); }
  }

  // natives (simplified: download classifiers if present)
  const nativesDir = path.join(vDir, 'natives');
  fs.mkdirSync(nativesDir, { recursive: true });

  // asset index
  if (vJson.assetIndex && vJson.assetIndex.url) {
    const idxDir = path.join(DIR.assets, 'indexes');
    fs.mkdirSync(idxDir, { recursive: true });
    const idxPath = path.join(idxDir, vJson.assetIndex.id + '.json');
    if (!fs.existsSync(idxPath)) {
      send('progress', 'Asset index...');
      await download(vJson.assetIndex.url, idxPath);
    }
  }

  send('progress', 'Версия готова');
});

// Launch
ipcMain.handle('launch', async (_e, { instanceName, accountId }) => {
  const instDir = path.join(DIR.instances, instanceName);
  const meta = readJson(path.join(instDir, 'instance.json'), null);
  if (!meta) throw new Error('Инстанс не найден');
  const acc = readJson(ACCOUNTS, []).find((a) => a.id === accountId);
  if (!acc) throw new Error('Аккаунт не найден');

  const versionId = meta.version;
  const vDir = path.join(DIR.versions, versionId);
  const vJson = readJson(path.join(vDir, versionId + '.json'), null);
  const jar = path.join(vDir, versionId + '.jar');
  if (!vJson || !fs.existsSync(jar)) throw new Error('Версия не скачана');

  const cp = [jar];
  for (const lib of vJson.libraries || []) {
    const art = lib.downloads && lib.downloads.artifact;
    if (!art) continue;
    const lp = path.join(DIR.libraries, art.path);
    if (fs.existsSync(lp)) cp.push(lp);
  }

  const nativesDir = path.join(vDir, 'natives');
  const sep = process.platform === 'win32' ? ';' : ':';
  const args = [
    '-Xmx2G',
    '-Xms512M',
    '-Djava.library.path=' + nativesDir,
    '-cp', cp.join(sep),
    vJson.mainClass || 'net.minecraft.client.main.Main',
    '--username', acc.username,
    '--version', versionId,
    '--gameDir', instDir,
    '--assetsDir', DIR.assets,
    '--assetIndex', (vJson.assetIndex && vJson.assetIndex.id) || versionId,
    '--uuid', acc.uuid,
    '--accessToken', '0',
    '--userType', 'legacy',
    '--versionType', 'release',
  ];

  send('progress', 'Старт Java...');
  const proc = spawn('java', args, {
    cwd: instDir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (d) => send('log', d.toString()));
  proc.stderr.on('data', (d) => send('log', d.toString()));
  proc.unref();
  return { pid: proc.pid };
});

// Mods (Modrinth)
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
  send('progress', 'Modrinth: ' + slug);
  const project = await fetchJson('https://api.modrinth.com/v2/project/' + slug);
  const versions = await fetchJson('https://api.modrinth.com/v2/project/' + project.id + '/version');
  if (!versions.length) throw new Error('Нет версий мода');
  const ver = versions[0];
  const file = ver.files.find((f) => f.primary) || ver.files[0];
  if (!file) throw new Error('Нет файла');
  const dest = path.join(modsDir, file.filename);
  if (!fs.existsSync(dest)) await download(file.url, dest);

  const installed = [{ title: project.title, filename: file.filename }];

  // required deps
  for (const dep of ver.dependencies || []) {
    if (dep.dependency_type !== 'required' || !dep.project_id) continue;
    try {
      const dp = await fetchJson('https://api.modrinth.com/v2/project/' + dep.project_id);
      const dvs = await fetchJson('https://api.modrinth.com/v2/project/' + dep.project_id + '/version');
      if (!dvs.length) continue;
      const df = (dvs[0].files.find((f) => f.primary) || dvs[0].files[0]);
      if (!df) continue;
      const ddest = path.join(modsDir, df.filename);
      if (!fs.existsSync(ddest)) await download(df.url, ddest);
      installed.push({ title: dp.title, filename: df.filename });
    } catch (e) {
      console.warn(e.message);
    }
  }
  send('progress', 'Моды установлены');
  return installed;
});

console.log('BlockLauncher data:', ROOT);
