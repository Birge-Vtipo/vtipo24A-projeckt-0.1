export type BrowserVoiceFormat = { mime: 'audio/webm' | 'audio/mp4'; fileName: 'voice.webm' | 'voice.mp4' };

// Safari may fall back from the requested WebM format to MP4. Use the completed
// Blob's container, never the requested preset, when uploading its bytes.
export function browserVoiceFormat(type: string, prefix: Uint8Array): BrowserVoiceFormat | undefined {
  const mime = type.split(';', 1)[0].trim().toLowerCase();
  const webm = prefix.length >= 4 && prefix[0] === 0x1a && prefix[1] === 0x45 && prefix[2] === 0xdf && prefix[3] === 0xa3;
  const mp4 = prefix.length >= 8 && prefix[4] === 0x66 && prefix[5] === 0x74 && prefix[6] === 0x79 && prefix[7] === 0x70;
  if (webm && (!mime || mime === 'audio/webm')) return { mime: 'audio/webm', fileName: 'voice.webm' };
  if (mp4 && (!mime || ['audio/mp4', 'audio/m4a', 'audio/x-m4a'].includes(mime))) return { mime: 'audio/mp4', fileName: 'voice.mp4' };
  return undefined;
}

export function preferredBrowserVoiceMime(isSupported: (mime: string) => boolean) {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(mime => isSupported(mime));
}
