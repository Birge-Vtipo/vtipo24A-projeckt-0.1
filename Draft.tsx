'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, CheckCheck, MessageCircle, Plus, Send, Users, X } from 'lucide-react';
import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Conversation } from '@/lib/types';
import { useBirge } from './Header';
import { Avatar } from './People';

function formatTime(value: string) {
  return new Date(value).toLocaleString('kk-KZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function ChatsContent() {
  const { data, loading, error: connectionError, mutate, refresh } = useBirge();
  const router = useRouter();
  const requestedConversation = useSearchParams().get('conversation');
  const [composer, setComposer] = useState<'direct' | 'group' | null>(null);
  const [title, setTitle] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [personQuery, setPersonQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [readError, setReadError] = useState('');
  const readAttempts = useRef(new Set<string>());
  const messageList = useRef<HTMLDivElement>(null);
  const newChatButton = useRef<HTMLButtonElement>(null);

  const conversations = [...(data?.conversations || [])].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const selected = requestedConversation ? conversations.find(conversation => conversation.id === requestedConversation) : conversations[0];
  const selectedId = selected?.id || '';
  const messages = (data?.messages || []).filter(message => message.conversationId === selectedId).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const incomingUnread = messages.filter(message => !message.read && message.senderId !== data?.profile.id).map(message => message.id).join(',');
  const unread = selected?.unread || 0;
  const readKey = `${selectedId}:${incomingUnread}:${unread}`;

  useEffect(() => {
    setSendError(''); setReadError('');
  }, [selectedId]);
  useEffect(() => {
    const pane = messageList.current;
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [selectedId, messages.length]);
  useEffect(() => {
    if (!selectedId || (!unread && !incomingUnread)) return;
    function markVisibleRead() {
      if (document.visibilityState !== 'visible' || readAttempts.current.has(readKey)) return;
      readAttempts.current.add(readKey);
      void mutate({ action: 'readConversation', data: { id: selectedId } }).catch(problem => {
        setReadError(problem instanceof Error ? problem.message : 'Оқылғаны туралы белгі сақталмады.');
      });
    }
    markVisibleRead();
    document.addEventListener('visibilitychange', markVisibleRead);
    return () => document.removeEventListener('visibilitychange', markVisibleRead);
  }, [selectedId, unread, incomingUnread, readKey, mutate]);

  function startComposer(kind: 'direct' | 'group') {
    setComposer(kind); setMembers([]); setTitle(''); setPersonQuery(''); setCreateError('');
  }
  function closeComposer() { setComposer(null); newChatButton.current?.focus(); }
  async function createConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    if (composer === 'group' && members.length < 2) { setCreateError('Топқа өзіңізден басқа кемінде екі адамды таңдаңыз.'); return; }
    if (composer === 'direct' && members.length !== 1) { setCreateError('Хат жазатын адамды таңдаңыз.'); return; }
    if (composer === 'group' && !title.trim()) { setCreateError('Топтың атауын жазыңыз.'); return; }
    setCreating(true); setCreateError('');
    try {
      const result = await mutate({ action: 'conversation', data: { members, ...(composer === 'group' ? { title: title.trim() } : {}) } });
      if (!result.id) throw new Error('Чат құрылмады. Қайта көріңіз.');
      closeComposer(); router.push(`/chats?conversation=${encodeURIComponent(result.id)}`, { scroll: false });
    } catch (problem) { setCreateError(problem instanceof Error ? problem.message : 'Чат құру мүмкін болмады.'); }
    finally { setCreating(false); }
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || sending) return;
    const rawBody = drafts[selectedId] || '';
    const body = rawBody.trim();
    if (!body) { setSendError('Хабарлама мәтінін жазыңыз.'); return; }
    const conversationId = selectedId;
    setSending(true); setSendError('');
    try {
      await mutate({ action: 'message', data: { conversationId, body } });
      setDrafts(previous => ({ ...previous, [conversationId]: previous[conversationId] === rawBody ? '' : previous[conversationId] }));
    } catch (problem) { setSendError(problem instanceof Error ? problem.message : 'Хабарлама жіберілмеді. Мәтін сақталды, қайта көріңіз.'); }
    finally { setSending(false); }
  }
  async function retryRead() {
    if (!selectedId) return;
    setReadError('');
    try { await mutate({ action: 'readConversation', data: { id: selectedId } }); }
    catch (problem) { setReadError(problem instanceof Error ? problem.message : 'Оқылғаны туралы белгі сақталмады.'); }
  }

  if (!data) return <><h1>Хабарламалар</h1><section className="card social-empty">{loading ? <p role="status">Хабарламалар жүктелуде…</p> : <><p role="alert">{connectionError || 'Хабарламалар жүктелмеді.'}</p><button className="button soft" onClick={() => void refresh()}>Қайта жүктеу</button></>}</section></>;
  const people = data.people.filter(person => person.id !== data.profile.id);
  const personById = (id: string) => id === data.profile.id ? data.profile : people.find(person => person.id === id);
  const conversationName = (conversation: Conversation) => conversation.kind === 'group' ? conversation.title : personById(conversation.members.find(id => id !== data.profile.id) || '')?.name || conversation.title || 'Жеке чат';
  const selectedPeople = selected?.members.filter(id => id !== data.profile.id).map(personById).filter(person => Boolean(person)) || [];
  const selectedOther = selected?.kind === 'direct' ? selectedPeople[0] : undefined;
  const visiblePeople = people.filter(person => `${person.name} ${person.handle} ${person.city}`.toLocaleLowerCase().includes(personQuery.trim().toLocaleLowerCase()));

  return <div className="social-page">
    <header className="social-heading"><div><h1>Хабарламалар</h1><p>Жеке әңгімелер мен ортақ істерге арналған топтар.</p></div><div className="quick"><button ref={newChatButton} className="button soft" onClick={() => startComposer('direct')}><Plus size={18} />Жаңа чат</button><button className="button primary" onClick={() => startComposer('group')}><Users size={18} />Топ құру</button></div></header>
    {connectionError && <p className="social-error" role="alert">{connectionError}</p>}
    {composer && <section className="card social-chat-create" aria-labelledby="new-chat-title"><div className="social-heading"><h2 id="new-chat-title">{composer === 'group' ? 'Жаңа топ' : 'Жаңа жеке чат'}</h2><button className="social-icon-button" aria-label="Чат құруды жабу" disabled={creating} onClick={closeComposer}><X size={20} /></button></div><form className="draft profile-form" onSubmit={createConversation}>
      {composer === 'group' && <label>Топ атауы<input autoFocus required maxLength={80} value={title} disabled={creating} onChange={event => setTitle(event.target.value)} /></label>}
      <label>Адамдарды іздеу<input autoFocus={composer === 'direct'} type="search" placeholder="Аты, @аты немесе қаласы" value={personQuery} onChange={event => setPersonQuery(event.target.value)} /></label>
      <fieldset className="social-member-fieldset" disabled={creating}><legend>{composer === 'group' ? `Қатысушылар — ${members.length} адам таңдалды` : 'Бір адамды таңдаңыз'}</legend><div className="social-members">{visiblePeople.length ? visiblePeople.map(person => <label className="social-member" key={person.id}><input type={composer === 'group' ? 'checkbox' : 'radio'} name="chat-member" checked={members.includes(person.id)} onChange={event => setMembers(previous => composer === 'direct' ? [person.id] : event.target.checked ? [...previous, person.id] : previous.filter(id => id !== person.id))} /><Avatar person={person} /><span><strong>{person.name}</strong><small>{person.handle} · {person.city}</small></span>{person.isDemo && <span className="social-tag">Үлгі</span>}</label>) : <p>Адам табылмады.</p>}</div></fieldset>
      <small>{composer === 'group' ? 'Өзіңіз автоматты түрде қосыласыз. Кемінде тағы екі адам таңдаңыз. ' : ''}Үлгі профильдер автоматты жауап жібермейді.</small>
      {createError && <p className="social-error" role="alert">{createError}</p>}
      <div className="quick"><button className="button primary" type="submit" disabled={creating || (composer === 'group' ? members.length < 2 || !title.trim() : members.length !== 1)}>{creating ? 'Құрылуда…' : composer === 'group' ? 'Топты құру' : 'Чатты ашу'}</button><button className="button soft" type="button" disabled={creating} onClick={closeComposer}>Бас тарту</button></div>
    </form></section>}
    <div className="card chat-workspace"><aside className="chat-list" aria-label="Чаттар тізімі"><h2>Чаттар <span>{conversations.length}</span></h2>
      {conversations.length ? conversations.map(conversation => {
        const other = conversation.kind === 'direct' ? personById(conversation.members.find(id => id !== data.profile.id) || '') : undefined;
        const lastMessage = data.messages.filter(message => message.conversationId === conversation.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
        return <Link key={conversation.id} className={`chat-list-item${conversation.id === selectedId ? ' selected' : ''}`} href={`/chats?conversation=${encodeURIComponent(conversation.id)}`} scroll={false} aria-current={conversation.id === selectedId ? 'page' : undefined}>
          {other ? <Avatar person={other} /> : <span className="social-avatar"><Users size={23} /></span>}<div><strong>{conversationName(conversation)}</strong><small>{lastMessage ? `${lastMessage.senderId === data.profile.id ? 'Сіз: ' : ''}${lastMessage.body}` : 'Әңгімені бастаңыз'}</small>{other?.isDemo && <span className="social-tag">Үлгі</span>}</div>{conversation.unread > 0 && <span className="chat-unread" aria-label={`${conversation.unread} оқылмаған хабарлама`}>{conversation.unread}</span>}
        </Link>;
      }) : <div className="social-empty"><MessageCircle size={28} /><p>Әзірге чат жоқ.</p><button className="social-text-button" onClick={() => startComposer('direct')}>Алғашқы хатты жазу</button></div>}
    </aside>
    <section className="chat-conversation" aria-label="Ашық чат">
      {selected ? <><header className="chat-header">{selectedOther ? <Link className="social-person-title" href={`/profile?user=${encodeURIComponent(selectedOther.id)}`}><Avatar person={selectedOther} /><div><h2>{conversationName(selected)}</h2><small>{selectedOther.handle}</small></div></Link> : <div><h2>{conversationName(selected)}</h2><small>{selected.members.length} қатысушы</small></div>}
        {selected.kind === 'group' && <p className="chat-participants">{selected.members.map(id => personById(id)?.name || 'Қатысушы').join(', ')}</p>}
        {selectedPeople.some(person => person?.isDemo) && <small className="chat-demo-note">Үлгі қатысушылар бар. Олар автоматты түрде жауап бермейді.</small>}
      </header>
      <div ref={messageList} className="chat-messages" role="log" aria-label="Хабарламалар" aria-live="polite" aria-relevant="additions">
        {messages.length ? messages.map(message => <article className={`chat-message${message.senderId === data.profile.id ? ' outgoing' : ''}`} key={message.id}>
          {selected.kind === 'group' && message.senderId !== data.profile.id && <Link className="chat-message-author" href={`/profile?user=${encodeURIComponent(message.senderId)}`}>{personById(message.senderId)?.name || 'Қатысушы'}</Link>}
          <p>{message.body}</p><div className="chat-message-meta"><time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>{message.senderId === data.profile.id && <span>{message.read ? <CheckCheck size={14} /> : <Check size={14} />}{message.read ? 'Оқылды' : 'Жіберілді'}</span>}</div>
        </article>) : <div className="social-empty"><MessageCircle size={32} /><h3>Әңгімені бастаңыз</h3><p>Алғашқы хабарламаңызды жазыңыз.</p></div>}
      </div>
      {readError && <div className="chat-inline-error"><p className="social-error" role="alert">{readError}</p><button className="social-text-button" onClick={() => void retryRead()}>Қайта белгілеу</button></div>}
      <form className="chat-compose" onSubmit={send}><label className="social-sr-only" htmlFor="chat-body">Хабарлама мәтіні</label><textarea id="chat-body" rows={2} maxLength={4000} placeholder="Хабарлама жазыңыз…" value={drafts[selectedId] || ''} disabled={sending} onChange={event => { const body = event.target.value; setDrafts(previous => ({ ...previous, [selectedId]: body })); setSendError(''); }} /><button className="button primary" type="submit" aria-label={sending ? 'Жіберілуде…' : 'Жіберу'} disabled={sending || !(drafts[selectedId] || '').trim()}><Send size={18} /><span>{sending ? 'Жіберілуде…' : 'Жіберу'}</span></button>{sendError && <p className="social-error" role="alert">{sendError}</p>}</form>
      </> : <div className="social-empty"><MessageCircle size={40} /><h2>{requestedConversation ? 'Чат табылмады' : 'Бірге сөйлесейік'}</h2><p>{requestedConversation ? 'Чаттар тізімінен басқа әңгімені таңдаңыз.' : 'Жеке чат ашыңыз немесе жаңа топ құрыңыз.'}</p><Link className="button soft" href="/people">Адамдарды табу</Link></div>}
    </section></div>
  </div>;
}

export default function Chats() {
  return <Suspense fallback={<p role="status">Хабарламалар жүктелуде…</p>}><ChatsContent /></Suspense>;
}
