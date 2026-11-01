import React, { useState, useEffect, useCallback } from 'react';
import { ModIntelligence } from './core/mod-intelligence';
import type { DependencyReport } from './types/modrinth';

declare global {
  interface Window {
    blockLauncher?: {
      listAccounts: () => Promise<any[]>;
      addOfflineAccount: (username: string) => Promise<any>;
      removeAccount: (id: string) => Promise<boolean>;
      listInstances: () => Promise<any[]>;
      createInstance: (opts: any) => Promise<any>;
      deleteInstance: (name: string) => Promise<boolean>;
      getMods: (name: string) => Promise<any[]>;
      getVersionManifest: () => Promise<any>;
      downloadVersion: (id: string) => Promise<any>;
      launch: (data: { instanceName: string; accountId: string }) => Promise<any>;
      getConfig: () => Promise<any>;
      setConfig: (c: any) => Promise<boolean>;
      searchMods: (opts: any) => Promise<any>;
      installMod: (opts: any) => Promise<any[]>;
      listMods: (name: string) => Promise<any[]>;
      removeMod: (opts: any) => Promise<boolean>;
      onDownloadProgress: (cb: (d: any) => void) => () => void;
      onLaunchLog: (cb: (d: string) => void) => () => void;
      onLoaderProgress: (cb: (d: any) => void) => () => void;
      onModsProgress: (cb: (d: any) => void) => () => void;
    };
  }
}

const isElectron = typeof window !== 'undefined' && !!window.blockLauncher;
type Tab = 'instances' | 'accounts' | 'mods' | 'modintel' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('instances');
  const [instances, setInstances] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);

  const refresh = useCallback(async () => {
    if (!isElectron) return;
    const [inst, acc] = await Promise.all([
      window.blockLauncher!.listInstances(),
      window.blockLauncher!.listAccounts()
    ]);
    setInstances(inst);
    setAccounts(acc);
    if (acc.length && !selectedAccount) setSelectedAccount(acc[0].id);
  }, [selectedAccount]);

  useEffect(() => {
    refresh();
    if (isElectron) {
      return window.blockLauncher!.onLaunchLog((line) => {
        setLogs(prev => [...prev.slice(-100), line]);
      });
    }
  }, [refresh]);

  useEffect(() => {
    if (isElectron && tab === 'instances') {
      window.blockLauncher!.getVersionManifest().then(m => {
        if (m?.versions) setVersions(m.versions.filter((v: any) => v.type === 'release').slice(0, 30));
      }).catch(console.error);
    }
  }, [tab]);

  const handleLaunch = async (inst: any) => {
    if (!selectedAccount) { alert('Сначала добавьте и выберите аккаунт'); return; }
    setLoading(true);
    setLogs([]);
    try {
      await window.blockLauncher!.downloadVersion(inst.version);
      await window.blockLauncher!.launch({ instanceName: inst.name, accountId: selectedAccount });
      setLogs(prev => [...prev, 'Игра запущена!']);
    } catch (e: any) {
      setLogs(prev => [...prev, 'Ошибка: ' + e.message]);
      alert(e.message);
    } finally {
      setLoading(false);
      refresh();
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <aside className="sidebar">
        <div style={{ padding: '0.5rem 0.75rem', marginBottom: '1rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>BlockLauncher</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>v0.3.1</p>
        </div>
        <button className={tab === 'instances' ? 'active' : ''} onClick={() => setTab('instances')}>Инстансы</button>
        <button className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}>Аккаунты</button>
        <button className={tab === 'mods' ? 'active' : ''} onClick={() => setTab('mods')}>Моды (Modrinth)</button>
        <button className={tab === 'modintel' ? 'active' : ''} onClick={() => setTab('modintel')}>Mod Intelligence</button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Настройки</button>
        {!isElectron && (
          <div style={{ marginTop: 'auto', padding: '0.75rem', background: 'var(--bg)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--warning)' }}>
            Браузерный режим. Для полного функционала: npm run dev
          </div>
        )}
      </aside>

      <main className="main-content">
        {tab === 'instances' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.5rem' }}>Инстансы</h2>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <select value={selectedAccount || ''} onChange={e => setSelectedAccount(e.target.value)} style={{ minWidth: 160 }}>
                  <option value="">Аккаунт...</option>
                  {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.username}</option>)}
                </select>
                <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Создать</button>
              </div>
            </div>
            {instances.length === 0 ? (
              <div className="empty-state">
                <p>Нет инстансов</p>
                <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => setShowCreate(true)}>Создать</button>
              </div>
            ) : (
              <div className="grid-instances">
                {instances.map((inst: any) => (
                  <div key={inst.id} className="instance-card">
                    <h3>{inst.name}</h3>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                      <span className="badge">{inst.version}</span>
                      <span className="badge">{inst.loader}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                      <button className="btn-primary" style={{ flex: 1 }} disabled={loading || !selectedAccount} onClick={() => handleLaunch(inst)}>
                        {loading ? 'Запуск...' : 'Играть'}
                      </button>
                      <button className="btn-danger" onClick={async () => {
                        if (confirm('Удалить ' + inst.name + '?')) {
                          await window.blockLauncher?.deleteInstance(inst.name);
                          refresh();
                        }
                      }}>X</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {logs.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h3>Лог</h3>
                <div className="log-box">{logs.join('')}</div>
              </div>
            )}
          </div>
        )}

        {tab === 'accounts' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.5rem' }}>Аккаунты</h2>
              <button className="btn-primary" onClick={() => setShowAddAccount(true)}>+ Offline</button>
            </div>
            {accounts.map((a: any) => (
              <div key={a.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <strong>{a.username}</strong>
                <button className="btn-danger" onClick={async () => { await window.blockLauncher?.removeAccount(a.id); refresh(); }}>Удалить</button>
              </div>
            ))}
          </div>
        )}

        {tab === 'mods' && <ModsTab instances={instances} />}
        {tab === 'modintel' && <ModIntelTab />}
        {tab === 'settings' && <div className="card"><h2>Настройки</h2><p style={{ color: 'var(--text-muted)' }}>Скоро...</p></div>}
      </main>

      {showCreate && (
        <CreateModal versions={versions} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refresh(); }} />
      )}
      {showAddAccount && (
        <AddAccountModal onClose={() => setShowAddAccount(false)} onAdded={() => { setShowAddAccount(false); refresh(); }} />
      )}
    </div>
  );
}

