'use client';

import Link from 'next/link';
import { ArrowRight, Plus, Users } from 'lucide-react';
import Listings, { listingCategories } from './Listings';

export default function Home() {
  return <>
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow">БІР ҚАЛА. МЫҢ МҮМКІНДІК.</div>
        <h1>Бірге болсақ,<br />бәрі мүмкін.</h1>
        <p>Бөлісетін зат, көмектесетін адам,<br />оқитын орын — бәрі осы жерде.</p>
        <Link className="button gold" href="/board"><ArrowRight size={22} />Мүмкіндіктерді қарау</Link>
      </div>
      <div className="hero-art" aria-hidden="true" />
    </section>
    <section className="services" aria-label="Birge қызметтері">
      {listingCategories.filter(category => category.id !== 'task').map(({ id, name, text, icon: Icon }) => (
        <Link className="card service" key={id} href={'/board?category=' + id}>
          <span className={'symbol ' + id}><Icon /></span><div><strong>{name}</strong><small>{text}</small></div>
        </Link>
      ))}
    </section>
    <div className="quick">
      <Link href="/people" className="button soft"><Users size={22} />Адамдарды табу</Link>
      <Link href="/create/task" className="button soft"><Plus size={21} />Ақылы тапсырма</Link>
    </div>
    <section><div className="section-heading"><h2>Хабарландырулар</h2><Link className="text-button" href="/board">Барлығын қарау<ArrowRight size={18} /></Link></div><p>Кішкентай әрекеттен үлкен жақсылық басталады.</p><Listings limit={4} /></section>
  </>;
}
