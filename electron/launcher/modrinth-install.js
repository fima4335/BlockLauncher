const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const API = 'https://api.modrinth.com/v2';
const UA = 'BlockLauncher/0.3.2';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error('Modrinth HTTP ' + res.statusCode));
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        return downloadFile(res.headers.location, dest, onProgress).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) { file.close(); return reject(new Error('HTTP ' + res.statusCode)); }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress && total) onProgress(downloaded / total);
      });
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
  });
}

async function searchMods(query, { limit = 20, loaders = [], gameVersions = [] } = {}) {
  const facets = [['project_type:mod']];
  if (loaders.length) facets.push(loaders.map((l) => 'categories:' + l));
  if (gameVersions.length) facets.push(gameVersions.map((v) => 'versions:' + v));
  const params = new URLSearchParams({
    query: query || '',
    limit: String(limit),
    facets: JSON.stringify(facets),
    index: 'relevance',
  });
  return fetchJson(API + '/search?' + params);
}

async function getBestVersion(projectId, { loaders = [], gameVersions = [] } = {}) {
  const params = new URLSearchParams();
  if (loaders.length) params.set('loaders', JSON.stringify(loaders));
  if (gameVersions.length) params.set('game_versions', JSON.stringify(gameVersions));
  const qs = params.toString() ? '?' + params : '';
  let versions = await fetchJson(API + '/project/' + projectId + '/version' + qs);
  if (!versions.length) versions = await fetchJson(API + '/project/' + projectId + '/version');
  if (!versions.length) throw new Error('Нет версий мода');
  return versions[0];
}

async function installModToInstance(modsDir, projectSlugOrId, options = {}) {
  const {
    loaders = ['fabric', 'quilt', 'forge', 'neoforge'],
    gameVersions = [],
    installed = new Set(),
    onProgress,
    depth = 0,
  } = options;
  if (depth > 8) return [];

  const project = await fetchJson(API + '/project/' + projectSlugOrId);
  if (installed.has(project.id)) return [];

  const version = await getBestVersion(project.id, { loaders, gameVersions });
  const primary = version.files.find((f) => f.primary) || version.files[0];
  if (!primary) throw new Error('Нет файлов у ' + project.slug);

  fs.mkdirSync(modsDir, { recursive: true });
  const dest = path.join(modsDir, primary.filename);
  const results = [];

  if (!fs.existsSync(dest)) {
    if (onProgress) onProgress({ stage: 'mod', slug: project.slug, title: project.title, message: 'Скачивание ' + project.title });
    await downloadFile(primary.url, dest, (p) => {
      if (onProgress) onProgress({ stage: 'mod-progress', slug: project.slug, progress: p });
    });
  }

  installed.add(project.id);
  results.push({ id: project.id, slug: project.slug, title: project.title, filename: primary.filename, version: version.version_number });

  for (const dep of version.dependencies || []) {
    if (dep.dependency_type !== 'required' || !dep.project_id) continue;
    if (installed.has(dep.project_id)) continue;
    try {
      const nested = await installModToInstance(modsDir, dep.project_id, {
        loaders, gameVersions, installed, onProgress, depth: depth + 1,
      });
      results.push(...nested);
    } catch (e) {
      console.warn('Dep fail', dep.project_id, e.message);
    }
  }
  return results;
}

function listInstalledMods(modsDir) {
  if (!fs.existsSync(modsDir)) return [];
  return fs.readdirSync(modsDir)
    .filter((f) => f.endsWith('.jar') || f.endsWith('.jar.disabled'))
    .map((f) => ({
      filename: f,
      disabled: f.endsWith('.disabled'),
      path: path.join(modsDir, f),
      size: fs.statSync(path.join(modsDir, f)).size,
    }));
}

function removeMod(modsDir, filename) {
  const p = path.join(modsDir, filename);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return true;
}

function toggleMod(modsDir, filename) {
  const p = path.join(modsDir, filename);
  if (!fs.existsSync(p)) throw new Error('Файл не найден');
  if (filename.endsWith('.disabled')) {
    const neu = filename.replace(/\.disabled$/, '');
    fs.renameSync(p, path.join(modsDir, neu));
    return neu;
  }
  fs.renameSync(p, path.join(modsDir, filename + '.disabled'));
  return filename + '.disabled';
}

module.exports = {
  searchMods,
  getBestVersion,
  installModToInstance,
  listInstalledMods,
  removeMod,
  toggleMod,
};
