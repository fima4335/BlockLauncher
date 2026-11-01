const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const UA = 'BlockLauncher/0.3.2';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('JSON parse ' + url)); }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) { file.close(); return reject(new Error('HTTP ' + res.statusCode)); }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
  });
}

async function getNeoForgeVersions(gameVersion) {
  try {
    const data = await fetchJson('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge');
    const parts = gameVersion.split('.');
    const major = parts[1];
    const minor = parts[2] || '0';
    return (data.versions || [])
      .filter((v) => v.startsWith(major + '.' + minor) || v.startsWith(major + '.'))
      .reverse();
  } catch {
    return [];
  }
}

async function getForgeVersions(gameVersion) {
  try {
    const data = await fetchJson('https://bmclapi2.bangbang93.com/forge/minecraft/' + gameVersion);
    return (data || []).map((x) => x.version).reverse();
  } catch {
    try {
      const promo = await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
      const list = [];
      if (promo.promos && promo.promos[gameVersion + '-recommended']) list.push(promo.promos[gameVersion + '-recommended']);
      if (promo.promos && promo.promos[gameVersion + '-latest']) list.push(promo.promos[gameVersion + '-latest']);
      return list;
    } catch {
      return [];
    }
  }
}

async function runInstaller(installerJar, versionsDir, onProgress) {
  return new Promise((resolve, reject) => {
    if (onProgress) onProgress({ stage: 'install', message: 'Запуск installer...' });
    const targetDir = path.join(path.dirname(versionsDir), 'forge-install-target');
    fs.mkdirSync(targetDir, { recursive: true });
    const proc = spawn('java', ['-jar', installerJar, '--installClient', targetDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    proc.stdout.on('data', (d) => {
      if (onProgress) onProgress({ stage: 'install', message: d.toString().trim() });
    });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error('Installer exit ' + code + ': ' + stderr.slice(0, 400)));
      const installedVersions = path.join(targetDir, 'versions');
      if (fs.existsSync(installedVersions)) {
        for (const name of fs.readdirSync(installedVersions)) {
          const src = path.join(installedVersions, name);
          const dest = path.join(versionsDir, name);
          if (!fs.existsSync(dest)) fs.cpSync(src, dest, { recursive: true });
        }
      }
      const installedLibs = path.join(targetDir, 'libraries');
      if (fs.existsSync(installedLibs)) {
        const libDest = path.join(versionsDir, 'libraries');
        fs.mkdirSync(libDest, { recursive: true });
        fs.cpSync(installedLibs, libDest, { recursive: true });
      }
      resolve(true);
    });
  });
}

async function installForge(versionsDir, gameVersion, forgeVersion, onProgress) {
  if (!forgeVersion) {
    const list = await getForgeVersions(gameVersion);
    if (!list.length) throw new Error('Нет Forge для ' + gameVersion);
    forgeVersion = list[0];
  }
  const fullVersion = gameVersion + '-' + forgeVersion;
  if (onProgress) onProgress({ stage: 'download', message: 'Скачивание Forge ' + fullVersion });
  const installerPath = path.join(versionsDir, 'forge-' + fullVersion + '-installer.jar');
  try {
    await downloadFile(
      'https://maven.minecraftforge.net/net/minecraftforge/forge/' + fullVersion + '/forge-' + fullVersion + '-installer.jar',
      installerPath
    );
  } catch {
    await downloadFile(
      'https://bmclapi2.bangbang93.com/forge/download?mcversion=' + gameVersion + '&version=' + forgeVersion + '&category=installer&format=jar',
      installerPath
    );
  }
  await runInstaller(installerPath, versionsDir, onProgress);
  let found = null;
  for (const name of fs.readdirSync(versionsDir)) {
    if (name.includes('forge') && name.includes(gameVersion) && fs.existsSync(path.join(versionsDir, name, name + '.json'))) {
      found = name;
      break;
    }
  }
  return { versionId: found || gameVersion + '-forge-' + forgeVersion, loaderVersion: forgeVersion, gameVersion };
}

async function installNeoForge(versionsDir, gameVersion, neoVersion, onProgress) {
  if (!neoVersion) {
    const list = await getNeoForgeVersions(gameVersion);
    if (!list.length) throw new Error('Нет NeoForge для ' + gameVersion);
    neoVersion = list[0];
  }
  if (onProgress) onProgress({ stage: 'download', message: 'Скачивание NeoForge ' + neoVersion });
  const installerPath = path.join(versionsDir, 'neoforge-' + neoVersion + '-installer.jar');
  await downloadFile(
    'https://maven.neoforged.net/releases/net/neoforged/neoforge/' + neoVersion + '/neoforge-' + neoVersion + '-installer.jar',
    installerPath
  );
  await runInstaller(installerPath, versionsDir, onProgress);
  let found = null;
  for (const name of fs.readdirSync(versionsDir)) {
    if ((name.toLowerCase().includes('neoforge') || name.includes(neoVersion)) &&
        fs.existsSync(path.join(versionsDir, name, name + '.json'))) {
      found = name;
      break;
    }
  }
  return { versionId: found || 'neoforge-' + neoVersion, loaderVersion: neoVersion, gameVersion };
}

module.exports = {
  getForgeVersions,
  getNeoForgeVersions,
  installForge,
  installNeoForge,
};
