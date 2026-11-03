export type Module = 'swap' | 'help' | 'study' | 'aid';
export type Language = 'kk' | 'ru';
export type Status = 'open' | 'matched' | 'in_progress' | 'completed' | 'cancelled';
export type Metadata = {
  exchange?: string; date?: string; address?: string; lat?: number; lng?: number;
  hours?: string; access?: string; wifi?: boolean; sockets?: boolean; quiet?: boolean;
  needed?: number; organization?: string; reward?: number;
};
export interface Listing {
  id: string; owner_id: string; module: Module; title: string; description: string;
  category: string; city: string; district: string; status: Status;
  moderation: 'pending' | 'approved' | 'rejected'; created_at: string;
  metadata: Metadata; image_path?: string | null; image_url?: string | null; is_demo: boolean;
}
export interface Profile { id: string; name: string; city: string; language: Language; handle?: string;
  bio?: string; accent?: string; avatar?: string | null; cover?: string | null; wallpaper?: string | null;
  avatar_url?: string | null; cover_url?: string | null; wallpaper_url?: string | null;
  cover_kind?: 'image' | 'video'; wallpaper_kind?: 'image' | 'video'; followers?: number; following_count?: number; followed?: boolean;
}
export interface Conversation {
  id: string; listing_id: string; owner_id: string; responder_id: string;
  owner_confirmed: boolean; responder_confirmed: boolean; created_at: string;
  accepted: boolean; kind?: 'listing' | 'direct' | 'group'; title?: string; members?: string[];
  read_by?: Record<string,string>; read_sequence_by?: Record<string,number>;
}
export interface Message { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; kind?: 'text' | 'image' | 'video' | 'audio'; media_id?: string | null; media_url?: string | null; sequence?: number; waveform?:number[]; duration_ms?:number; client_id?:string; delivery?:'sending'|'failed' }
export interface Report { id: string; listing_id: string; reason: string; status: string; created_at: string }
export type NewListing = Omit<Listing, 'id' | 'owner_id' | 'status' | 'moderation' | 'created_at' | 'is_demo'>;
export const modules: Module[] = ['swap', 'help', 'study', 'aid'];
export const moduleInfo = {
  swap: { name: 'SwapX', color: '#DDEDE7', ink: '#245B4C', icon: 'repeat' },
  help: { name: 'Qasynda', color: '#FBE9D6', ink: '#986132', icon: 'heart-handshake' },
  study: { name: 'StudySpot', color: '#E7E4F5', ink: '#69608E', icon: 'book-open' },
  aid: { name: 'HelpLink', color: '#F8E1E5', ink: '#AE5F73', icon: 'gift' },
} as const;
export const districts = ['Есіл', 'Алматы', 'Сарыарқа', 'Байқоңыр', 'Нұра', 'Сарайшық'];
export const categories: Record<Module, string[]> = {
  swap: ['Кітаптар / Книги', 'Киім / Одежда', 'Электроника', 'Жиһаз / Мебель', 'Қызмет / Услуга'],
  help: ['Тұрмыс / Быт', 'Сатып алу / Покупки', 'Оқу / Учёба', 'Техника'],
  study: ['Кітапхана / Библиотека', 'Коворкинг', 'Оқу кеңістігі / Учебное пространство'],
  aid: ['Киім / Одежда', 'Азық-түлік / Продукты', 'Оқу құралдары / Школьные принадлежности', 'Еріктілік / Волонтёрство'],
};
