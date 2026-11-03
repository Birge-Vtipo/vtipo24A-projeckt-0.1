import { generateKeyPairSync, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function connectionKey(privatePath) {
  await mkdir(privatePath, { recursive: true });
  const file = path.join(privatePath, 'connection-key.pem');
  let pem;
  try { pem = await readFile(file, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const generated = generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' });
    try { await writeFile(file, generated, { flag: 'wx', mode: 0o600 }); }
    catch (writeError) { if (writeError.code !== 'EEXIST') throw writeError; }
    pem = await readFile(file, 'utf8');
  }
  const key = createPrivateKey(pem);
  const publicKey = Buffer.from(createPublicKey(key).export({ format: 'jwk' }).x, 'base64url').toString('hex');
  return { key, publicKey };
}

export function signConnection(server, key, issued = Date.now()) {
  const url = new URL(server);
  if (url.protocol !== 'https:' || url.origin !== server || url.username || url.password) throw new Error('Invalid connection origin');
  const signature = sign(null, Buffer.from(`birge-connect-v1\n${server}\n${issued}`, 'ascii'), key).toString('hex');
  return { server, issued: String(issued), signature };
}

export function connectionDeepLink(proof) {
  return 'birge:///connect?' + new URLSearchParams(proof).toString();
}

export async function currentConnection(privatePath, key) {
  let server;
  try {
    // The stable gateway survives tunnel/Expo restarts. Do not depend on the
    // generated app-link file, which may not exist during APK-only recovery.
    const route = JSON.parse((await readFile(path.join(privatePath, 'worker-route.json'), 'utf8')).replace(/^\uFEFF/, ''));
    const url = new URL(route?.url);
    const workerHost = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){2,}workers\.dev$/;
    if (url.protocol !== 'https:' || url.origin !== route.url || url.username || url.password || url.port || !workerHost.test(url.hostname)) {
      throw new Error('Invalid Worker connection origin');
    }
    server = route.url;
  } catch (error) {
    // Only an absent gateway configuration means this is a legacy deployment.
    // Never hide malformed or unsafe configured origins by signing a stale link.
    if (error.code !== 'ENOENT') throw error;
    const link = JSON.parse((await readFile(path.join(privatePath, 'app-link.json'), 'utf8')).replace(/^\uFEFF/, ''));
    if (link.appId !== 'kz.birge.mobile') throw new Error('Unexpected application');
    server = link.authUrl;
  }
  const proof = signConnection(server, key);
  return { proof, url: server + '/connect', deepLink: connectionDeepLink(proof) };
}

export function connectionPage(deepLink) {
  // The link is generated from validated URLSearchParams, never request headers.
  const href = deepLink.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<!doctype html><html lang="kk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Birge — қосылу</title><style>body{font:18px/1.6 system-ui;background:#f3f6ef;color:#183e39;padding:32px;max-width:480px;margin:40px auto}a{display:block;background:#216d5c;color:white;padding:18px;border-radius:16px;text-decoration:none;text-align:center}small{color:#52675f}</style><h1>Birge-ге қосылу</h1><p>Қосылым автоматты түрде бапталады. Мекенжай енгізудің қажеті жоқ.</p><a href="${href}">Birge-де ашу</a><p><small>Android-та Birge 1.2.0 немесе жаңарақ нұсқасы орнатылған болуы керек. Батырма ашылмаса, осы бетті Chrome браузерінде аш.</small></p></html>`;
}
