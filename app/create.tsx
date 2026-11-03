import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../src/store';
import { Button, Chip, Empty, Field, Notice, Row, Txt, useAction } from '../src/components/ui';
import { categories, districts, Metadata, Module, moduleInfo, modules, NewListing } from '../src/types';
import { supabase, unwrap } from '../src/lib/supabase';
import { uploadMedia } from '../src/lib/social-api';
import { countDescriptionWords, validateListing } from '../src/lib/validation';

export default function Create() {
  const app = useApp(), { t, colors } = app; const { edit, task, legacy } = useLocalSearchParams<{ edit?: string; task?: string; legacy?: string }>();
  const existing = app.listings.find(x => x.id === edit && x.owner_id === app.userId);
  const previous=app.legacyListings.find(x=>x.id===legacy), source=existing||previous;
  const [module, setModule] = useState<Module>(source?.module || (task ? 'help' : 'swap'));
  const [title, setTitle] = useState(source?.title || ''), [description, setDescription] = useState(source?.description || '');
  const descriptionWords = countDescriptionWords(description);
  const [district, setDistrict] = useState(source?.district || 'Есіл'), [category, setCategory] = useState(source?.category || (task ? categories.help[0] : categories.swap[0]));
  const [meta, setMeta] = useState<Metadata>(source?.metadata || {});
  const [latText, setLatText] = useState(String(source?.metadata.lat ?? '')), [lngText, setLngText] = useState(String(source?.metadata.lng ?? ''));
  const [photo, setPhoto] = useState<{ base64: string; mime: string; uri: string } | null>(null);
  const [imagePath, setImagePath] = useState(existing?.image_path);
  const { busy, run } = useAction();
  const change = (key: keyof Metadata, value: unknown) => setMeta(s => ({ ...s, [key]: value }));
  const selectModule = (m: Module) => { setModule(m); setCategory(categories[m][0]); setMeta({}); setLatText(''); setLngText(''); };
  async function choosePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('Фотоға рұқсат қажет / Разрешите доступ к фото');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: .75, base64: true });
    if (result.canceled) return;
    const asset = result.assets[0], mime = asset.mimeType || 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('JPEG, PNG немесе WebP / JPEG, PNG или WebP');
    if (!asset.base64 || asset.base64.length * .75 > 5 * 1024 * 1024) throw new Error('Фото ≤ 5 MB');
    setPhoto({ base64: asset.base64, mime, uri:asset.uri });
  }
  async function publish() {
    const metadata = module === 'study' ? { ...meta, lat: latText.trim() ? Number(latText) : undefined, lng: lngText.trim() ? Number(lngText) : undefined } : meta;
    const input: NewListing = { module, title: title.trim(), description: description.trim(), city: 'Астана', district, category, metadata, image_path: imagePath };
    const validation = validateListing(input); if (validation) throw new Error(validation);
    let uploaded: string | undefined;
    if (photo) {
      if (app.phoneAuthEnabled) input.image_path = (await uploadMedia(photo.uri,photo.mime,'listing')).id;
      else if (app.isDemo) input.image_path = `data:${photo.mime};base64,${photo.base64}`;
      else {
        uploaded = `${app.requireUser()}/${Date.now()}-${Math.random().toString(36).slice(2)}.${photo.mime.split('/')[1]}`;
        const buffer = Uint8Array.from(atob(photo.base64), c => c.charCodeAt(0)).buffer;
        unwrap(await supabase!.storage.from('listing-images').upload(uploaded, buffer, { contentType: photo.mime, upsert: false }));
        input.image_path = uploaded;
      }
    }
    try {
      const id = await app.saveListing(input, existing?.id); if(previous)app.markLegacyPublished(previous.id); app.setToast(t('published')); router.replace(`/listing/${id}`);
    } catch (error) { if (uploaded) await supabase!.storage.from('listing-images').remove([uploaded]); throw error; }
  }
  if (!app.userId) return <Empty title={t('needLogin')}><Button onPress={() => router.push('/auth')}>{t('login')}</Button></Empty>;
  if (edit && !existing) return <Empty title={t(app.loading ? 'loading' : 'empty')} />;
  return <View style={{ maxWidth: 780, width: '100%', alignSelf: 'center', gap: 24 }}>
    <View style={{ gap: 7 }}><Txt bold size={30}>{t('newListing')}</Txt><Txt color={colors.muted}>{t('newSub')}</Txt></View>
    {app.isDemo && <Notice>{t('demoNote')}</Notice>}
    {previous&&<Notice>{app.language==='kk'?'Бұрынғы мәтін толтырылды. Фотосын қажет болса қайта таңда. «Жариялау» басқаннан кейін басқа қолданушылар көреді.':'Прежний текст заполнен. При необходимости выберите фото заново. После нажатия «Опубликовать» запись увидят другие пользователи.'}</Notice>}
    <Row style={{ flexWrap: 'wrap' }}>{modules.map(m => <Chip active={module === m} key={m} icon={moduleInfo[m].icon} onPress={() => !existing && selectModule(m)}>{moduleInfo[m].name}</Chip>)}</Row>
    {module !== 'swap' && <Notice>{t(module === 'study' ? 'studyNotice' : module === 'help' ? 'helpNotice' : 'aidNotice')}</Notice>}
    <View style={{ padding: 24, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, gap: 22 }}>
      <Field label={t('title')} value={title} onChangeText={setTitle} maxLength={120} placeholder={moduleInfo[module].name} />
      <View style={{gap:7}}><Field label={t('description')} value={description} onChangeText={setDescription} multiline maxLength={4000} /><Txt size={12} color={description.trim()&&descriptionWords<5?colors.danger:colors.muted}>{app.language==='kk'?`Кемінде 5 сөз · ${descriptionWords}/5 сөз · ${description.length}/4000 таңба`:`Минимум 5 слов · ${descriptionWords}/5 слов · ${description.length}/4000 символов`}</Txt></View>
      <View style={{ gap: 10 }}><Txt bold size={13}>{t('category')}</Txt><Row style={{ flexWrap: 'wrap' }}>{categories[module].map(c => <Chip key={c} active={category === c} onPress={() => setCategory(c)}>{c}</Chip>)}</Row></View>
      <View style={{ gap: 10 }}><Txt bold size={13}>{t('city')} · {t('district')}</Txt><Row style={{ flexWrap: 'wrap' }}>{districts.map(d => <Chip key={d} active={district === d} onPress={() => setDistrict(d)}>{d}</Chip>)}</Row></View>
      {module === 'swap' && <Field label={t('exchange')} value={meta.exchange || ''} onChangeText={s => change('exchange', s)} maxLength={500} />}
      {module === 'help' && <><Field label={t('date')} value={meta.date || ''} onChangeText={s => change('date', s)} placeholder="2026-11-01" /><Field label={app.language==='kk'?'Сыйақы, ₸ (тегін көмек болса бос қалдыр)':'Вознаграждение, ₸ (пусто — бесплатная помощь)'} value={meta.reward===undefined?'':String(meta.reward)} onChangeText={s=>change('reward',s?Number(s):undefined)} keyboardType="number-pad" maxLength={8}/><Notice>{app.language==='kk'?'Төлем мен тапсырма шарттарын чатта орындаушымен келіс.':'Обсудите оплату и условия задания с исполнителем в чате.'}</Notice></>}
      {module === 'study' && <>
        <Field label={t('address')} value={meta.address || ''} onChangeText={s => change('address', s)} />
        <Row style={{ alignItems: 'flex-start' }}><Field label={t('latitude')} value={latText} onChangeText={setLatText} keyboardType="numbers-and-punctuation" placeholder="51.1282" /><Field label={t('longitude')} value={lngText} onChangeText={setLngText} keyboardType="numbers-and-punctuation" placeholder="71.4304" /></Row>
        <Field label={t('hours')} value={meta.hours || ''} onChangeText={s => change('hours', s)} placeholder="09:00–20:00" />
        <Field label={t('access')} value={meta.access || ''} onChangeText={s => change('access', s)} />
        <Row style={{ flexWrap: 'wrap' }}>{(['wifi', 'sockets', 'quiet'] as const).map(k => <Chip key={k} active={!!meta[k]} onPress={() => change(k, !meta[k])}>{t(k)}</Chip>)}</Row>
      </>}
      {module === 'aid' && <><Field label={t('organization')} value={meta.organization || ''} onChangeText={s => change('organization', s)} maxLength={120} /><Field label={t('needed')} value={meta.needed === undefined ? '' : String(meta.needed)} onChangeText={s => change('needed', s ? Number(s) : undefined)} keyboardType="number-pad" /></>}
      {photo && <Image source={{ uri: `data:${photo.mime};base64,${photo.base64}` }} style={{ height: 180, borderRadius: 12 }} resizeMode="cover" />}
      <Row style={{ flexWrap: 'wrap' }}><Button secondary icon="image" loading={busy} onPress={() => void run(choosePhoto)}>{t('photo')}</Button>{(photo || imagePath) && <Button secondary icon="x" onPress={() => { setPhoto(null); setImagePath(null); }}>{t('removePhoto')}</Button>}</Row>
    </View>
    <Row><Button icon="plus" loading={busy} style={{ flex: 1 }} onPress={() => void run(publish)}>{t(existing ? 'save' : 'publish')}</Button><Button secondary onPress={() => router.replace('/')}>{t('cancel')}</Button></Row>
  </View>;
}
