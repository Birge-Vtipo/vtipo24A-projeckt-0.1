import { spawn } from 'node:child_process';
import { cp, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const distRoot = path.join(projectRoot, 'dist');
const localBuild = process.argv.includes('--local');
const outputRoot = path.join(distRoot, localBuild ? 'web-local' : 'web');
const productionOrigin = 'https://birge-api.birge-app.workers.dev';
const require = createRequire(import.meta.url);

function authOrigin(input = productionOrigin) {
  if (typeof input !== 'string' || /[\s\\]/.test(input)) throw new Error('Invalid browser API origin.');
  let url;
  try { url = new URL(input); } catch { throw new Error('Invalid browser API origin.'); }
  if (input !== url.origin || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use an API origin without paths, credentials, queries or fragments.');
  }
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.origin !== productionOrigin && !local) throw new Error('API override is restricted to a local QA server.');
  return url.origin;
}

function insideDist(target) {
  const resolved = path.resolve(target);
  const relative = path.relative(distRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid build output path.');
  return resolved;
}

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symlinks are not allowed in browser assets.');
    if (entry.isDirectory()) files.push(...await filesUnder(filename));
    else if (entry.isFile()) files.push(filename);
    else throw new Error('Unexpected browser asset type.');
  }
  return files;
}

function publicAsset(relative) {
  // Expo-generated browser resources only. Never publish arbitrary repository,
  // credential, database, native binary, environment or source-map files.
  const segments = relative.split('/');
  if (segments.some(segment => segment.startsWith('.') || segment === 'private')) return false;
  if (/\.map$/i.test(relative) || /\.(?:pem|key|p12|p8|sqlite(?:-.*)?|db(?:-.*)?|apk|aab|exe|ps1|mjs|tsx?|jsx)$/i.test(relative)) return false;
  if (!/^(?:index\.html|favicon\.ico|(?:assets|_expo)\/)/.test(relative)) return false;
  return /\.(?:html|js|css|json|png|jpe?g|webp|gif|svg|ico|ttf|otf|woff2?|mp4|webm|mp3|m4a|wav)$/i.test(relative);
}

async function run() {
  const publicKey = process.env.EXPO_PUBLIC_CONNECTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(publicKey)) throw new Error('EXPO_PUBLIC_CONNECTION_KEY must contain the existing 64-character public verification key.');
  const origin = authOrigin(process.env.BIRGE_WEB_AUTH_ORIGIN || productionOrigin);
  if (localBuild && !origin.startsWith('http://')) throw new Error('A local web build requires a loopback HTTP origin.');
  const expoCli = require.resolve('expo/bin/cli');
  const temporaryRoot = insideDist(path.join(distRoot, '.web-export-' + randomUUID()));
  const stagedRoot = insideDist(path.join(distRoot, '.web-stage-' + randomUUID()));
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name.toUpperCase().startsWith('EXPO_PUBLIC_') || ['EXPO_BASE_URL', 'EXPO_PACKAGER_PROXY_URL'].includes(name.toUpperCase())) delete env[name];
  }
  Object.assign(env, {
    BIRGE_WEB_BASE_PATH: '/app',
    EXPO_PUBLIC_WHATSAPP_AUTH_URL: origin,
    EXPO_PUBLIC_CONNECTION_KEY: publicKey.toLowerCase(),
    EXPO_PUBLIC_WEB_GUEST: '1',
    EXPO_NO_DOTENV: '1',
    EXPO_NO_TELEMETRY: '1',
    EXPO_OFFLINE: '1',
    CI: '1',
    NODE_ENV: 'production',
  });
  await mkdir(distRoot, { recursive: true });
  if ((await lstat(distRoot)).isSymbolicLink()) throw new Error('Browser output parent must not be a symlink.');
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [expoCli, 'export', '--platform', 'web', '--output-dir', temporaryRoot], {
        cwd: projectRoot, env, stdio: 'inherit', windowsHide: true,
      });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error('Expo web export failed (exit ' + code + ').')));
    });
    await mkdir(stagedRoot);
    const exported = await filesUnder(temporaryRoot);
    let count = 0;
    for (const filename of exported) {
      const relative = path.relative(temporaryRoot, filename).split(path.sep).join('/');
      if (!publicAsset(relative)) {
        if (/\.map$/i.test(relative) || relative === 'metadata.json') continue;
        throw new Error('Unexpected file in browser export: ' + relative);
      }
      const destination = path.join(stagedRoot, ...relative.split('/'));
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(filename, destination, { dereference: false, force: false, errorOnExist: true });
      count++;
    }
    const htmlPath = path.join(stagedRoot, 'index.html');
    const html = (await readFile(htmlPath, 'utf8'))
      .replace('<html lang="en">', '<html lang="kk">')
      .replace('<title>Birge</title>', '<title>Birge — бірге болу оңай</title><meta name="description" content="Birge: жарияланымдар, адамдар және чаттар. Қызметтерді тіркелусіз қолдан."><meta name="theme-color" content="#393185">')
      .replace('You need to enable JavaScript to run this app.', 'Birge-ні қолдану үшін браузерде JavaScript қосыңыз.');
    if (!/<script\b[^>]*\bsrc=["']\/app\//i.test(html)) throw new Error('Browser export does not use the /app resource prefix.');
    await writeFile(htmlPath, html, 'utf8');
    const existing = await lstat(outputRoot).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (existing?.isSymbolicLink()) throw new Error('Browser output must not be a symlink.');
    if (existing) await rm(insideDist(outputRoot), { recursive: true });
    await rename(stagedRoot, outputRoot);
    console.log(`Birge browser build ready: ${outputRoot} (${count} files; /app; no source maps).`);
  } finally {
    await rm(insideDist(temporaryRoot), { recursive: true, force: true });
    await rm(insideDist(stagedRoot), { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error.message); process.exitCode = 1; });
