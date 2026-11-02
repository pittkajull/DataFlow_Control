import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const n8nBaseUrl = (process.env.N8N_URL || '').trim().replace(/\/+$/, '');
const n8nApiKey = (process.env.N8N_API_KEY || '').trim();
const dashUser = process.env.DASH_USER || 'admin';
const dashPass = process.env.DASH_PASS || '';
const port = Number.parseInt(process.env.PORT || '3000', 10);

// Jangan pernah menjalankan proxy tanpa kredensial yang lengkap.
const missingEnv = [
  !n8nBaseUrl && 'N8N_URL',
  !n8nApiKey && 'N8N_API_KEY',
  !dashPass && 'DASH_PASS',
].filter(Boolean);

if (missingEnv.length > 0) {
  console.error(`[DataFlow Control] Isi ${missingEnv.join(', ')} di file .env sebelum memulai.`);
  process.exit(1);
}

try {
  const parsedUrl = new URL(n8nBaseUrl);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error();
} catch {
  console.error('[DataFlow Control] N8N_URL harus berupa URL http(s) yang valid.');
  process.exit(1);
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('[DataFlow Control] PORT harus berupa angka 1-65535.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');

const hash = (value) => createHash('sha256').update(String(value)).digest();
const secretMatches = (given, expected) =>
  timingSafeEqual(hash(given), hash(expected));

// Basic Auth melindungi seluruh aplikasi, termasuk file statis dan endpoint proxy.
app.use((req, res, next) => {
  const authorization = req.headers.authorization || '';
  let authenticated = false;

  if (authorization.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      if (separator !== -1) {
        const user = decoded.slice(0, separator);
        const password = decoded.slice(separator + 1);
        authenticated = secretMatches(user, dashUser) && secretMatches(password, dashPass);
      }
    } catch {
      authenticated = false;
    }
  }

  if (authenticated) return next();

  res.set('WWW-Authenticate', 'Basic realm="DataFlow Control", charset="UTF-8"');
  return res.status(401).json({ error: 'Autentikasi diperlukan.' });
});

app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const N8N_API_BASE = `${n8nBaseUrl}/api/v1`;

function cleanMessage(value) {
  if (typeof value === 'string') return value.trim().slice(0, 500);
  if (!value) return '';
  return JSON.stringify(value).slice(0, 500);
}

// Satu pintu untuk memanggil n8n, termasuk menerjemahkan error HTTP-nya.
async function callN8n(pathname, options = {}) {
  let response;

  try {
    response = await fetch(`${N8N_API_BASE}${pathname}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'X-N8N-API-KEY': n8nApiKey,
        ...options.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error('Koneksi ke n8n melewati batas waktu 10 detik.');
    }
    throw new Error(`Tidak dapat terhubung ke n8n: ${error.message}`);
  }

  const rawBody = await response.text();
  let payload = null;

  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      if (response.ok) throw new Error('Respons n8n bukan JSON yang valid.');
    }
  }

  if (!response.ok) {
    const detail =
      cleanMessage(payload?.message) ||
      cleanMessage(payload?.error?.message) ||
      cleanMessage(payload?.error) ||
      cleanMessage(payload?.description) ||
      cleanMessage(rawBody) ||
      response.statusText;

    throw new Error(`n8n (${response.status}): ${detail}`);
  }

  return payload;
}

const proxyRoute = (handler) => (req, res) => {
  handler(req, res).catch((error) => {
    console.error(`[n8n] ${error.message}`);
    res.status(502).json({ error: error.message || 'Gagal menghubungi n8n.' });
  });
};

app.get(
  '/api/workflows',
  proxyRoute(async (_req, res) => {
    res.json(await callN8n('/workflows'));
  }),
);

app.post(
  '/api/workflows/:id/activate',
  proxyRoute(async (req, res) => {
    const id = encodeURIComponent(req.params.id);
    res.json(await callN8n(`/workflows/${id}/activate`, { method: 'POST' }));
  }),
);

app.post(
  '/api/workflows/:id/deactivate',
  proxyRoute(async (req, res) => {
    const id = encodeURIComponent(req.params.id);
    res.json(await callN8n(`/workflows/${id}/deactivate`, { method: 'POST' }));
  }),
);

app.get(
  '/api/executions',
  proxyRoute(async (req, res) => {
    const workflowId =
      typeof req.query.workflowId === 'string' ? req.query.workflowId.trim() : '';
    const filter = workflowId ? `&workflowId=${encodeURIComponent(workflowId)}` : '';
    res.json(await callN8n(`/executions?limit=20${filter}`));
  }),
);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint API tidak ditemukan.' });
});

// Static build disajikan setelah auth, jadi satu port cukup di production.
const distDir = path.join(__dirname, 'dist');
const indexFile = path.join(distDir, 'index.html');

app.use(express.static(distDir, { index: false }));

app.get('*', (_req, res, next) => {
  if (!existsSync(indexFile)) {
    return res
      .status(503)
      .type('text/plain')
      .send('Frontend belum dibangun. Jalankan "npm run build" terlebih dahulu.');
  }
  res.sendFile(indexFile, (error) => (error ? next(error) : undefined));
});

app.listen(port, () => {
  console.log(`[DataFlow Control] http://localhost:${port}`);
  console.log(`[DataFlow Control] n8n: ${n8nBaseUrl}`);
});
