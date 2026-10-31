import React, { useState } from 'react';
import { ModIntelligence } from '../core/mod-intelligence';
import type { DependencyReport } from '../types/modrinth';

const intel = new ModIntelligence();

export function ModAnalyzer() {
  const [slug, setSlug] = useState('create');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DependencyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    if (!slug.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const result = await intel.analyzeMod(slug.trim().toLowerCase());
      setReport(result);
    } catch (e: any) {
      setError(e.message || 'Ошибка анализа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">🧱 BlockLauncher — Mod Intelligence</h1>
      <p className="text-gray-600 mb-6">
        Уникальная функция: анализ зависимостей мода. Введите slug (например <code>create</code>)
      </p>

      <div className="flex gap-3 mb-8">
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug мода (create, sodium, iris...)"
          className="flex-1 border rounded px-4 py-2"
          onKeyDown={(e) => e.key === 'Enter' && analyze()}
        />
        <button
          onClick={analyze}
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Анализируем...' : 'Анализировать'}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {report && (
        <div className="space-y-6">
          <div className="bg-white border rounded-lg p-4 shadow">
            <h2 className="text-xl font-semibold flex items-center gap-3">
              {report.mod.icon_url && (
                <img src={report.mod.icon_url} alt="" className="w-10 h-10 rounded" />
              )}
              {report.mod.title}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Лоадеры: {report.loaders.join(', ') || '—'} · Версии MC:{' '}
              {report.game_versions.slice(0, 6).join(', ')}
              {report.game_versions.length > 6 ? '...' : ''}
            </p>
          </div>

          {report.required.length > 0 && (
            <Section title="🔴 Обязательные зависимости" mods={report.required} color="red" />
          )}

          {report.optional.length > 0 && (
            <Section title="🟡 Рекомендуемые / дополнительные" mods={report.optional} color="yellow" />
          )}

          {report.incompatible.length > 0 && (
            <Section title="⛔ Несовместимые" mods={report.incompatible} color="red" />
          )}

          {report.addons.length > 0 && (
            <Section title="🧩 Популярные аддоны и связанные моды" mods={report.addons} color="green" />
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  mods,
  color,
}: {
  title: string;
  mods: any[];
  color: string;
}) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {mods.map((m) => (
          <div
            key={m.id}
            className="border rounded-lg p-3 flex gap-3 hover:shadow transition"
          >
            {m.icon_url ? (
              <img src={m.icon_url} alt="" className="w-12 h-12 rounded shrink-0" />
            ) : (
              <div className="w-12 h-12 bg-gray-200 rounded shrink-0" />
            )}
            <div className="min-w-0">
              <div className="font-medium truncate">{m.title}</div>
              <div className="text-sm text-gray-500 truncate">{m.slug}</div>
              {m.downloads && (
                <div className="text-xs text-gray-400 mt-1">
                  {m.downloads.toLocaleString()} скачиваний
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ModAnalyzer;
