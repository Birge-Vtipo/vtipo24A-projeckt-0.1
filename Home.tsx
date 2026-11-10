'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, HeartHandshake, House, Leaf, MapPin, MessageCircle, Moon, Plus, Search, Sun, UserRound, type LucideIcon } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Action, ActionResult, Snapshot } from '@/lib/types';


const links: [string, string, LucideIcon][] = [
  ['/', 'Басты бет', House], ['/board', 'Іздеу', Search],
  ['/chats', 'Хабарламалар', MessageCircle], ['/profile', 'Профиль', UserRound],
];

function Brand() {
  return <Link className="brand" href="/" aria-label="Birge басты беті"><i><Leaf /></i><b>birge<span>.</span></b></Link>;
}

function Publish() {
  return <Link href="/create" className="button primary"><Plus size={20} />Жариялау</Link>;
}

export default function Header() {
  const path = usePathname();
  const { data, error, refresh, mutate } = useBirge();
  const [dark, setDark] = useState(false);
  const [noticeError, setNoticeError] = useState('');
  const notices = data?.notifications ?? [];
  const unread = notices.filter(item => !item.read).length;
  const messages = data?.conversations.reduce((total, item) => total + item.unread, 0) ?? 0;
  useEffect(() => {
    let theme: string | null = null;
    try { theme = localStorage.getItem('birge.theme'); } catch {}
    const enabled = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    setDark(enabled); document.documentElement.classList.toggle('dark', enabled);
  }, []);
  function toggleTheme() {
    document.documentElement.classList.toggle('dark', !dark);
    try { localStorage.setItem('birge.theme', !dark ? 'dark' : 'light'); } catch {}
    setDark(!dark);
  }
  return <>
    <a className="skip-link" href="#content">Мазмұнға өту</a>
    <aside className="rail">
      <Brand />
      <div className="motto">ЖАҚСЫЛЫҚҚА БІР ҚАДАМ</div>
      <nav aria-label="Негізгі мәзір">{links.map(([url, label, Icon]) => (
        <Link key={url} href={url} aria-current={path === url ? 'page' : undefined}><Icon />{label}{url === '/chats' && messages > 0 && <span className="nav-count">{messages}</span>}</Link>
      ))}</nav>
      <Publish />
      <div className="trust"><HeartHandshake size={32} /><strong>Сенімнен басталады</strong>
        <small>Кездесуге қоғамдық орын таңда. Жеке деректеріңді ашық жариялама.</small></div>
    </aside>
    <header className="topbar">
      <Brand /><div className="location"><MapPin size={20} /><b>{data?.profile.city || 'Астана'}</b><span>/ Жақсылық жаныңда</span></div>
      <div className="tools">
        <details onToggle={event => {
          if (event.currentTarget.open && unread) void mutate({ action: 'readNotifications', data: {} })
            .then(() => setNoticeError('')).catch(failure => setNoticeError(failure.message));
        }}><summary className="circle" aria-label="Хабарландырулар"><Bell size={21} />{unread > 0 && <sup>{unread}</sup>}</summary>
          <div className="popup notices"><b>Хабарландырулар</b>
            {noticeError && <p role="alert">{noticeError}</p>}
            {!notices.length && <p>Жаңа хабарлама немесе жазылушы болса, осында көрінеді.</p>}
            {notices.map(notice => <Link key={notice.id} href={notice.href}>{notice.text}<small>{new Date(notice.createdAt).toLocaleString('kk-KZ')}</small></Link>)}
          </div>
        </details>
        <b className="language">ҚАЗ</b>
        <button className="circle" aria-label={dark ? 'Жарық тақырып' : 'Қараңғы тақырып'} aria-pressed={dark} onClick={toggleTheme}>{dark ? <Sun size={21} /> : <Moon size={21} />}</button>
        <Publish />
      </div>
    </header>
    {error && <div className="connection-error" role="alert"><span>{error}</span><button onClick={() => void refresh()}>Қайталау</button></div>}
  </>;
}

type SiteAction = (command?: Action) => Promise<ActionResult | { error: string }>;
type App = {
  data: Snapshot | null; loading: boolean; error: string;
  refresh: () => Promise<void>; mutate: (command: Action) => Promise<ActionResult>;
};
const AppContext = createContext<App | null>(null);

export function AppProvider({ children, action }: { children: ReactNode; action: SiteAction }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const actionRef = useRef(action);
  actionRef.current = action;
  const revision = useRef(0), pending = useRef(0), reading = useRef(false), initialized = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const initial = useRef<Promise<Snapshot> | null>(null);

  const request = useCallback(async (command?: Action) => {
    let result: Awaited<ReturnType<SiteAction>>;
    try { result = await actionRef.current(command); }
    catch { throw new Error('Жергілікті серверге қосылу мүмкін болмады. Серверді қосып, қайталап көр.'); }
    if ('error' in result) throw new Error(result.error);
    return result;
  }, []);

  const load = useCallback(async () => {
    let snapshot = (await request()).snapshot;
    if (!initialized.current) {
      try {
        const key = `birge.profile.migrated.${snapshot.profile.id}`;
        const raw = localStorage.getItem('birge.profile.v1');
        if (raw && !localStorage.getItem(key) && snapshot.profile.name.startsWith('Қонақ') && !snapshot.profile.bio) {
          const previous = JSON.parse(raw);
          if (['name', 'handle', 'city', 'bio'].every(field => typeof previous?.[field] === 'string')) {
            snapshot = (await request({ action: 'profile', data: {
              name: previous.name, handle: previous.handle, city: previous.city, bio: previous.bio, avatar: '',
            } })).snapshot;
            localStorage.setItem(key, '1');
          }
        }
      } catch { /* Preserve the old browser profile if migration is unavailable. */ }
    }
    return snapshot;
  }, [request]);

  const mutate = useCallback((command: Action) => {
    pending.current++; revision.current++;
    const work = queue.current.catch(() => {}).then(async () => {
      try {
        const result = await request(command);
        setData(result.snapshot); setError('');
        return result;
      } finally { pending.current--; }
    });
    queue.current = work;
    return work;
  }, [request]);

  const refresh = useCallback(async () => {
    if (reading.current || pending.current) return;
    reading.current = true;
    const version = revision.current;
    try {
      const snapshot = await load();
      if (version === revision.current) { initialized.current = true; setData(snapshot); setError(''); }
    } catch (failure) {
      if (version === revision.current) setError(failure instanceof Error ? failure.message : 'Деректер жүктелмеді.');
    } finally { reading.current = false; setLoading(false); }
  }, [load]);

  useEffect(() => {
    let active = true;
    reading.current = true;
    initial.current ??= load();
    void initial.current.then(snapshot => {
      if (active) { initialized.current = true; setData(snapshot); setError(''); }
    }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'Деректер жүктелмеді.'); })
      .finally(() => { reading.current = false; if (active) setLoading(false); });
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const poll = setInterval(visible, 4000);
    window.addEventListener('focus', visible);
    return () => { active = false; clearInterval(poll); window.removeEventListener('focus', visible); };
  }, [load, refresh]);

  return <AppContext.Provider value={{ data, loading, error, refresh, mutate }}>{children}</AppContext.Provider>;
}

export function useBirge() {
  const app = useContext(AppContext);
  if (!app) throw new Error('AppProvider is required');
  return app;
}
