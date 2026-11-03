import { createPublicKey, generateKeyPairSync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const settingsFile = new URL('./.dev.vars', import.meta.url);
const config = JSON.parse(await readFile(new URL('./wrangler.jsonc', import.meta.url), 'utf8'));
const origin = config.vars.PUBLIC_ORIGIN;
try {
  await access(settingsFile);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const pem = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
  const settings = `OTP_SECRET=${randomBytes(32).toString('hex')}\nCONNECTION_PRIVATE_KEY="${pem.trimEnd()}"\n`;
  try { await writeFile(settingsFile, settings, { flag: 'wx', mode: 0o600 }); }
  catch (writeError) { if (writeError.code !== 'EEXIST') throw writeError; }
}
const { CONNECTION_PRIVATE_KEY, OTP_SECRET } = parseEnv(await readFile(settingsFile, 'utf8'));
if (!OTP_SECRET || !CONNECTION_PRIVATE_KEY) throw new Error('Incomplete local settings in scripts/local-web/.dev.vars');
const jwk = createPublicKey(CONNECTION_PRIVATE_KEY).export({ format: 'jwk' });
const publicKey = Buffer.from(jwk.x, 'base64url').toString('hex');
const html = new URL('../../dist/web-local/index.html', import.meta.url);
const built = await access(html).then(() => true, () => false);
if (!built || process.argv.includes('--build')) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../build-web.mjs', import.meta.url)), '--local'], {
    stdio: 'inherit', windowsHide: true,
    env: { ...process.env, BIRGE_WEB_AUTH_ORIGIN: origin, EXPO_PUBLIC_CONNECTION_KEY: publicKey },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Birge local: ${origin}/app/`);
