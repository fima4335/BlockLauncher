/**
 * BlockLauncher — Mod Intelligence
 * Уникальный модуль анализа зависимостей модов и модпаков.
 *
 * При добавлении мода (например Create) показывает:
 * - обязательные зависимости
 * - рекомендуемые / дополнительные
 * - несовместимые
 * - популярные аддоны
 */

import type {
  ModrinthProject,
  ModrinthVersion,
  ModrinthDependency,
  DependencyReport,
  AnalyzedMod,
} from '../types/modrinth';

const MODRINTH_API = 'https://api.modrinth.com/v2';
const USER_AGENT = 'BlockLauncher/0.1.0 (https://github.com/fima4335/BlockLauncher)';

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

  /**
   * Получить проект по slug или ID
   */
  async getProject(slugOrId: string): Promise<ModrinthProject> {
    return this.fetchJson<ModrinthProject>(`${MODRINTH_API}/project/${slugOrId}`);
  }

  /**
   * Получить версии проекта (с фильтром по лоадеру и версии MC)
   */
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

  /**
   * Главная функция — полный анализ мода
   */
  async analyzeMod(
    slugOrId: string,
    preferredLoaders: string[] = ['forge', 'neoforge', 'fabric', 'quilt'],
    preferredMcVersion?: string
  ): Promise<DependencyReport> {
    const project = await this.getProject(slugOrId);

    // Берём самую свежую подходящую версию
    let versions = await this.getVersions(slugOrId, {
      loaders: preferredLoaders,
      gameVersions: preferredMcVersion ? [preferredMcVersion] : undefined,
    });

    if (versions.length === 0) {
      // fallback без фильтров
      versions = await this.getVersions(slugOrId);
    }

    if (versions.length === 0) {
      throw new Error(`Не найдено версий для мода ${slugOrId}`);
    }

    // Берём первую (самую новую)
    const latest = versions[0];

    const required: AnalyzedMod[] = [];
    const optional: AnalyzedMod[] = [];
    const incompatible: AnalyzedMod[] = [];
    const embedded: AnalyzedMod[] = [];

    // Обрабатываем зависимости из версии
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

    // Ищем популярные аддоны (моды, у которых в названии/описании есть Create, или связанные)
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

  /**
   * Поиск связанных аддонов / поддерживаемых модов
   * Для Create ищем моды с "create" в названии + высокие скачивания
   */
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

  /**
   * Красивый текстовый отчёт (для консоли или логов)
   */
  formatReport(report: DependencyReport): string {
    const lines: string[] = [];

    lines.push(`\n📦 Анализ мода: ${report.mod.title} (${report.mod.slug})`);
    lines.push(`   Лоадеры: ${report.loaders.join(', ') || 'не указаны'}`);
    lines.push(`   Версии MC: ${report.game_versions.slice(0, 5).join(', ')}${report.game_versions.length > 5 ? '...' : ''}`);
    lines.push('');

    if (report.required.length) {
      lines.push('🔴 ОБЯЗАТЕЛЬНЫЕ ЗАВИСИМОСТИ:');
      report.required.forEach((m) => {
        lines.push(`   • ${m.title} (${m.slug})`);
      });
      lines.push('');
    }

    if (report.optional.length) {
      lines.push('🟡 РЕКОМЕНДУЕМЫЕ / ДОПОЛНИТЕЛЬНЫЕ:');
      report.optional.forEach((m) => {
        lines.push(`   • ${m.title} (${m.slug})`);
      });
      lines.push('');
    }

    if (report.incompatible.length) {
      lines.push('⛔ НЕСОВМЕСТИМЫЕ:');
      report.incompatible.forEach((m) => {
        lines.push(`   • ${m.title} (${m.slug})`);
      });
      lines.push('');
    }

    if (report.addons.length) {
      lines.push('🧩 ПОПУЛЯРНЫЕ АДДОНЫ И СВЯЗАННЫЕ МОДЫ:');
      report.addons.forEach((m) => {
        lines.push(`   • ${m.title} (${m.slug}) — ${(m.downloads || 0).toLocaleString()} скачиваний`);
      });
    }

    return lines.join('\n');
  }
}

// Пример использования (можно запускать напрямую)
if (require.main === module) {
  (async () => {
    const intel = new ModIntelligence();
    console.log('Анализируем мод Create...\n');

    try {
      const report = await intel.analyzeMod('create', ['forge', 'neoforge']);
      console.log(intel.formatReport(report));
    } catch (err) {
      console.error('Ошибка:', err);
    }
  })();
}
