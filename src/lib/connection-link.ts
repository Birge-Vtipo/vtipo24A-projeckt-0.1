import nacl from 'tweetnacl';
import { normalizePhoneServer } from './phone-server';

export type ConnectionProof = { server: string; issued: string; signature: string };
function bytes(hex: string) { return Uint8Array.from(hex.match(/../g)!.map(value => parseInt(value, 16))); }
export function verifyConnection(value: unknown, publicKey: string, now = Date.now(), saved = false): ConnectionProof {
  if (!value || typeof value !== 'object') throw new Error('INVALID_CONNECTION');
  const { server, issued, signature } = value as ConnectionProof;
  if (typeof server !== 'string' || normalizePhoneServer(server) !== server ||
      typeof issued !== 'string' || !/^\d{13}$/.test(issued) ||
      typeof signature !== 'string' || !/^[a-f0-9]{128}$/.test(signature) || !/^[a-f0-9]{64}$/.test(publicKey)) throw new Error('INVALID_CONNECTION');
  const time = Number(issued);
  if (time > now + 300000 || (!saved && now - time > 86400000)) throw new Error('INVALID_CONNECTION');
  const message = Uint8Array.from(`birge-connect-v1\n${server}\n${issued}`, char => char.charCodeAt(0));
  if (!nacl.sign.detached.verify(message, bytes(signature), bytes(publicKey))) throw new Error('INVALID_CONNECTION');
  return { server, issued, signature };
}
