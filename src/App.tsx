import React, { useCallback, useEffect, useState } from 'react';

declare global {
  interface Window {
    api?: {
      listAccounts: () => Promise<any[]>;
      addAccount: (name: string) => Promise<any>;
      removeAccount: (id: string) => Promise<void>;
      listInstances: () => Promise<any[]>;
      createInstance: (data: { name: string; version: string }) => Promise<any>;
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

type Tab = 'play' | 'accounts' | 'mods';

export default function App() {
  const [tab, setTab] = useState<Tab>('play');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
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
    const off1 = window.api!.onLog((line) => setLogs((p) => [...p.slice(-80), line]));
    const off2 = window.api!.onProgress((msg) => setStatus(msg));
    window.api!.getVersions().then((m) => {
      const list = (m?.versions || []).filter((v: any) => v.type === 'release').slice(0, 40);
      setVersions(list);
    }).catch(console.error);
    return () => { off1(); off2(); };
  }, [refresh]);

  const play = async (inst: any) => {
    if (!accountId) return alert('Добавь аккаунт');
    setBusy(true);
    setLogs([]);
    setStatus('Подготовка...');
    try {
      await window.api!.downloadVersion(inst.version);
      setStatus('Запуск...');
      const r = await window.api!.launch(inst.name, accountId);
      setLogs((p) => [...p, 'Запущено, pid=' + r.pid]);
      setStatus('Игра запущена');
    } catch (e: any) {
      setStatus('Ошибка');
      setLogs((p) => [...p, String(e.message || e)]);
      alert(e.message || e);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>BlockLauncher</h1>
        <div className="ver">v1.0.0</div>
        <button className={tab === 'play' ? 'active' : ''} onClick={() => setTab('play')}>Играть</button>
        <button className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}>Аккаунты</button>
        <button className={tab === 'mods' ? 'active' : ''} onClick={() => setTab('mods')}>Моды</button>
        {!hasApi() && <p className="muted" style={{ marginTop: 'auto', fontSize: 12 }}>Запусти через npm run dev</p>}
      </aside>

      <main className="content">
        {tab === 'play' && (
          <>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2>Инстансы</h2>
              <div className="row">
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ width: 160 }}>
                  <option value="">Аккаунт</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.username}</option>)}
                </select>
                <button onClick={() => setShowCreate(true)}>+ Создать</button>
              </div>
            </div>
            {status && <p className="muted" style={{ marginTop: 8 }}>{status}</p>}
            <div className="grid">
              {instances.map((inst) => (
                <div key={inst.id} className="card">
                  <h3>{inst.name}</h3>
                  <div style={{ margin: '8px 0' }}>
                    <span className="badge">{inst.version}</span>
                  </div>
                  <div className="row">
                    <button style={{ flex: 1 }} disabled={busy || !accountId} onClick={() => play(inst)}>
                      {busy ? '...' : 'Играть'}
                    </button>
                    <button className="danger" onClick={async () => {
                      if (confirm('Удалить ' + inst.name + '?')) {
                        await window.api!.deleteInstance(inst.name);
                        refresh();
                      }
                    }}>X</button>
                  </div>
                </div>
              ))}
            </div>
            {!instances.length && (
              <div className="card" style={{ marginTop: 16 }}>
                <p className="muted">Нет инстансов. Создай первый.</p>
                <button style={{ marginTop: 12 }} onClick={() => setShowCreate(true)}>Создать инстанс</button>
              </div>
            )}
            {!!logs.length && <div className="log">{logs.join('')}</div>}
          </>
        )}

        {tab === 'accounts' && (
          <>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2>Аккаунты (offline)</h2>
              <button onClick={() => setShowAcc(true)}>+ Добавить</button>
            </div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {accounts.map((a) => (
                <div key={a.id} className="card row" style={{ justifyContent: 'space-between' }}>
                  <strong>{a.username}</strong>
                  <button className="danger" onClick={async () => { await window.api!.removeAccount(a.id); refresh(); }}>Удалить</button>
                </div>
              ))}
              {!accounts.length && <p className="muted">Пока пусто</p>}
            </div>
          </>
        )}

        {tab === 'mods' && <Mods instances={instances} />}
      </main>

      {showCreate && (
        <CreateModal
          versions={versions}
          onClose={() => setShowCreate(false)}
          onOk={async (name, version) => {
            await window.api!.createInstance({ name, version });
            setShowCreate(false);
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

function Mods({ instances }: { instances: any[] }) {
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
    if (!inst) return alert('Выбери инстанс');
    setBusy(true);
    setMsg('Установка ' + slug + '...');
    try {
      const r = await window.api!.installMod(inst, slug);
      setMsg('Готово: ' + r.map((x) => x.title || x.filename).join(', '));
      setMods(await window.api!.listMods(inst));
    } catch (e: any) { setMsg(e.message); alert(e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <h2>Моды (Modrinth)</h2>
      <div className="row" style={{ marginTop: 12 }}>
        <select value={inst} onChange={(e) => setInst(e.target.value)} style={{ width: 180 }}>
          <option value="">Инстанс</option>
          {instances.map((i) => <option key={i.id} value={i.name}>{i.name}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button onClick={search} disabled={busy}>Найти</button>
      </div>
      {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}
      <div className="grid">
        <div>
          <h3 style={{ marginBottom: 8 }}>Поиск</h3>
          {hits.map((h) => (
            <div key={h.project_id} className="card row" style={{ marginBottom: 8, justifyContent: 'space-between' }}>
              <span>{h.title}</span>
              <button disabled={busy || !inst} onClick={() => install(h.slug)}>Установить</button>
            </div>
          ))}
        </div>
        <div>
          <h3 style={{ marginBottom: 8 }}>В инстансе</h3>
          {mods.map((m) => (
            <div key={m.filename} className="card row" style={{ marginBottom: 8, justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13 }}>{m.filename}</span>
              <button className="danger" onClick={async () => {
                await window.api!.removeMod(inst, m.filename);
                setMods(await window.api!.listMods(inst));
              }}>X</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function CreateModal({ versions, onClose, onOk }: any) {
  const [name, setName] = useState('My Instance');
  const [version, setVersion] = useState(versions[0]?.id || '1.21.1');
  const [busy, setBusy] = useState(false);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Новый инстанс</h2>
        <div className="field"><label>Название</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>Версия Minecraft</label>
          <select value={version} onChange={(e) => setVersion(e.target.value)}>
            {versions.map((v: any) => <option key={v.id} value={v.id}>{v.id}</option>)}
          </select>
        </div>
        <div className="actions">
          <button className="secondary" onClick={onClose}>Отмена</button>
          <button disabled={busy || !name.trim()} onClick={async () => {
            setBusy(true);
            try { await onOk(name.trim(), version); } catch (e: any) { alert(e.message); }
            finally { setBusy(false); }
          }}>{busy ? '...' : 'Создать'}</button>
        </div>
      </div>
    </div>
  );
}

function AccountModal({ onClose, onOk }: any) {
  const [name, setName] = useState('Player');
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Offline аккаунт</h2>
        <div className="field"><label>Ник</label>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && onOk(name.trim())} />
        </div>
        <div className="actions">
          <button className="secondary" onClick={onClose}>Отмена</button>
          <button disabled={!name.trim()} onClick={() => onOk(name.trim())}>Добавить</button>
        </div>
      </div>
    </div>
  );
}
