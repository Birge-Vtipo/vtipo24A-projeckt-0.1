'use client';

import Link from 'next/link';
import { Suspense, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ImagePlus, Send, X } from 'lucide-react';
import type { Category, Listing, ListingInput } from '@/lib/types';
import { useBirge } from './Header';
import { listingCategories } from './Listings';

type FormFields = Omit<ListingInput, 'price'> & { price: string };
type Errors = Partial<Record<keyof FormFields, string>>;

function validate(fields: FormFields): Errors {
  const errors: Errors = {};
  if (fields.title.trim().length < 5 || fields.title.trim().length > 120) errors.title = 'Атау 5–120 таңбадан тұруы керек.';
  if (fields.description.trim().split(/\s+/).filter(Boolean).length < 5 || fields.description.trim().length > 4000) errors.description = 'Сипаттамаға кемінде 5 сөз жаз. Ең көбі — 4000 таңба.';
  if (!fields.city.trim() || fields.city.trim().length > 60) errors.city = 'Қаланы көрсет (60 таңбаға дейін).';
  if (!fields.district.trim() || fields.district.trim().length > 80) errors.district = 'Ауданды көрсет (80 таңбаға дейін).';
  const price = Number(fields.price);
  if (!fields.price.trim() || !Number.isInteger(price) || price < 0 || price > 10000000) errors.price = '0 мен 10 000 000 аралығындағы бүтін соманы жаз.';
  return errors;
}

