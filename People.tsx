'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, BriefcaseBusiness, CheckCircle2, Gift, Heart, HeartHandshake, MapPin, MessageCircle, Pencil, Repeat2, RotateCcw, Trash2 } from 'lucide-react';
import type { Action, Category, Listing } from '@/lib/types';
import { useBirge } from './Header';

export const listingCategories = [
  { id: 'swap' as Category, name: 'SwapX', text: 'Заттар мен қызметтер', icon: Repeat2, listing: 'Кітаптарды алмастырамын' },
  { id: 'help' as Category, name: 'Qasynda', text: 'Жақын жандарға көмек', icon: HeartHandshake, listing: 'Көршіге азық-түлік жеткізу' },
  { id: 'study' as Category, name: 'StudySpot', text: 'Оқуға жайлы орындар', icon: BookOpen, listing: 'Кітапханадағы тыныш оқу залы' },
  { id: 'aid' as Category, name: 'HelpLink', text: 'Игі іске бірге', icon: Gift, listing: 'Мектепке керек заттарды жинаймыз' },
  { id: 'task' as Category, name: 'Ақылы тапсырма', text: 'Істі бірге аяқтайық', icon: BriefcaseBusiness, listing: '' },
];

export function priceLabel(price: number) {
  return price === 0 ? 'Тегін' : new Intl.NumberFormat('kk-KZ').format(price) + ' ₸';
}

