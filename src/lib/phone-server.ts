/** An operator supplies only the HTTPS origin, never credentials or URL paths. */
export function normalizePhoneServer(input: string): string {
  const text = input.trim();
  if (text.length > 300 || /[\s\\]/.test(text)) throw new Error('INVALID_CONFIG');
  let url: URL;
  try { url = new URL(text); } catch { throw new Error('INVALID_CONFIG'); }
  if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('INVALID_CONFIG');
  return url.origin;
}
