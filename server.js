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

// --- Detail, pemantauan, dan penjelasan eksekusi ---------------------------

const TERMINAL_STATUSES = ['success', 'error', 'crashed', 'waiting'];

function executionWorkflowName(execution) {
  return (
    execution?.workflowName ||
    execution?.workflowData?.name ||
    (execution?.workflowId != null ? `Workflow ${execution.workflowId}` : 'Tanpa nama')
  );
}

// Ringkas runData n8n menjadi daftar node yang aman dikirim ke browser.
function extractRunNodes(execution) {
  const runData = execution?.data?.resultData?.runData;
  if (!runData || typeof runData !== 'object') return [];

  return Object.entries(runData).map(([name, runs]) => {
    const list = Array.isArray(runs) ? runs : [];
    const failed = list.find((run) => run?.error);
    const itemCount = list.reduce((total, run) => {
      const items = run?.data?.main?.[0];
      return total + (Array.isArray(items) ? items.length : 0);
    }, 0);
    const executionTime = list.reduce(
      (total, run) => total + (Number(run?.executionTime) || 0),
      0,
    );
    const startedRun = list.find((run) => run?.startTime);

    return {
      name,
      status: failed ? 'error' : 'success',
      itemCount,
      errorMessage: failed
        ? cleanMessage(failed.error?.message || failed.error)
        : '',
      startTime: startedRun?.startTime ?? null,
      executionTime,
    };
  });
}

const sendEvent = (res, event, data) => {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

app.get(
  '/api/executions/:id',
  proxyRoute(async (req, res) => {
    const id = encodeURIComponent(req.params.id);
    res.json(await callN8n(`/executions/${id}?includeData=true`));
  }),
);

// SSE: polling 2 detik sampai eksekusi selesai atau client menutup koneksi.
app.get('/api/executions/:id/stream', (req, res) => {
  const pathname = `/executions/${encodeURIComponent(req.params.id)}?includeData=true`;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': terhubung\n\n');

  let closed = false;
  let timer = null;

  const stop = () => {
    closed = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  req.on('close', stop);

  const poll = async () => {
    if (closed) return;

    try {
      const execution = await callN8n(pathname);
      if (closed) return;

      const status = execution?.status || 'unknown';
      const finished =
        Boolean(execution?.finished) || TERMINAL_STATUSES.includes(status);

      sendEvent(res, 'update', {
        id: execution?.id ?? req.params.id,
        status,
        startedAt: execution?.startedAt ?? null,
        stoppedAt: execution?.stoppedAt ?? null,
        workflowName: executionWorkflowName(execution),
        nodes: extractRunNodes(execution),
        finished,
      });

      if (finished) {
        sendEvent(res, 'done', { status });
        stop();
        res.end();
        return;
      }
    } catch (error) {
      if (closed) return;
      sendEvent(res, 'error', {
        message: error.message || 'Gagal memantau eksekusi.',
      });
      stop();
      res.end();
      return;
    }

    timer = setTimeout(poll, 2_000);
  };

  poll();
});

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'deepseek/deepseek-r1:free';

function buildLogPrompt({ nodes, workflowName, status }) {
  const details = (Array.isArray(nodes) ? nodes : []).map((node, index) => {
    const parts = [
      `${index + 1}. ${node?.name || 'langkah'}`,
      `status ${node?.status || 'tidak diketahui'}`,
      `durasi ${Math.round(Number(node?.executionTime) || 0)} ms`,
      `${Number(node?.itemCount) || 0} data diproses`,
    ];
    if (node?.errorMessage) parts.push(`error: ${node.errorMessage}`);
    return parts.join(', ');
  });

  return [
    'Kamu adalah asisten yang menjelaskan proses teknis workflow otomatisasi ke pengguna awam dalam Bahasa Indonesia yang ramah.',
    `Workflow: ${workflowName || 'tanpa nama'}`,
    `Status akhir: ${status || 'tidak diketahui'}`,
    `Data teknis tiap node: ${details.length ? details.join(' | ') : 'tidak ada data node'}`,
    'Tulis penjelasan singkat 3-4 kalimat dalam bahasa sehari-hari.',
    "Jangan sebut kata teknis seperti 'node', 'item', 'execution'.",
    'Kalau ada error, jelaskan dengan cara yang tidak menakutkan.',
  ].join('\n');
}

app.post(
  '/api/log/parse',
  express.json({ limit: '256kb' }),
  async (req, res) => {
    const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();

    if (!apiKey) {
      return res
        .status(503)
        .json({ error: 'OPENROUTER_API_KEY belum diisi di file .env.' });
    }

    const { nodes = [], workflowName = '', status = '' } = req.body ?? {};

    if (!Array.isArray(nodes)) {
      return res.status(400).json({ error: 'Body nodes harus berupa array.' });
    }

    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          max_tokens: 300,
          messages: [
            { role: 'user', content: buildLogPrompt({ nodes, workflowName, status }) },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      });

      const raw = await response.text();
      let payload = null;

      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        const detail =
          cleanMessage(payload?.error?.message) ||
          cleanMessage(payload?.error) ||
          cleanMessage(raw) ||
          response.statusText;
        return res
          .status(502)
          .json({ error: `OpenRouter (${response.status}): ${detail}` });
      }

      const explanation = payload?.choices?.[0]?.message?.content?.trim();
      if (!explanation) {
        return res
          .status(502)
          .json({ error: 'OpenRouter tidak mengembalikan penjelasan.' });
      }

      return res.json({ explanation });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        return res
          .status(504)
          .json({ error: 'OpenRouter melewati batas waktu 20 detik.' });
      }
      return res
        .status(502)
        .json({ error: `Gagal menghubungi OpenRouter: ${error.message}` });
    }
  },
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
