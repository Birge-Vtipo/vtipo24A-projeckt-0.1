// Only the authoritative API handle is rendered publicly. Never derive one from
// a name, phone, UUID or client cache: uniqueness belongs to the server.
export function publicHandle(value?: string | null) {
  return value && /^[a-z0-9_]{3,24}$/.test(value) ? '@' + value : undefined;
}
export function profileShareText(handle: string) {
  const visible = publicHandle(handle);
  if (!visible) throw new Error('Профиль аты жүктелмеді / Имя профиля не загружено');
  return 'Birge · ' + visible;
}
