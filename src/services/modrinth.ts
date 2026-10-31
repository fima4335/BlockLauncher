/**
 * Базовый клиент Modrinth API
 */

const API = 'https://api.modrinth.com/v2';
const UA = 'BlockLauncher/0.1.0';

export async function searchMods(query: string, limit = 20) {
  const url = `${API}/search?query=${encodeURIComponent(query)}&limit=${limit}&facets=[["project_type:mod"]]`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

export async function getProject(slugOrId: string) {
  const res = await fetch(`${API}/project/${slugOrId}`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`Project not found: ${slugOrId}`);
  return res.json();
}