function ListingCard({ listing }: { listing: Listing }) {
  const { data, mutate } = useBirge();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const category = listingCategories.find(item => item.id === listing.category)!;
  const Icon = category.icon;
  const author = listing.ownerId === data?.profile.id ? data.profile : data?.people.find(person => person.id === listing.ownerId);
  const favorite = data?.favorites.includes(listing.id) ?? false;

  async function toggleFavorite() {
    setBusy(true);
    setError('');
    try { await mutate({ action: 'favorite', data: { id: listing.id, enabled: !favorite } }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Таңдаулыға сақтау мүмкін болмады.'); }
    finally { setBusy(false); }
  }

  return <article className="card listing listing-item">
    {listing.image && <Link className="listing-image-link" href={'/board?listing=' + listing.id} tabIndex={-1} aria-hidden="true"><img className="listing-image" src={listing.image} alt="" /></Link>}
    <div className="listing-top"><span className={'symbol ' + listing.category}><Icon /></span>
      <button type="button" className={'favorite-button' + (favorite ? ' selected' : '')} aria-label={favorite ? `${listing.title}: таңдаулыдан алып тастау` : `${listing.title}: таңдаулыға қосу`} aria-pressed={favorite} disabled={busy} onClick={toggleFavorite}><Heart size={20} fill={favorite ? 'currentColor' : 'none'} /></button>
    </div>
    <small>{category.name}{listing.status === 'completed' && <span className="listing-badge">Аяқталды</span>}</small>
    <h3><Link href={'/board?listing=' + listing.id}>{listing.title}</Link></h3>
    <p className="listing-excerpt">{listing.description}</p>
    <div className="listing-meta"><strong>{priceLabel(listing.price)}</strong><small><MapPin size={15} />{listing.city}</small></div>
    <small className="listing-author">{author?.name ?? 'Қатысушы'}{author?.isDemo && <span className="listing-badge">Үлгі</span>}</small>
    {error && <p className="form-error" role="alert">{error}</p>}
  </article>;
}

export default function Listings({ items, limit }: { items?: Listing[]; limit?: number }) {
  const { data, loading, error, refresh } = useBirge();
  if (loading && !data) return <p role="status">Хабарландырулар жүктелуде…</p>;
  if (!data) return <div className="card panel"><p role="alert">{error || 'Хабарландыруларды жүктеу мүмкін болмады.'}</p><button className="button soft" onClick={() => void refresh()}>Қайталау</button></div>;
  const rows = items ?? data.listings.filter(item => item.status === 'active').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const visible = limit ? rows.slice(0, limit) : rows;
  if (!visible.length) return <div className="card listing-empty"><h3>Хабарландыру табылмады</h3><p>Іздеу сөзін немесе сүзгілерді өзгертіп көр.</p><Link href="/create" className="button soft">Хабарландыру жариялау</Link></div>;
  return <div className="listing-grid">{visible.map(listing => <ListingCard key={listing.id} listing={listing} />)}</div>;
}

export function ListingDetail({ id }: { id: string }) {
  const { data, loading, error: loadError, mutate, refresh } = useBirge();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listing = data?.listings.find(item => item.id === id);
  if (loading && !data) return <p role="status">Хабарландыру жүктелуде…</p>;
  if (!data) return <div className="card panel"><p role="alert">{loadError || 'Хабарландыруды жүктеу мүмкін болмады.'}</p><button className="button soft" onClick={() => void refresh()}>Қайталау</button></div>;
  if (!listing) return <div className="card panel"><h1>Хабарландыру табылмады</h1><p>Хабарландыру жойылған немесе сілтемесі қате болуы мүмкін.</p><Link className="button soft" href="/board">Іздеуге оралу</Link></div>;
  const own = listing.ownerId === data.profile.id;
  const author = own ? data.profile : data.people.find(person => person.id === listing.ownerId);
  const category = listingCategories.find(item => item.id === listing.category)!;
  const Icon = category.icon;
  const favorite = data.favorites.includes(listing.id);

  async function perform(command: Action, after?: (id?: string) => void) {
    if (busy) return;
    setBusy(true);
    setError('');
    try { const result = await mutate(command); after?.(result.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Әрекетті орындау мүмкін болмады.'); }
    finally { setBusy(false); }
  }

  function remove() {
    if (!window.confirm('Бұл хабарландыруды біржола жою керек пе?')) return;
    void perform({ action: 'deleteListing', data: { id } }, () => router.push('/board?mine=1'));
  }

  return <>
    <Link className="text-button back-link" href="/board"><ArrowLeft size={18} />Хабарландыруларға оралу</Link>
    <article className="card listing-detail">
      {listing.image && <img className="detail-image" src={listing.image} alt={listing.title} />}
      <div className="detail-content"><div className="section-heading"><span className={'symbol ' + listing.category}><Icon /></span><span className="listing-badge">{listing.status === 'active' ? 'Белсенді' : 'Аяқталды'}</span></div>
        <p className="detail-category">{category.name}</p><h1>{listing.title}</h1><strong className="detail-price">{priceLabel(listing.price)}</strong>
        <p className="detail-location"><MapPin size={18} />{listing.city}, {listing.district}</p><p className="detail-description">{listing.description}</p>
        <small>Жарияланған күні: {new Intl.DateTimeFormat('kk-KZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(listing.createdAt))}</small>
        <div className="detail-author"><div><strong>{author?.name ?? 'Қатысушы'}</strong><small>{author?.handle}{own ? ' · Сенің хабарландыруың' : ''}</small></div>{author?.isDemo && <span className="listing-badge">Үлгі</span>}</div>
        {author?.isDemo && <small>Бұл — үлгі профиль. Автоматты жауап берілмейді.</small>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="listing-actions">
          {!own && <button className="button primary" type="button" disabled={busy} onClick={() => void perform({ action: 'conversation', data: { members: [listing.ownerId] } }, conversationId => { if (!conversationId) throw new Error('Чаттың мекенжайы алынбады. Қайталап көр.'); router.push('/chats?conversation=' + conversationId); })}><MessageCircle size={19} />Авторға жазу</button>}
          <button className="button soft" type="button" disabled={busy} aria-pressed={favorite} onClick={() => void perform({ action: 'favorite', data: { id, enabled: !favorite } })}><Heart size={19} fill={favorite ? 'currentColor' : 'none'} />{favorite ? 'Таңдаулыдан алу' : 'Таңдаулыға қосу'}</button>
          {own && <><Link className="button primary" href={'/create?edit=' + id}><Pencil size={18} />Өңдеу</Link><button className="button soft" type="button" disabled={busy} onClick={() => void perform({ action: 'listingStatus', data: { id, status: listing.status === 'active' ? 'completed' : 'active' } })}>{listing.status === 'active' ? <CheckCircle2 size={18} /> : <RotateCcw size={18} />}{listing.status === 'active' ? 'Аяқталды деп белгілеу' : 'Қайта ашу'}</button><button className="button danger-button" type="button" disabled={busy} onClick={remove}><Trash2 size={18} />Жою</button></>}
        </div>
        {busy && <p role="status">Өзгерістер сақталуда…</p>}
      </div>
    </article>
  </>;
}
