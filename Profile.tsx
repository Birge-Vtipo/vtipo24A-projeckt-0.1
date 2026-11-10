'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageCircle, Search, UserCheck, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import type { UserProfile } from '@/lib/types';
import { useBirge } from './Header';

export function Avatar({ person, large = false }: { person: Pick<UserProfile, 'name' | 'avatar'>; large?: boolean }) {
  const initials = person.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'B';
  return <span className={`social-avatar${large ? ' social-avatar-large' : ''}`} aria-hidden="true">
    {person.avatar ? <img src={person.avatar} alt="" /> : initials}
  </span>;
}

export default function People() {
  const { data, loading, error: connectionError, mutate, refresh } = useBirge();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [onlyFollowing, setOnlyFollowing] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function follow(id: string, enabled: boolean) {
    setBusy(id); setError('');
    try { await mutate({ action: 'follow', data: { id, enabled } }); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Жазылуды өзгерту мүмкін болмады.'); }
    finally { setBusy(''); }
  }
  async function message(id: string) {
    setBusy(id); setError('');
    try {
      const result = await mutate({ action: 'conversation', data: { members: [id] } });
      if (!result.id) throw new Error('Чат ашылмады. Қайта көріңіз.');
      router.push(`/chats?conversation=${encodeURIComponent(result.id)}`);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Чатты ашу мүмкін болмады.'); }
    finally { setBusy(''); }
  }

  if (!data) return <><h1>Адамдарды табу</h1><section className="card social-empty">
    {loading ? <p role="status">Адамдар жүктелуде…</p> : <><p role="alert">{connectionError || 'Адамдар тізімі жүктелмеді.'}</p><button className="button soft" onClick={() => void refresh()}>Қайта жүктеу</button></>}
  </section></>;
  const normalized = query.trim().toLocaleLowerCase();
  const people = [data.profile, ...data.people.filter(person => person.id !== data.profile.id)].filter(person =>
    (!onlyFollowing || person.followed) && `${person.name} ${person.handle} ${person.city}`.toLocaleLowerCase().includes(normalized));

  return <div className="social-page">
    <header className="social-heading"><div><h1>Адамдарды табу</h1><p>Ортақ қызығушылығы бар жандармен байланыс.</p></div><Users size={32} /></header>
    <div className="social-search-bar">
      <label className="social-search"><Search size={20} /><span className="social-sr-only">Аты, @аты немесе қала бойынша іздеу</span><input type="search" placeholder="Аты, @аты немесе қаласы" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <button className={`button ${onlyFollowing ? 'primary' : 'soft'}`} aria-pressed={onlyFollowing} onClick={() => setOnlyFollowing(value => !value)}><UserCheck size={18} />Жазылғандарым</button>
    </div>
    {(error || connectionError) && <p className="social-error" role="alert">{error || connectionError}</p>}
    <small role="status">{people.length} адам табылды</small>
    {people.length ? <div className="people-grid">{people.map(person => <article key={person.id} className="card social-person">
      <Link className="social-person-title" href={person.id === data.profile.id ? '/profile' : `/profile?user=${encodeURIComponent(person.id)}`}>
        <Avatar person={person} /><div><h2>{person.name}</h2><small>{person.handle} · {person.city}</small></div>
      </Link>
      <div className="social-person-tags">{person.id === data.profile.id && <span className="social-tag">Мен</span>}{person.isDemo && <span className="social-tag">Үлгі</span>}</div>
      <p className="social-person-bio">{person.bio || 'Өзі туралы әлі жазбаған.'}</p>
      <small>{person.followers} оқырман · {person.following} жазылым</small>
      <div className="quick">{person.id === data.profile.id ? <Link className="button soft" href="/profile">Менің профилім</Link> : <>
        <button className={`button ${person.followed ? 'soft' : 'primary'}`} disabled={Boolean(busy)} aria-pressed={person.followed} onClick={() => void follow(person.id, !person.followed)}>{person.followed ? <UserCheck size={18} /> : <UserPlus size={18} />}{busy === person.id ? 'Күте тұрыңыз…' : person.followed ? 'Жазылдым' : 'Жазылу'}</button>
        <button className="button soft" disabled={Boolean(busy)} onClick={() => void message(person.id)}><MessageCircle size={18} />Хат жазу</button>
      </>}</div>
    </article>)}</div> : <section className="card social-empty"><Users size={32} /><h2>Адам табылмады</h2><p>{onlyFollowing ? 'Жазылған адамдарды табу үшін сүзгіні немесе іздеу сөзін өзгертіңіз.' : 'Басқа ат, @аты немесе қаланы іздеп көріңіз.'}</p><button className="button soft" onClick={() => { setQuery(''); setOnlyFollowing(false); }}>Іздеуді тазарту</button></section>}
    <small>«Үлгі» белгісі бар профильдер танысуға арналған. Олар автоматты түрде жауап бермейді.</small>
  </div>;
}
