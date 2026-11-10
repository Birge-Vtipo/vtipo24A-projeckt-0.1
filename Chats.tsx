'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { Category, Listing } from '@/lib/types';
import { useBirge } from './Header';
import Listings, { ListingDetail, listingCategories } from './Listings';

export type ListingFilters = {
  q: string; category: Category | ''; city: string; min: string; max: string;
  status: 'active' | 'completed' | 'all'; sort: 'newest' | 'priceAsc' | 'priceDesc'; favorites: boolean; mine: boolean;
};

export const defaultFilters: ListingFilters = {
  q: '', category: '', city: '', min: '', max: '', status: 'active', sort: 'newest', favorites: false, mine: false,
};

export function readFilters(params: URLSearchParams): ListingFilters {
  const category = params.get('category') ?? '';
  const status = params.get('status') ?? '';
  const sort = params.get('sort') ?? '';
  return {
    q: params.get('q') ?? '',
    category: ['swap', 'help', 'study', 'aid', 'task'].includes(category) ? category as Category : '',
    city: params.get('city') ?? '', min: params.get('min') ?? '', max: params.get('max') ?? '',
    status: status === 'all' || status === 'completed' ? status : 'active',
    sort: sort === 'priceAsc' || sort === 'priceDesc' ? sort : 'newest',
    favorites: params.get('favorites') === '1', mine: params.get('mine') === '1',
  };
}

export function filtersQuery(filters: ListingFilters): string {
  const query = new URLSearchParams();
  for (const key of ['q', 'category', 'city', 'min', 'max'] as const) if (filters[key]) query.set(key, filters[key]);
  if (filters.status !== 'active') query.set('status', filters.status);
  if (filters.sort !== 'newest') query.set('sort', filters.sort);
  if (filters.favorites) query.set('favorites', '1');
  if (filters.mine) query.set('mine', '1');
  return query.toString();
}

export function filterListings(listings: Listing[], favorites: string[], filters: ListingFilters, ownerId?: string): Listing[] {
  const query = filters.q.trim().toLocaleLowerCase('kk-KZ');
  const min = filters.min.trim() === '' ? null : Number(filters.min);
  const max = filters.max.trim() === '' ? null : Number(filters.max);
  return listings.filter(item =>
    (!query || `${item.title} ${item.description} ${item.city}`.toLocaleLowerCase('kk-KZ').includes(query)) &&
    (!filters.category || item.category === filters.category) &&
    (!filters.city || item.city === filters.city) &&
    (min === null || !Number.isFinite(min) || item.price >= min) &&
    (max === null || !Number.isFinite(max) || item.price <= max) &&
    (filters.status === 'all' || item.status === filters.status) &&
    (!filters.favorites || favorites.includes(item.id)) &&
    (!filters.mine || item.ownerId === ownerId)
  ).sort((a, b) => {
    const priceDifference = filters.sort === 'priceAsc' ? a.price - b.price : filters.sort === 'priceDesc' ? b.price - a.price : 0;
    return priceDifference || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
  });
}

function BoardContent() {
  const { data } = useBirge();
  const params = useSearchParams();
  const query = params.toString();
  const [filters, setFilters] = useState(() => readFilters(new URLSearchParams(query)));
  useEffect(() => { setFilters(readFilters(new URLSearchParams(query))); }, [query]);
  const cities = [...new Set([...(data?.listings.map(item => item.city) ?? []), ...(filters.city ? [filters.city] : [])])].sort((a, b) => a.localeCompare(b, 'kk-KZ'));
  const rows = data ? filterListings(data.listings, data.favorites, filters, data.profile.id) : [];

  function update(patch: Partial<ListingFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    const search = filtersQuery(next);
    window.history.replaceState(null, '', '/board' + (search ? '?' + search : ''));
  }

  const listingId = params.get('listing');
  if (listingId) return <ListingDetail key={listingId} id={listingId} />;

  return <>
    <div className="section-heading"><div><h1>Іздеу</h1><p>Қаладағы заттар, көмек және оқуға жайлы орындар.</p></div><SlidersHorizontal aria-hidden="true" /></div>
    <section className="card board-filters" aria-label="Хабарландыру сүзгілері">
      <label className="filter-search"><span>Не іздеп жүрсің?</span><div className="search-field"><Search size={19} aria-hidden="true" /><input type="search" value={filters.q} onChange={event => update({ q: event.target.value })} placeholder="Атауы, сипаттамасы немесе қала" /></div></label>
      <div className="filter-fields">
        <label>Санат<select value={filters.category} onChange={event => update({ category: event.target.value as ListingFilters['category'] })}><option value="">Барлық санат</option>{listingCategories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
        <label>Қала<select value={filters.city} onChange={event => update({ city: event.target.value })}><option value="">Барлық қала</option>{cities.map(city => <option key={city}>{city}</option>)}</select></label>
        <label>Бағасы, бастап<input type="number" min="0" max="10000000" step="1" value={filters.min} onChange={event => update({ min: event.target.value })} placeholder="0 ₸" /></label>
        <label>Бағасы, дейін<input type="number" min="0" max="10000000" step="1" value={filters.max} onChange={event => update({ max: event.target.value })} placeholder="Кез келген" /></label>
        <label>Күйі<select value={filters.status} onChange={event => update({ status: event.target.value as ListingFilters['status'] })}><option value="active">Белсенді</option><option value="completed">Аяқталған</option><option value="all">Барлығы</option></select></label>
        <label>Реті<select value={filters.sort} onChange={event => update({ sort: event.target.value as ListingFilters['sort'] })}><option value="newest">Жаңалары алдымен</option><option value="priceAsc">Арзаннан қымбатқа</option><option value="priceDesc">Қымбаттан арзанға</option></select></label>
      </div>
      <div className="filter-actions"><label className="checkbox-label"><input type="checkbox" checked={filters.favorites} onChange={event => update({ favorites: event.target.checked })} />Тек таңдаулылар</label><label className="checkbox-label"><input type="checkbox" checked={filters.mine} onChange={event => update({ mine: event.target.checked })} />Менің хабарландыруларым</label><button type="button" className="text-button" onClick={() => update(defaultFilters)}><X size={17} />Сүзгілерді тазалау</button></div>
      {filters.min !== '' && filters.max !== '' && Number(filters.min) > Number(filters.max) && <p className="form-error" role="alert">Бастапқы баға соңғы бағадан аспауы керек.</p>}
    </section>
    <section aria-label="Іздеу нәтижелері"><div className="section-heading"><h2>Хабарландырулар</h2>{data && <p role="status" aria-live="polite">{rows.length} нәтиже</p>}</div><Listings items={rows} /></section>
  </>;
}

export default function Board() {
  return <Suspense fallback={<p role="status">Іздеу жүктелуде…</p>}><BoardContent /></Suspense>;
}
