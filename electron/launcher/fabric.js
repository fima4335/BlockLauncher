/**
 * Установка Fabric Loader
 * Использует официальный Fabric Meta API
 * https://meta.fabricmc.net/
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const FABRIC_META = 'https://meta.fabricmc.net/v2';
const UA = 'BlockLauncher/0.2.1';

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
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
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
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function getLoaderVersions(gameVersion) {
  const list = await fetchJson(`${FABRIC_META}/versions/loader/${gameVersion}`);
  return list;
}

async function getProfileJson(gameVersion, loaderVersion) {
  return fetchJson(
    `${FABRIC_META}/versions/loader/${gameVersion}/${loaderVersion}/profile/json`
  );
}

async function installFabric(versionsDir, gameVersion, loaderVersion, onProgress) {
  if (!loaderVersion) {
    const loaders = await getLoaderVersions(gameVersion);
    const stable = loaders.find((l) => l.loader.stable) || loaders[0];
    if (!stable) throw new Error(`Нет Fabric Loader для ${gameVersion}`);
    loaderVersion = stable.loader.version;
  }

  const versionId = `${gameVersion}-fabric-${loaderVersion}`;
  const versionDir = path.join(versionsDir, versionId);
  fs.mkdirSync(versionDir, { recursive: true });

  if (onProgress) onProgress({ stage: 'profile', message: 'Загрузка профиля Fabric...' });
  const profile = await getProfileJson(gameVersion, loaderVersion);
  profile.id = versionId;

  const profilePath = path.join(versionDir, `${versionId}.json`);
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));

  const librariesDir = path.join(versionsDir, 'libraries');
  fs.mkdirSync(librariesDir, { recursive: true });

  const libs = profile.libraries || [];
  let i = 0;
  for (const lib of libs) {
    i++;
    if (!lib.downloads?.artifact && !lib.name) continue;

    let url, libPath;
    if (lib.downloads?.artifact) {
      url = lib.downloads.artifact.url;
      libPath = path.join(librariesDir, lib.downloads.artifact.path);
    } else if (lib.name && lib.url) {
      const parts = lib.name.split(':');
      if (parts.length < 3) continue;
      const [group, artifact, version] = parts;
      const groupPath = group.replace(/\./g, '/');
      const jarName = `${artifact}-${version}.jar`;
      const rel = path.join(groupPath, artifact, version, jarName);
      libPath = path.join(librariesDir, rel);
      url = `${lib.url.replace(/\/$/, '')}/${groupPath}/${artifact}/${version}/${jarName}`;
    } else {
      continue;
    }

    if (!fs.existsSync(libPath)) {
      fs.mkdirSync(path.dirname(libPath), { recursive: true });
      if (onProgress) {
        onProgress({
          stage: 'library',
          message: `Библиотека ${i}/${libs.length}`,
          progress: i / libs.length,
        });
      }
      try {
        await downloadFile(url, libPath);
      } catch (e) {
        console.warn('Fabric lib fail:', url, e.message);
      }
    }
  }

  return {
    versionId,
    loaderVersion,
    gameVersion,
    profilePath,
    mainClass: profile.mainClass,
  };
}

module.exports = {
  getLoaderVersions,
  getProfileJson,
  installFabric,
};