function ModsTab({ instances }: { instances: any[] }) {
  const [selected, setSelected] = useState(instances[0]?.name || '');
  const [query, setQuery] = useState('sodium');
  const [results, setResults] = useState<any[]>([]);
  const [installed, setInstalled] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!isElectron || !selected) return;
    window.blockLauncher!.listMods(selected).then(setInstalled).catch(() => setInstalled([]));
  }, [selected]);

  const search = async () => {
    if (!isElectron || !query.trim()) return;
    setLoading(true);
    try {
      const res = await window.blockLauncher!.searchMods({ query: query.trim(), limit: 20 });
      setResults(res.hits || []);
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  };

  const install = async (slug: string) => {
    if (!selected) { alert('Выберите инстанс'); return; }
    setLoading(true);
    setStatus('Установка...');
    try {
      const mods = await window.blockLauncher!.installMod({ instanceName: selected, slug });
      setStatus('Установлено: ' + mods.map((m: any) => m.title).join(', '));
      setInstalled(await window.blockLauncher!.listMods(selected));
    } catch (e: any) { alert(e.message); setStatus(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Моды Modrinth</h2>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select value={selected} onChange={e => setSelected(e.target.value)} style={{ minWidth: 160 }}>
          <option value="">Инстанс...</option>
          {instances.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
        </select>
        <input value={query} onChange={e => setQuery(e.target.value)} style={{ flex: 1 }} onKeyDown={e => e.key === 'Enter' && search()} />
        <button className="btn-primary" onClick={search} disabled={loading}>Найти</button>
      </div>
      {status && <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>{status}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <h3>Поиск</h3>
          {results.map(m => (
            <div key={m.project_id} className="card" style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{m.title}</span>
              <button className="btn-primary" disabled={!selected || loading} onClick={() => install(m.slug)}>Установить</button>
            </div>
          ))}
        </div>
        <div>
          <h3>Установлено</h3>
          {installed.map(m => (
            <div key={m.filename} className="card" style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.85rem' }}>{m.filename}</span>
              <button className="btn-danger" onClick={async () => {
                await window.blockLauncher!.removeMod({ instanceName: selected, filename: m.filename });
                setInstalled(await window.blockLauncher!.listMods(selected));
              }}>Удалить</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ModIntelTab() {
  const [slug, setSlug] = useState('create');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DependencyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intel = React.useMemo(() => new ModIntelligence(), []);

  const analyze = async () => {
    setLoading(true); setError(null); setReport(null);
    try { setReport(await intel.analyzeMod(slug.trim().toLowerCase())); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Mod Intelligence</h2>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <input value={slug} onChange={e => setSlug(e.target.value)} style={{ flex: 1 }} onKeyDown={e => e.key === 'Enter' && analyze()} />
        <button className="btn-primary" onClick={analyze} disabled={loading}>{loading ? '...' : 'Анализ'}</button>
      </div>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {report && (
        <div className="card">
          <h3>{report.mod.title}</h3>
          <p style={{ color: 'var(--text-muted)' }}>{report.loaders.join(', ')}</p>
          {report.required.length > 0 && <p><b>Required:</b> {report.required.map(m => m.title).join(', ')}</p>}
          {report.optional.length > 0 && <p><b>Optional:</b> {report.optional.map(m => m.title).join(', ')}</p>}
          {report.addons.length > 0 && <p><b>Addons:</b> {report.addons.map(m => m.title).join(', ')}</p>}
        </div>
      )}
    </div>
  );
}

function CreateModal({ versions, onClose, onCreated }: any) {
  const [name, setName] = useState('');
  const [version, setVersion] = useState(versions[0]?.id || '1.21.1');
  const [loader, setLoader] = useState('vanilla');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await window.blockLauncher!.createInstance({ name: name.trim(), version, loader });
      onCreated();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Создать инстанс</h2>
        <div className="form-group"><label>Имя</label><input value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
        <div className="form-group"><label>Версия</label>
          <select value={version} onChange={e => setVersion(e.target.value)}>
            {versions.map((v: any) => <option key={v.id} value={v.id}>{v.id}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Лоадер</label>
          <select value={loader} onChange={e => setLoader(e.target.value)}>
            <option value="vanilla">Vanilla</option>
            <option value="fabric">Fabric</option>
            <option value="forge">Forge</option>
            <option value="neoforge">NeoForge</option>
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={submit} disabled={busy || !name.trim()}>{busy ? 'Создание...' : 'Создать'}</button>
        </div>
      </div>
    </div>
  );
}

function AddAccountModal({ onClose, onAdded }: any) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!username.trim()) return;
    setBusy(true);
    try {
      await window.blockLauncher!.addOfflineAccount(username.trim());
      onAdded();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Offline аккаунт</h2>
        <div className="form-group"><label>Ник</label>
          <input value={username} onChange={e => setUsername(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={submit} disabled={busy || !username.trim()}>Добавить</button>
        </div>
      </div>
    </div>
  );
}
