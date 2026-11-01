import type {
  ModrinthProject,
  ModrinthVersion,
  DependencyReport,
  AnalyzedMod,
} from '../types/modrinth';

const MODRINTH_API = 'https://api.modrinth.com/v2';
const USER_AGENT = 'BlockLauncher/0.3.2';

export class ModIntelligence {
  private cache = new Map<string, any>();

  private async fetchJson<T>(url: string): Promise<T> {
    if (this.cache.has(url)) return this.cache.get(url);
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Modrinth API error ${res.status}: ${url}`);
    const data = await res.json();
    this.cache.set(url, data);
    return data as T;
  }

  async getProject(slugOrId: string): Promise<ModrinthProject> {
    return this.fetchJson(`${MODRINTH_API}/project/${slugOrId}`);
  }

  async getVersions(
    slugOrId: string,
    options?: { loaders?: string[]; gameVersions?: string[] }
  ): Promise<ModrinthVersion[]> {
    const params = new URLSearchParams();
    if (options?.loaders?.length) params.set('loaders', JSON.stringify(options.loaders));
    if (options?.gameVersions?.length) params.set('game_versions', JSON.stringify(options.gameVersions));
    const query = params.toString() ? `?${params}` : '';
    return this.fetchJson(`${MODRINTH_API}/project/${slugOrId}/version${query}`);
  }

  async analyzeMod(
    slugOrId: string,
    preferredLoaders: string[] = ['forge', 'neoforge', 'fabric', 'quilt'],
    preferredMcVersion?: string
  ): Promise<DependencyReport> {
    const project = await this.getProject(slugOrId);
    let versions = await this.getVersions(slugOrId, {
      loaders: preferredLoaders,
      gameVersions: preferredMcVersion ? [preferredMcVersion] : undefined,
    });
    if (!versions.length) versions = await this.getVersions(slugOrId);
    if (!versions.length) throw new Error(`Нет версий для ${slugOrId}`);

    const latest = versions[0];
    const required: AnalyzedMod[] = [];
    const optional: AnalyzedMod[] = [];
    const incompatible: AnalyzedMod[] = [];
    const embedded: AnalyzedMod[] = [];

    for (const dep of latest.dependencies || []) {
      if (!dep.project_id) continue;
      try {
        const depProject = await this.getProject(dep.project_id);
        const analyzed: AnalyzedMod = {
          id: depProject.id,
          slug: depProject.slug,
          title: depProject.title,
          description: depProject.description,
          icon_url: depProject.icon_url,
          downloads: depProject.downloads,
          dependency_type: dep.dependency_type,
        };
        if (dep.dependency_type === 'required') required.push(analyzed);
        else if (dep.dependency_type === 'optional') optional.push(analyzed);
        else if (dep.dependency_type === 'incompatible') incompatible.push(analyzed);
        else if (dep.dependency_type === 'embedded') embedded.push(analyzed);
      } catch {}
    }

    const addons = await this.findRelatedAddons(project);
    return {
      mod: { id: project.id, slug: project.slug, title: project.title, icon_url: project.icon_url },
      required, optional, incompatible, embedded, addons,
      loaders: latest.loaders || [],
      game_versions: latest.game_versions || [],
    };
  }

  private async findRelatedAddons(project: ModrinthProject): Promise<AnalyzedMod[]> {
    const query = project.slug === 'create' ? 'create' : project.title.split(' ')[0];
    try {
      const url = `${MODRINTH_API}/search?query=${encodeURIComponent(query)}&limit=15&facets=[["project_type:mod"]]&index=downloads`;
      const result = await this.fetchJson<{ hits: any[] }>(url);
      return (result.hits || [])
        .filter((h) => h.slug !== project.slug && (h.downloads || 0) > 10000)
        .slice(0, 10)
        .map((h) => ({
          id: h.project_id,
          slug: h.slug,
          title: h.title,
          description: h.description,
          icon_url: h.icon_url,
          downloads: h.downloads,
          reason: 'related',
        }));
    } catch {
      return [];
    }
  }

  formatReport(report: DependencyReport): string {
    const lines = [`Анализ: ${report.mod.title}`, `Лоадеры: ${report.loaders.join(', ')}`];
    if (report.required.length) lines.push('Required: ' + report.required.map(m => m.title).join(', '));
    if (report.optional.length) lines.push('Optional: ' + report.optional.map(m => m.title).join(', '));
    if (report.addons.length) lines.push('Addons: ' + report.addons.map(m => m.title).join(', '));
    return lines.join('\n');
  }
}
