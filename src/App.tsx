import React, { useCallback, useEffect, useState } from 'react';

declare global {
  interface Window {
    api?: {
      listAccounts: () => Promise<any[]>;
      addAccount: (name: string) => Promise<any>;
      removeAccount: (id: string) => Promise<void>;
      listInstances: () => Promise<any[]>;
      createInstance: (data: { name: string; version: string; loader: string }) => Promise<any>;
      deleteInstance: (name: string) => Promise<void>;
      getVersions: () => Promise<any>;
      downloadVersion: (id: string) => Promise<void>;
      launch: (instanceName: string, accountId: string) => Promise<{ pid: number }>;
      searchMods: (q: string) => Promise<any>;
      installMod: (instanceName: string, slug: string) => Promise<any[]>;
      listMods: (instanceName: string) => Promise<any[]>;
      removeMod: (instanceName: string, file: string) => Promise<void>;
      onLog: (cb: (line: string) => void) => () => void;
      onProgress: (cb: (msg: string) => void) => () => void;
    };
  }
}

const hasApi = () => !!window.api;
type Tab = 'play' | 'accounts' | 'mods' | 'skins' | 'servers' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('play');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showAcc, setShowAcc] = useState(false);

  const refresh = useCallback(async () => {
    if (!hasApi()) return;
    const [a, i] = await Promise.all([window.api!.listAccounts(), window.api!.listInstances()]);
    setAccounts(a);
    setInstances(i);
    if (a.length && !accountId) setAccountId(a[0].id);
  }, [accountId]);

  useEffect(() => {
    refresh();
    if (!hasApi()) return;
    const off = window.api!.onProgress((msg) => setStatus(msg));
    window.api!.getVersions().then((m) => {
      const list = (m?.versions || []).filter((v: any) => v.type === 'release').slice(0, 50);
      setVersions(list);
    }).catch(console.error);
    return off;
  }, [refresh]);

  const play = async (inst: any) => {
    if (!accountId) return alert('Сначала добавьте аккаунт');
    setBusy(true);
    setStatus('Подготовка...');
    try {
      await window.api!.downloadVersion(inst.version);
      setStatus('Запуск Minecraft...');
      await window.api!.launch(inst.name, accountId);
      setStatus('Игра запущена');
    } catch (e: any) {
      setStatus('Ошибка запуска');
      alert(e.message || e);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="logo">B</div>
          <div>
            <h1>BlockLauncher</h1>
            <p>v1.1 · Русский</p>
          </div>
        </div>

        <button className={'nav' + (tab === 'play' ? ' active' : '')} onClick={() => setTab('play')}>Играть</button>
        <button className={'nav' + (tab === 'accounts' ? ' active' : '')} onClick={() => setTab('accounts')}>Аккаунты</button>
        <button className={'nav' + (tab === 'mods' ? ' active' : '')} onClick={() => setTab('mods')}>Моды</button>
        <button className={'nav' + (tab === 'skins' ? ' active' : '')} onClick={() => setTab('skins')}>Скины</button>
        <button className={'nav' + (tab === 'servers' ? ' active' : '')} onClick={() => setTab('servers')}>Серверы</button>
        <button className={'nav' + (tab === 'settings' ? ' active' : '')} onClick={() => setTab('settings')}>Настройки</button>

        {!hasApi() && (
          <p className="muted" style={{ marginTop: 'auto', fontSize: 12, padding: '0.5rem' }}>
            Запустите через npm run dev
          </p>
        )}
      </aside>

      <main className="main">
        {tab === 'play' && (
          <>
            <div className="top">
              <h2>Инстансы</h2>
              <div className="actions">
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ width: 170 }}>
                  <option value="">Аккаунт</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.username}</option>)}
                </select>
                <button onClick={() => setShowCreate(true)}>+ Создать</button>
              </div>
            </div>

            <div className="status">{status || ' '}</div>

            {instances.length === 0 ? (
              <div className="empty">
                <p>Пока нет инстансов</p>
                <button style={{ marginTop: 12 }} onClick={() => setShowCreate(true)}>Создать первый</button>
              </div>
            ) : (
              <div className="grid">
                {instances.map((inst) => (
                  <div key={inst.id} className="card">
                    <h3>{inst.name}</h3>
                    <div className="meta">
                      <span className="badge">{inst.version}</span>
                      <span className="badge">{inst.loader || 'vanilla'}</span>
                    </div>
                    <div className="row">
                      <button disabled={busy || !accountId} onClick={() => play(inst)}>
                        {busy ? 'Запуск...' : 'Играть'}
                      </button>
                      <button className="danger" style={{ flex: '0 0 auto' }} onClick={async () => {
                        if (confirm('Удалить инстанс «' + inst.name + '»?')) {
                          await window.api!.deleteInstance(inst.name);
                          refresh();
                        }
                      }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'accounts' && (
          <>
            <div className="top">
              <h2>Аккаунты</h2>
              <button onClick={() => setShowAcc(true)}>+ Offline аккаунт</button>
            </div>
            <div className="list">
              {accounts.map((a) => (
                <div key={a.id} className="card">
                  <div>
                    <strong>{a.username}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>offline</div>
                  </div>
                  <button className="danger" onClick={async () => { await window.api!.removeAccount(a.id); refresh(); }}>Удалить</button>
                </div>
              ))}
              {!accounts.length && <div className="empty">Нет аккаунтов</div>}
            </div>
          </>
        )}

        {tab === 'mods' && <ModsTab instances={instances} />}

        {tab === 'skins' && (
          <div className="card">
            <h2 style={{ marginBottom: 8 }}>Скины</h2>
            <p className="muted">Скоро: загрузка скина и превью персонажа. Пока используйте сайт minecraft.net / Ely.by.</p>
          </div>
        )}

        {tab === 'servers' && (
          <div className="card">
            <h2 style={{ marginBottom: 8 }}>Серверы</h2>
            <p className="muted">Скоро: избранные сервера и быстрый вход. Пока подключайтесь через «Мультиплеер» в игре.</p>
          </div>
        )}

        {tab === 'settings' && (
          <div className="card">
            <h2 style={{ marginBottom: 8 }}>Настройки</h2>
            <p className="muted">Язык интерфейса: Русский</p>
            <p className="muted" style={{ marginTop: 8 }}>
              Для новых версий Minecraft нужен Java 21+. Если игра не стартует — обновите Java (Adoptium Temurin).
            </p>
          </div>
        )}
      </main>

      {showCreate && (
        <CreateModal
          versions={versions}
          onClose={() => setShowCreate(false)}
          onOk={async (name, version, loader) => {
            setStatus(loader === 'fabric' ? 'Установка Fabric...' : 'Создание инстанса...');
            await window.api!.createInstance({ name, version, loader });
            setShowCreate(false);
            setStatus('Инстанс создан');
            refresh();
          }}
        />
      )}

      {showAcc && (
        <AccountModal
          onClose={() => setShowAcc(false)}
          onOk={async (name) => {
            await window.api!.addAccount(name);
            setShowAcc(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ModsTab({ instances }: { instances: any[] }) {
  const [inst, setInst] = useState(instances[0]?.name || '');
  const [q, setQ] = useState('sodium');
  const [hits, setHits] = useState<any[]>([]);
  const [mods, setMods] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!hasApi() || !inst) return;
    window.api!.listMods(inst).then(setMods).catch(() => setMods([]));
  }, [inst]);

  const search = async () => {
    setBusy(true);
    try {
      const r = await window.api!.searchMods(q);
      setHits(r.hits || []);
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const install = async (slug: string) => {
    if (!inst) return alert('Выберите инстанс');
    setBusy(true);
    setMsg('Установка ' + slug + '...');
    try {
      const r = await window.api!.installMod(inst, slug);
      setMsg('Установлено: ' + r.map((x) => x.title || x.filename).join(', '));
      setMods(await window.api!.listMods(inst));
    } catch (e: any) {
      setMsg(e.message);
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="top">
        <h2>Моды (Modrinth)</h2>
      </div>
      <div className="actions" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={inst} onChange={(e) => setInst(e.target.value)} style={{ width: 180 }}>
          <option value="">Инстанс</option>
          {instances.map((i) => <option key={i.id} value={i.name}>{i.name}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 160 }} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Название мода" />
        <button onClick={search} disabled={busy}>Найти</button>
      </div>
      {msg && <div className="status">{msg}</div>}
      <div className="split">
        <div>
          <h3 style={{ marginBottom: 8 }}>Результаты</h3>
          <div className="list">
            {hits.map((h) => (
              <div key={h.project_id} className="card">
                <span>{h.title}</span>
                <button disabled={busy || !inst} onClick={() => install(h.slug)}>Установить</button>
              </div>
            ))}
            {!hits.length && <p className="muted">Введите запрос и нажмите «Найти»</p>}
          </div>
        </div>
        <div>
          <h3 style={{ marginBottom: 8 }}>Установлено</h3>
          <div className="list">
            {mods.map((m) => (
              <div key={m.filename} className="card">
                <span style={{ fontSize: 13 }}>{m.filename}</span>
                <button className="danger" onClick={async () => {
                  await window.api!.removeMod(inst, m.filename);
                  setMods(await window.api!.listMods(inst));
                }}>✕</button>
              </div>
            ))}
            {!mods.length && <p className="muted">Пусто</p>}
          </div>
        </div>
      </div>
    </>
  );
}

function CreateModal({ versions, onClose, onOk }: any) {
  const [name, setName] = useState('Новый мир');
  const [version, setVersion] = useState(versions[0]?.id || '1.20.4');
  const [loader, setLoader] = useState('vanilla');
  const [busy, setBusy] = useState(false);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Создать инстанс</h3>
        <div className="field">
          <label>Название</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Версия Minecraft</label>
          <select value={version} onChange={(e) => setVersion(e.target.value)}>
            {versions.map((v: any) => <option key={v.id} value={v.id}>{v.id}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Лоадер</label>
          <select value={loader} onChange={(e) => setLoader(e.target.value)}>
            <option value="vanilla">Vanilla (без модов)</option>
            <option value="fabric">Fabric (моды Fabric)</option>
            <option value="forge">Forge (экспериментально)</option>
          </select>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Для модов выбирайте Fabric. Для очень новых версий MC нужен Java 21+.
        </p>
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>Отмена</button>
          <button disabled={busy || !name.trim()} onClick={async () => {
            setBusy(true);
            try { await onOk(name.trim(), version, loader); }
            catch (e: any) { alert(e.message || e); }
            finally { setBusy(false); }
          }}>{busy ? 'Создание...' : 'Создать'}</button>
        </div>
      </div>
    </div>
  );
}

function AccountModal({ onClose, onOk }: any) {
  const [name, setName] = useState('Игрок');
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Offline аккаунт</h3>
        <div className="field">
          <label>Ник</label>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && onOk(name.trim())} />
        </div>
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>Отмена</button>
          <button disabled={!name.trim()} onClick={() => onOk(name.trim())}>Добавить</button>
        </div>
      </div>
    </div>
  );
}
