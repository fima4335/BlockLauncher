/**
 * BlockLauncher — Mod Intelligence
 * Анализ зависимостей модов через Modrinth API
 */

import type {
  ModrinthProject,
  ModrinthVersion,
  DependencyReport,
  AnalyzedMod,
} from '../types/modrinth';

const MODRINTH_API = 'https://api.modrinth.com/v2';
const USER_AGENT = 'BlockLauncher/0.3.1 (https://github.com/fima4335/BlockLauncher)';

export class ModIntelligence {
  private cache = new Map<string, any>();

  private async fetchJson<T>(url: string): Promise<T> {
    if (this.cache.has(url)) {
      return this.cache.get(url);
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Modrinth API error ${res.status}: ${url}`);
    }

    const data = await res.json();
    this.cache.set(url, data);
    return data as T;
  }

  async getProject(slugOrId: string): Promise<ModrinthProject> {
    return this.fetchJson<ModrinthProject>(`${MODRINTH_API}/project/${slugOrId}`);
  }

  async getVersions(
    slugOrId: string,
    options?: { loaders?: string[]; gameVersions?: string[] }
  ): Promise<ModrinthVersion[]> {
    const params = new URLSearchParams();
    if (options?.loaders?.length) {
      params.set('loaders', JSON.stringify(options.loaders));
    }
    if (options?.gameVersions?.length) {
      params.set('game_versions', JSON.stringify(options.gameVersions));
    }

    const query = params.toString() ? `?${params}` : '';
    return this.fetchJson<ModrinthVersion[]>(
      `${MODRINTH_API}/project/${slugOrId}/version${query}`
    );
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

    if (versions.length === 0) {
      versions = await this.getVersions(slugOrId);
    }

    if (versions.length === 0) {
      throw new Error(`Не найдено версий для мода ${slugOrId}`);
    }

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

        switch (dep.dependency_type) {
          case 'required':
            required.push(analyzed);
            break;
          case 'optional':
            optional.push(analyzed);
            break;
          case 'incompatible':
            incompatible.push(analyzed);
            break;
          case 'embedded':
            embedded.push(analyzed);
            break;
        }
      } catch (e) {
        console.warn(`Не удалось загрузить зависимость ${dep.project_id}`, e);
      }
    }

    const addons = await this.findRelatedAddons(project);

    return {
      mod: {
        id: project.id,
        slug: project.slug,
        title: project.title,
        icon_url: project.icon_url,
      },
      required,
      optional,
      incompatible,
      embedded,
      addons,
      loaders: latest.loaders || [],
      game_versions: latest.game_versions || [],
    };
  }

  private async findRelatedAddons(project: ModrinthProject): Promise<AnalyzedMod[]> {
    const query = project.slug === 'create' ? 'create' : project.title.split(' ')[0];

    try {
      const searchUrl = `${MODRINTH_API}/search?query=${encodeURIComponent(
        query
      )}&limit=15&facets=[["project_type:mod"]]&index=downloads`;

      const result = await this.fetchJson<{
        hits: Array<{
          project_id: string;
          slug: string;
          title: string;
          description: string;
          icon_url?: string;
          downloads: number;
        }>;
      }>(searchUrl);

      return result.hits
        .filter((hit) => hit.slug !== project.slug && hit.downloads > 10000)
        .slice(0, 10)
        .map((hit) => ({
          id: hit.project_id,
          slug: hit.slug,
          title: hit.title,
          description: hit.description,
          icon_url: hit.icon_url,
          downloads: hit.downloads,
          reason: 'Популярный связанный мод / аддон',
        }));
    } catch {
      return [];
    }
  }

  formatReport(report: DependencyReport): string {
    const lines: string[] = [];

    lines.push(`\nАнализ мода: ${report.mod.title} (${report.mod.slug})`);
    lines.push(`   Лоадеры: ${report.loaders.join(', ') || 'не указаны'}`);
    lines.push(
      `   Версии MC: ${report.game_versions.slice(0, 5).join(', ')}${
        report.game_versions.length > 5 ? '...' : ''
      }`
    );
    lines.push('');

    if (report.required.length) {
      lines.push('ОБЯЗАТЕЛЬНЫЕ:');
      report.required.forEach((m) => lines.push(`   • ${m.title} (${m.slug})`));
      lines.push('');
    }

    if (report.optional.length) {
      lines.push('РЕКОМЕНДУЕМЫЕ:');
      report.optional.forEach((m) => lines.push(`   • ${m.title} (${m.slug})`));
      lines.push('');
    }

    if (report.incompatible.length) {
      lines.push('НЕСОВМЕСТИМЫЕ:');
      report.incompatible.forEach((m) => lines.push(`   • ${m.title} (${m.slug})`));
      lines.push('');
    }

    if (report.addons.length) {
      lines.push('АДДОНЫ:');
      report.addons.forEach((m) =>
        lines.push(`   • ${m.title} (${m.slug}) — ${(m.downloads || 0).toLocaleString()}`)
      );
    }

    return lines.join('\n');
  }
}
