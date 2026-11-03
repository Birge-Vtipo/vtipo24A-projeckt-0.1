import { NewListing } from '../types';
export function countDescriptionWords(description: string) {
  return description.trim().split(/\s+/u).filter(token => /[\p{L}\p{N}]/u.test(token)).length;
}
export function validateListing(input: NewListing): string | null {
  if (input.title.trim().length < 5 || input.title.trim().length > 120) return 'Атауы / Название: 5–120';
  if (countDescriptionWords(input.description) < 5) return 'Сипаттама: кемінде 5 сөз / Описание: минимум 5 слов';
  if (input.description.trim().length > 4000) return 'Сипаттама: 4000 таңбаға дейін / Описание: до 4000 символов';
  if (!input.city.trim() || !input.district.trim() || !input.category.trim()) return 'Қала, аудан, санат / Город, район, категория';
  if (input.metadata.reward !== undefined && (input.module !== 'help' || !Number.isSafeInteger(input.metadata.reward) || input.metadata.reward < 100 || input.metadata.reward > 10000000)) return 'Сыйақы / Вознаграждение: 100–10 000 000 ₸';
  if (input.module === 'swap' && !input.metadata.exchange?.trim()) return 'Айырбас шартын жаз / Укажите условия обмена';
  if (input.metadata.date && (!/^\d{4}-\d{2}-\d{2}$/.test(input.metadata.date) || Number.isNaN(Date.parse(input.metadata.date)) || new Date(input.metadata.date).toISOString().slice(0, 10) !== input.metadata.date)) return 'Күн форматы / Формат даты: YYYY-MM-DD';
  if (input.module === 'study') {
    const { lat, lng, address, hours, access } = input.metadata;
    if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return 'Координаттарды тексер / Проверьте координаты';
    if (!address?.trim() || !hours?.trim() || !access?.trim()) return 'Мекенжай, уақыт, кіру шарттары / Адрес, часы и условия доступа';
  }
  if (input.module === 'aid' && (!Number.isInteger(input.metadata.needed) || input.metadata.needed! < 1 || input.metadata.needed! > 100000)) return 'Саны / Количество: 1–100000';
  return null;
}
export function filterListings(list: import('../types').Listing[], filters: { query?: string; module?: string; district?: string; onlyFavorites?: boolean; favorites?: string[]; wifi?: boolean; sockets?: boolean; quiet?: boolean }) {
  const query = (filters.query || '').trim().toLocaleLowerCase();
  return list.filter(item =>
    (!filters.module || filters.module === 'all' || item.module === filters.module) &&
    (!filters.district || filters.district === 'all' || item.district === filters.district) &&
    (!query || `${item.title} ${item.description} ${item.category} ${item.city}`.toLocaleLowerCase().includes(query)) &&
    (!filters.onlyFavorites || filters.favorites?.includes(item.id)) &&
    (!filters.wifi || item.metadata.wifi) && (!filters.sockets || item.metadata.sockets) && (!filters.quiet || item.metadata.quiet)
  ).sort((a, b) => b.created_at.localeCompare(a.created_at));
}
