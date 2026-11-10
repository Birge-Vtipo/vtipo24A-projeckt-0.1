import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ActionResult, Category, Conversation, Listing, ListingInput, Message, Notice, Snapshot, UserProfile } from './types';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const CATEGORIES = new Set<Category>(['swap', 'help', 'study', 'aid', 'task']);
type Row = Record<string, string | number | null>;

export class LocalError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LocalError('Деректер пішімі дұрыс емес.');
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new LocalError(`${label}: мәтін енгізіңіз.`);
  const cleaned = value.trim();
  if (cleaned.length < min || cleaned.length > max) throw new LocalError(`${label}: ұзындығы ${min}–${max} таңба болуы керек.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(cleaned)) throw new LocalError(`${label}: жарамсыз таңбалар бар.`);
  return cleaned;
}

function identifier(value: unknown): string { return string(value, 'Идентификатор', 1, 80); }

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new LocalError('Таңдау мәні дұрыс емес.');
  return value;
}

function image(value: unknown): string {
  if (typeof value !== 'string') throw new LocalError('Сурет пішімі дұрыс емес.');
  if (!value) return '';
  if (value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 40) throw new LocalError('Сурет көлемі 2 МБ-тан аспауы керек.');
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) throw new LocalError('PNG, JPEG, WebP немесе GIF суретін таңдаңыз.');
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > MAX_IMAGE_BYTES || data.toString('base64') !== match[2]) throw new LocalError('Сурет деректері дұрыс емес немесе 2 МБ-тан асады.');
  const valid = match[1] === 'png' ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : match[1] === 'jpeg' ? data[0] === 255 && data[1] === 216 && data[2] === 255
      : match[1] === 'gif' ? /^GIF8[79]a$/.test(data.subarray(0, 6).toString('ascii'))
        : data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!valid) throw new LocalError('Суреттің түрі мен мазмұны сәйкес емес.');
  return value;
}

function listingInput(value: unknown): ListingInput {
  const data = record(value);
  const category = string(data.category, 'Санат', 1, 10) as Category;
  if (!CATEGORIES.has(category)) throw new LocalError('Хабарландыру санатын таңдаңыз.');
  const description = string(data.description, 'Сипаттама', 1, 4000);
  if (description.split(/\s+/u).filter(word => /[\p{L}\p{N}]/u.test(word)).length < 5) throw new LocalError('Сипаттама кемінде 5 сөзден тұруы керек.');
  if (typeof data.price !== 'number' || !Number.isSafeInteger(data.price) || data.price < 0 || data.price > 10_000_000) throw new LocalError('Баға 0–10 000 000 аралығындағы бүтін сан болуы керек.');
  return { category, title: string(data.title, 'Тақырып', 5, 120), description, city: string(data.city, 'Қала', 1, 60), district: string(data.district, 'Аудан', 1, 80), price: data.price, image: image(data.image) };
}

function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
function now(): string { return new Date().toISOString(); }

export class LocalStore {
  private db: DatabaseSync;

  constructor(filename: string) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    this.migrate();
  }

  close(): void { this.db.close(); }

  private migrate(): void {
    const version = Number((this.db.prepare('PRAGMA user_version').get() as Row).user_version);
    if (version > 1) throw new Error('Unsupported Birge database version; refusing to change existing data.');
    if (version < 1) this.transaction(() => {
      this.db.exec(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, handle TEXT NOT NULL COLLATE NOCASE UNIQUE,
          city TEXT NOT NULL, bio TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '',
          is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0,1)), created_at TEXT NOT NULL
        );
        CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL);
        CREATE TABLE listings (
          id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          category TEXT NOT NULL CHECK(category IN ('swap','help','study','aid','task')),
          title TEXT NOT NULL, description TEXT NOT NULL, city TEXT NOT NULL, district TEXT NOT NULL,
          price INTEGER NOT NULL CHECK(price >= 0 AND price <= 10000000), image TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed')),
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE INDEX listings_created ON listings(created_at DESC);
        CREATE TABLE favorites (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE, PRIMARY KEY(user_id,listing_id));
        CREATE TABLE follows (follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, followed_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(follower_id,followed_id), CHECK(follower_id <> followed_id));
        CREATE TABLE conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('direct','group')), direct_key TEXT UNIQUE, updated_at TEXT NOT NULL);
        CREATE TABLE conversation_members (conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(conversation_id,user_id));
        CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, sender_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE INDEX messages_conversation ON messages(conversation_id,created_at);
        CREATE TABLE message_receipts (message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, read_at TEXT, PRIMARY KEY(message_id,user_id));
        CREATE TABLE notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, text TEXT NOT NULL, href TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
        CREATE INDEX notifications_user ON notifications(user_id,created_at DESC);
        PRAGMA user_version = 1;
      `);
      this.seed();
    });
  }

  private transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  private seed(): void {
    const users = [
      ['demo-aya', 'Ая Сәрсен', '@aya_s', 'Астана', 'Кітап алмасуды және ауламыздағы игі істерді ұнатамын. Бұл — үлгі профиль.'],
      ['demo-daniyar', 'Данияр Әлім', '@daniyar_a', 'Алматы', 'Велосипед, жөндеу және көршілерге көмек. Бұл — үлгі профиль.'],
      ['demo-aigerim', 'Айгерім Нұр', '@aigerim_n', 'Шымкент', 'Студенттермен бірге оқуға және еріктілікке қызығамын. Бұл — үлгі профиль.'],
      ['demo-miras', 'Мирас Омар', '@miras_o', 'Қарағанды', 'Технологиялар мен шағын пайдалы тапсырмалар. Бұл — үлгі профиль.'],
      ['demo-saule', 'Сәуле Қанат', '@saule_k', 'Астана', 'Отбасыларға қажет заттарды бөлісемін. Бұл — үлгі профиль.'],
    ];
    const created = now();
    const insertUser = this.db.prepare('INSERT INTO users (id,name,handle,city,bio,is_demo,created_at) VALUES (?,?,?,?,?,1,?)');
    for (const user of users) insertUser.run(...user, created);
    const listings: [string, Category, string, string, string, string, number][] = [
      ['demo-aya', 'swap', 'Қазақша кітаптарды алмастырамын', 'Оқып болған үш кітабымды жаңа қызықты кітаптарға алмастырғым келеді.', 'Астана', 'Есіл ауданы', 0],
      ['demo-daniyar', 'swap', 'Қалалық велосипед', 'Жақсы сақталған велосипедті беремін, тежегіші мен дөңгелектері тексерілген.', 'Алматы', 'Бостандық ауданы', 45000],
      ['demo-saule', 'help', 'Көршіге азық-түлік әкелуге көмек', 'Демалыс күні дүкенге бірге барып, ауыр сөмкелерді тасуға көмектесемін.', 'Астана', 'Сарыарқа ауданы', 0],
      ['demo-daniyar', 'help', 'Сөрені құрастыруға көмектесемін', 'Үйдегі шағын сөрені құрастырып беремін, қажетті құралдарым өзімде бар.', 'Алматы', 'Әуезов ауданы', 3000],
      ['demo-aigerim', 'study', 'Ағылшын тілін бірге үйренейік', 'Аптасына екі рет кітапханада кездесіп, ағылшын тілінде сөйлесуді жаттықтырайық.', 'Шымкент', 'Әл-Фараби ауданы', 0],
      ['demo-aya', 'study', 'Математикадан жеке сабақ', 'Мектеп бағдарламасындағы қиын тақырыптарды бірге талдап, есеп шығаруды үйренеміз.', 'Астана', 'Алматы ауданы', 2500],
      ['demo-saule', 'aid', 'Мектеп сөмкесін тегін беремін', 'Таза әрі жақсы сақталған мектеп сөмкесін қажет отбасына беремін.', 'Астана', 'Байқоңыр ауданы', 0],
      ['demo-aigerim', 'aid', 'Аула тазалығына бірге шығайық', 'Сенбі күні көршілермен бірге ауладағы қоқысты жинауға еріктілер іздейміз.', 'Шымкент', 'Қаратау ауданы', 0],
      ['demo-miras', 'task', 'Компьютерді баптап беремін', 'Компьютердегі бағдарламаларды реттеп, күнделікті жұмысқа қажетті баптауларды орнатамын.', 'Қарағанды', 'Қазыбек би ауданы', 5000],
      ['demo-miras', 'task', 'Шағын мәтінді теріп беремін', 'Қолжазба мәтінді қазақша немесе орысша ұқыпты теріп, файлға түсіремін.', 'Қарағанды', 'Әлихан Бөкейхан ауданы', 1500],
    ];
    const insertListing = this.db.prepare('INSERT INTO listings (id,owner_id,category,title,description,city,district,price,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
    listings.forEach((listing, index) => {
      const timestamp = new Date(Date.now() - (index + 1) * 3600_000).toISOString();
      insertListing.run(`demo-listing-${index + 1}`, ...listing, timestamp, timestamp);
    });
  }

  session(token: string | undefined): { userId: string; token?: string } {
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
      const existing = this.db.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').get(hashToken(token)) as Row | undefined;
      if (existing) return { userId: String(existing.user_id) };
    }
    return this.transaction(() => {
      const userId = randomUUID();
      const newToken = randomBytes(32).toString('base64url');
      const short = userId.replace(/-/g, '').slice(0, 8);
      const created = now();
      this.db.prepare('INSERT INTO users (id,name,handle,city,bio,created_at) VALUES (?,?,?,?,?,?)').run(userId, `Қонақ ${short.slice(0, 4)}`, `@qonaq_${short}`, '', '', created);
      this.db.prepare('INSERT INTO sessions (token_hash,user_id,created_at) VALUES (?,?,?)').run(hashToken(newToken), userId, created);
      return { userId, token: newToken };
    });
  }

  private requireUser(userId: string): Row {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Row | undefined;
    if (!user) throw new LocalError('Профиль табылмады.', 404);
    return user;
  }

  private requireListing(id: string, ownerId?: string): Row {
    const listing = this.db.prepare('SELECT * FROM listings WHERE id = ?').get(id) as Row | undefined;
    if (!listing) throw new LocalError('Хабарландыру табылмады.', 404);
    if (ownerId && listing.owner_id !== ownerId) throw new LocalError('Тек өз хабарландыруыңызды өзгерте аласыз.', 403);
    return listing;
  }

  private requireConversation(id: string, userId: string): void {
    if (!this.db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(id, userId)) throw new LocalError('Бұл чатқа кіруге рұқсат жоқ.', 403);
  }

  private notice(userId: string, text: string, href: string): void {
    this.db.prepare('INSERT INTO notifications (id,user_id,text,href,created_at) VALUES (?,?,?,?,?)').run(randomUUID(), userId, text, href, now());
  }

  snapshot(userId: string): Snapshot {
    this.requireUser(userId);
    const people = (this.db.prepare(`SELECT u.*,
      (SELECT COUNT(*) FROM follows f WHERE f.followed_id = u.id) AS followers,
      (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) AS following,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followed_id = u.id) AS followed
      FROM users u ORDER BY u.is_demo DESC, u.created_at ASC, u.id ASC`).all(userId) as Row[]).map((row): UserProfile => ({
      id: String(row.id), name: String(row.name), handle: String(row.handle), city: String(row.city), bio: String(row.bio), avatar: String(row.avatar),
      isDemo: Boolean(row.is_demo), followers: Number(row.followers), following: Number(row.following), followed: Boolean(row.followed),
    }));
    const profile = people.find(person => person.id === userId)!;
    const listings = (this.db.prepare('SELECT * FROM listings ORDER BY created_at DESC, id DESC').all() as Row[]).map((row): Listing => ({
      id: String(row.id), ownerId: String(row.owner_id), category: row.category as Category, title: String(row.title), description: String(row.description), city: String(row.city), district: String(row.district), price: Number(row.price), image: String(row.image), status: row.status as Listing['status'], createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    }));
    const favorites = (this.db.prepare('SELECT listing_id FROM favorites WHERE user_id = ? ORDER BY listing_id').all(userId) as Row[]).map(row => String(row.listing_id));
    const conversations = (this.db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM message_receipts r JOIN messages m ON m.id = r.message_id WHERE m.conversation_id = c.id AND r.user_id = ? AND r.read_at IS NULL) AS unread
      FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id
      WHERE cm.user_id = ? ORDER BY c.updated_at DESC, c.id DESC`).all(userId, userId) as Row[]).map((row): Conversation => ({
      id: String(row.id), title: String(row.title), kind: row.kind as Conversation['kind'], unread: Number(row.unread), updatedAt: String(row.updated_at),
      members: (this.db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? ORDER BY user_id').all(String(row.id)) as Row[]).map(member => String(member.user_id)),
    }));
    const messages = (this.db.prepare(`SELECT m.*,
      CASE WHEN m.sender_id = ? THEN NOT EXISTS(SELECT 1 FROM message_receipts r WHERE r.message_id = m.id AND r.read_at IS NULL)
      ELSE EXISTS(SELECT 1 FROM message_receipts r WHERE r.message_id = m.id AND r.user_id = ? AND r.read_at IS NOT NULL) END AS is_read
      FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE cm.user_id = ? ORDER BY m.created_at ASC, m.rowid ASC`).all(userId, userId, userId) as Row[]).map((row): Message => ({
      id: String(row.id), conversationId: String(row.conversation_id), senderId: String(row.sender_id), body: String(row.body), createdAt: String(row.created_at), read: Boolean(row.is_read),
    }));
    const notifications = (this.db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 200').all(userId) as Row[]).map((row): Notice => ({ id: String(row.id), text: String(row.text), href: String(row.href), read: Boolean(row.is_read), createdAt: String(row.created_at) }));
    return { profile, people, listings, favorites, conversations, messages, notifications };
  }

  act(userId: string, input: unknown): ActionResult {
    const actor = this.requireUser(userId);
    const request = record(input);
    const action = string(request.action, 'Әрекет', 1, 40);
    const data = record(request.data);
    const id = this.transaction((): string | undefined => {
      switch (action) {
        case 'profile': {
          const name = string(data.name, 'Аты-жөні', 2, 60);
          const rawHandle = string(data.handle, 'Пайдаланушы аты', 3, 31).replace(/^@/, '');
          if (!/^[a-zA-Z0-9_.]{3,30}$/.test(rawHandle)) throw new LocalError('Пайдаланушы аты: 3–30 латын әрпі, сан, нүкте немесе төменгі сызық.');
          const handle = `@${rawHandle.toLowerCase()}`;
          if (this.db.prepare('SELECT 1 FROM users WHERE handle = ? COLLATE NOCASE AND id <> ?').get(handle, userId)) throw new LocalError('Бұл пайдаланушы аты бос емес.', 409);
          this.db.prepare('UPDATE users SET name = ?,handle = ?,city = ?,bio = ?,avatar = ? WHERE id = ?').run(name, handle, string(data.city, 'Қала', 1, 60), string(data.bio, 'Өзіңіз туралы', 0, 500), image(data.avatar), userId);
          break;
        }
        case 'createListing': {
          const value = listingInput(data);
          const listingId = randomUUID();
          const timestamp = now();
          this.db.prepare('INSERT INTO listings (id,owner_id,category,title,description,city,district,price,image,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(listingId, userId, value.category, value.title, value.description, value.city, value.district, value.price, value.image, timestamp, timestamp);
          return listingId;
        }
        case 'updateListing': {
          const listingId = identifier(data.id);
          this.requireListing(listingId, userId);
          const value = listingInput(data);
          this.db.prepare('UPDATE listings SET category = ?,title = ?,description = ?,city = ?,district = ?,price = ?,image = ?,updated_at = ? WHERE id = ? AND owner_id = ?').run(value.category, value.title, value.description, value.city, value.district, value.price, value.image, now(), listingId, userId);
          break;
        }
        case 'listingStatus': {
          const listingId = identifier(data.id);
          this.requireListing(listingId, userId);
          if (data.status !== 'active' && data.status !== 'completed') throw new LocalError('Хабарландыру күйі дұрыс емес.');
          this.db.prepare('UPDATE listings SET status = ?,updated_at = ? WHERE id = ? AND owner_id = ?').run(data.status, now(), listingId, userId);
          break;
        }
        case 'deleteListing': {
          const listingId = identifier(data.id);
          this.requireListing(listingId, userId);
          this.db.prepare('DELETE FROM listings WHERE id = ? AND owner_id = ?').run(listingId, userId);
          break;
        }
        case 'favorite': {
          const listingId = identifier(data.id);
          this.requireListing(listingId);
          if (boolean(data.enabled)) this.db.prepare('INSERT OR IGNORE INTO favorites (user_id,listing_id) VALUES (?,?)').run(userId, listingId);
          else this.db.prepare('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?').run(userId, listingId);
          break;
        }
        case 'follow': {
          const followedId = identifier(data.id);
          this.requireUser(followedId);
          if (followedId === userId) throw new LocalError('Өзіңізге жазыла алмайсыз.');
          if (boolean(data.enabled)) {
            const result = this.db.prepare('INSERT OR IGNORE INTO follows (follower_id,followed_id) VALUES (?,?)').run(userId, followedId);
            if (result.changes) this.notice(followedId, `${actor.name} сізге жазылды.`, `/profile?user=${encodeURIComponent(userId)}`);
          } else this.db.prepare('DELETE FROM follows WHERE follower_id = ? AND followed_id = ?').run(userId, followedId);
          break;
        }
        case 'conversation': {
          if (!Array.isArray(data.members) || data.members.length < 1 || data.members.length > 19) throw new LocalError('Чатқа 1–19 адам таңдаңыз.');
          const members = [...new Set([userId, ...data.members.map(identifier)])].sort();
          if (members.length < 2 || members.length > 20) throw new LocalError('Чатқа басқа қатысушы таңдаңыз.');
          members.forEach(member => this.requireUser(member));
          const title = data.title === undefined ? '' : string(data.title, 'Чат атауы', 0, 100);
          const kind = members.length === 2 && !title ? 'direct' : 'group';
          const directKey = kind === 'direct' ? members.join(':') : null;
          if (directKey) {
            const existing = this.db.prepare('SELECT id FROM conversations WHERE direct_key = ?').get(directKey) as Row | undefined;
            if (existing) return String(existing.id);
          }
          const conversationId = randomUUID();
          this.db.prepare('INSERT INTO conversations (id,title,kind,direct_key,updated_at) VALUES (?,?,?,?,?)').run(conversationId, kind === 'group' ? title || 'Топтық чат' : '', kind, directKey, now());
          const insertMember = this.db.prepare('INSERT INTO conversation_members (conversation_id,user_id) VALUES (?,?)');
          for (const member of members) insertMember.run(conversationId, member);
          return conversationId;
        }
        case 'message': {
          const conversationId = identifier(data.conversationId);
          this.requireConversation(conversationId, userId);
          const body = string(data.body, 'Хабарлама', 1, 4000);
          const messageId = randomUUID();
          const timestamp = now();
          this.db.prepare('INSERT INTO messages (id,conversation_id,sender_id,body,created_at) VALUES (?,?,?,?,?)').run(messageId, conversationId, userId, body, timestamp);
          this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(timestamp, conversationId);
          const members = this.db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ?').all(conversationId, userId) as Row[];
          for (const member of members) {
            const recipient = String(member.user_id);
            this.db.prepare('INSERT INTO message_receipts (message_id,user_id) VALUES (?,?)').run(messageId, recipient);
            this.notice(recipient, `${actor.name}: ${body.slice(0, 100)}${body.length > 100 ? '…' : ''}`, `/chats?conversation=${encodeURIComponent(conversationId)}`);
          }
          return messageId;
        }
        case 'readConversation': {
          const conversationId = identifier(data.id);
          this.requireConversation(conversationId, userId);
          this.db.prepare('UPDATE message_receipts SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND message_id IN (SELECT id FROM messages WHERE conversation_id = ?)').run(now(), userId, conversationId);
          this.db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND href = ?').run(userId, `/chats?conversation=${encodeURIComponent(conversationId)}`);
          break;
        }
        case 'readNotifications':
          if (Object.keys(data).length) throw new LocalError('Артық деректер берілген.');
          this.db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
          break;
        default: throw new LocalError('Бұл әрекетке қолдау көрсетілмейді.');
      }
      return undefined;
    });
    return { snapshot: this.snapshot(userId), ...(id ? { id } : {}) };
  }
}

export function getLocalStore(): LocalStore {
  const globalStore = globalThis as typeof globalThis & { birgeLocalStore?: LocalStore };
  if (!globalStore.birgeLocalStore) globalStore.birgeLocalStore = new LocalStore(process.env.BIRGE_DB_PATH || join(process.cwd(), 'private', 'birge.sqlite'));
  return globalStore.birgeLocalStore;
}
