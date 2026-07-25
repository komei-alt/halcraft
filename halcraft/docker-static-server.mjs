import { createReadStream, promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, 'dist');
const acmeRootDir = process.env.ACME_WEBROOT ?? '/var/www/acme';
const acmeChallengePrefix = '/.well-known/acme-challenge/';
const port = Number.parseInt(process.env.PORT ?? '80', 10);

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.glb', 'model/gltf-binary'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

const immutableExtensions = new Set([
  '.css',
  '.gif',
  '.glb',
  '.ico',
  '.jpg',
  '.jpeg',
  '.js',
  '.png',
  '.svg',
  '.webmanifest',
  '.webp',
  '.woff',
  '.woff2',
]);

function toSafePath(urlPath) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    return null;
  }

  const normalizedPath = path.normalize(decodedPath).replace(/^[/\\]+/, '');
  const requestedPath = path.join(rootDir, normalizedPath);
  const relativePath = path.relative(rootDir, requestedPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }

  return requestedPath;
}

async function resolveAsset(urlPath) {
  const safePath = toSafePath(urlPath);

  if (!safePath) {
    return null;
  }

  try {
    const stats = await fs.stat(safePath);
    if (stats.isFile()) {
      return safePath;
    }
  } catch {
    // 存在しない SPA ルートは index.html にフォールバックする。
  }

  return path.join(rootDir, 'index.html');
}

async function resolveAcmeChallenge(urlPath) {
  const token = urlPath.slice(acmeChallengePrefix.length);

  // ACME HTTP-01 の token 以外は受け付けず、パストラバーサルと SPA fallback を防ぐ。
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    return null;
  }

  const challengeDir = path.join(acmeRootDir, '.well-known', 'acme-challenge');
  const challengePath = path.join(challengeDir, token);

  try {
    const stats = await fs.stat(challengePath);
    return stats.isFile() ? challengePath : null;
  } catch {
    return null;
  }
}

function setHeaders(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  response.setHeader('Content-Type', mimeTypes.get(extension) ?? 'application/octet-stream');

  if (path.basename(filePath) === 'index.html') {
    response.setHeader('Cache-Control', 'no-cache');
    return;
  }

  if (immutableExtensions.has(extension)) {
    response.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    response.writeHead(405);
    response.end('Method Not Allowed');
    return;
  }

  if (!request.url) {
    response.writeHead(400);
    response.end('Bad Request');
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
  const isAcmeChallenge = url.pathname.startsWith(acmeChallengePrefix);
  const filePath = isAcmeChallenge
    ? await resolveAcmeChallenge(url.pathname)
    : await resolveAsset(url.pathname);

  if (!filePath) {
    response.writeHead(isAcmeChallenge ? 404 : 403);
    response.end(isAcmeChallenge ? 'Not Found' : 'Forbidden');
    return;
  }

  setHeaders(response, filePath);
  if (isAcmeChallenge) {
    response.setHeader('Cache-Control', 'no-store');
  }

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  createReadStream(filePath)
    .on('error', () => {
      response.writeHead(500);
      response.end('Internal Server Error');
    })
    .pipe(response);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`HalCraft static server listening on port ${port}`);
});