function DraftForm({ existing, category, city }: { existing?: Listing; category: Category; city: string }) {
  const { mutate } = useBirge();
  const router = useRouter();
  const [fields, setFields] = useState<FormFields>(() => existing ? { ...existing, price: String(existing.price) } : { category, title: '', description: '', city, district: '', price: '0', image: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [readingImage, setReadingImage] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields(previous => ({ ...previous, [key]: value }));
    setErrors(previous => ({ ...previous, [key]: undefined }));
  }

  async function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setErrors(previous => ({ ...previous, image: 'PNG, JPEG, WebP немесе GIF таңда. Көлемі 2 МБ-тан аспауы керек.' }));
      event.target.value = '';
      return;
    }
    setReadingImage(true);
    setErrors(previous => ({ ...previous, image: undefined }));
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error());
        reader.onerror = () => reject(new Error());
        reader.onabort = () => reject(new Error());
        reader.readAsDataURL(file);
      });
      update('image', image);
    } catch { setErrors(previous => ({ ...previous, image: 'Суретті оқу мүмкін болмады. Басқа файл таңдап көр.' })); }
    finally { setReadingImage(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || readingImage) return;
    const nextErrors = validate(fields);
    setErrors(nextErrors);
    setError('');
    if (Object.keys(nextErrors).length) {
      setError('Белгіленген өрістерді тексеріп, қайта сақта.');
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setBusy(true);
    const input: ListingInput = {
      category: fields.category, title: fields.title.trim(), description: fields.description.trim(),
      city: fields.city.trim(), district: fields.district.trim(), price: Number(fields.price), image: fields.image,
    };
    try {
      const result = existing
        ? await mutate({ action: 'updateListing', data: { ...input, id: existing.id } })
        : await mutate({ action: 'createListing', data: input });
      const id = result.id ?? existing?.id;
      if (!id) throw new Error('Сақталған хабарландырудың мекенжайы алынбады. Іздеу бетін тексер.');
      router.push('/board?listing=' + id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Сақтау мүмкін болмады. Қайталап көр.');
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { setBusy(false); }
  }

  return <>
    <div><h1>{existing ? 'Хабарландыруды өңдеу' : 'Жариялау'}</h1><p>{existing ? 'Қажетті мәліметтерді өзгертіп, сақта.' : 'Өзіңдегі мүмкіндікпен бөліс немесе көмек сұра.'}</p></div>
    <form className="card panel draft listing-form" onSubmit={submit} noValidate aria-busy={busy}>
      {error && <p ref={errorRef} tabIndex={-1} className="form-error" role="alert">{error}</p>}
      <fieldset disabled={busy}>
        <label>Санат<select value={fields.category} onChange={event => update('category', event.target.value as Category)}>{listingCategories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Атауы<input value={fields.title} onChange={event => update('title', event.target.value)} required minLength={5} maxLength={120} placeholder="Хабарландырудың атауы" aria-invalid={!!errors.title} aria-describedby={errors.title ? 'title-error' : undefined} />{errors.title && <small className="form-error" id="title-error">{errors.title}</small>}</label>
        <label>Сипаттама<textarea value={fields.description} onChange={event => update('description', event.target.value)} rows={5} required maxLength={4000} placeholder="Не ұсынасың, кімге және қандай шартпен? Кемінде 5 сөз жаз." aria-invalid={!!errors.description} aria-describedby={errors.description ? 'description-error' : 'description-hint'} /><small id="description-hint">{fields.description.length} / 4000 таңба · кемінде 5 сөз</small>{errors.description && <small className="form-error" id="description-error">{errors.description}</small>}</label>
        <div className="form-pair"><label>Қала<input value={fields.city} onChange={event => update('city', event.target.value)} required maxLength={60} autoComplete="address-level2" placeholder="Астана" aria-invalid={!!errors.city} aria-describedby={errors.city ? 'city-error' : undefined} />{errors.city && <small className="form-error" id="city-error">{errors.city}</small>}</label>
          <label>Аудан<input value={fields.district} onChange={event => update('district', event.target.value)} required maxLength={80} placeholder="Есіл ауданы" aria-invalid={!!errors.district} aria-describedby={errors.district ? 'district-error' : undefined} />{errors.district && <small className="form-error" id="district-error">{errors.district}</small>}</label></div>
        <label>Бағасы, ₸<input value={fields.price} onChange={event => update('price', event.target.value)} type="number" required min="0" max="10000000" step="1" inputMode="numeric" aria-invalid={!!errors.price} aria-describedby={errors.price ? 'price-error' : 'price-hint'} /><small id="price-hint">Тегін болса, 0 деп көрсет.</small>{errors.price && <small className="form-error" id="price-error">{errors.price}</small>}</label>
        <label className="image-upload"><span><ImagePlus size={19} />Сурет (міндетті емес)</span><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={selectImage} disabled={readingImage} aria-invalid={!!errors.image} aria-describedby={errors.image ? 'image-error' : 'image-hint'} /><small id="image-hint">PNG, JPEG, WebP немесе GIF · 2 МБ-қа дейін</small>{errors.image && <small className="form-error" id="image-error" role="alert">{errors.image}</small>}</label>
        {readingImage && <p role="status">Сурет дайындалуда…</p>}
        {fields.image && <div className="draft-image"><img src={fields.image} alt="Хабарландыру суретінің алдын ала көрінісі" /><button type="button" className="text-button" onClick={() => { update('image', ''); if (fileRef.current) fileRef.current.value = ''; }}><X size={17} />Суретті алып тастау</button></div>}
        <div className="listing-actions"><button type="submit" className="button primary" disabled={busy || readingImage}><Send size={19} />{busy ? 'Сақталуда…' : existing ? 'Өзгерістерді сақтау' : 'Жариялау'}</button><Link className="button soft" href={existing ? '/board?listing=' + existing.id : '/board'}>Бас тарту</Link></div>
      </fieldset>
    </form>
  </>;
}

function DraftContent({ category }: { category: string }) {
  const { data, loading, error, refresh } = useBirge();
  const params = useSearchParams();
  const editId = params.get('edit');
  const initialCategory = listingCategories.find(item => item.id === category || item.name === category)?.id ?? 'swap';
  if (loading && !data) return <p role="status">Форма жүктелуде…</p>;
  if (!data) return <div className="card panel"><p role="alert">{error || 'Мәліметтерді жүктеу мүмкін болмады.'}</p><button className="button soft" onClick={() => void refresh()}>Қайталау</button></div>;
  const existing = editId ? data.listings.find(item => item.id === editId) : undefined;
  if (editId && (!existing || existing.ownerId !== data.profile.id)) return <div className="card panel"><h1>Өңдеу қолжетімсіз</h1><p>{existing ? 'Тек өз хабарландыруыңды өңдей аласың.' : 'Бұл хабарландыру табылмады.'}</p><Link className="button soft" href="/board">Хабарландыруларға оралу</Link></div>;
  return <DraftForm key={editId ?? initialCategory} existing={existing} category={initialCategory} city={data.profile.city} />;
}

export default function Draft({ category = 'swap' }: { category?: string }) {
  return <Suspense fallback={<p role="status">Форма жүктелуде…</p>}><DraftContent category={category} /></Suspense>;
}
