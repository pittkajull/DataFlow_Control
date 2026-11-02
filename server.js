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
const n8nEmail = (process.env.N8N_EMAIL || '').trim();
const n8nPassword = process.env.N8N_PASSWORD || '';
const dashUser = process.env.DASH_USER || 'admin';
const dashPass = process.env.DASH_PASS || '';
const port = Number.parseInt(process.env.PORT || '3000', 10);
const sseClients = new Set();

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
    const status =
      typeof req.query.status === 'string' ? req.query.status.trim() : '';

    const params = new URLSearchParams({ limit: '20' });
    if (workflowId) params.set('workflowId', workflowId);
    if (status) params.set('status', status);

    res.json(await callN8n(`/executions?${params}`));
  }),
);

// --- Detail, pemantauan, dan penjelasan eksekusi ---------------------------

const TERMINAL_STATUSES = ['success', 'error', 'crashed', 'waiting', 'canceled'];

function executionWorkflowName(execution) {
  return (
    execution?.workflowName ||
    execution?.workflowData?.name ||
    (execution?.workflowId != null ? `Workflow ${execution.workflowId}` : 'Tanpa nama')
  );
}

const workflowCache = new Map();

// Definisi workflow disimpan sementara agar polling tidak memanggil n8n tiap 2 detik.
async function loadWorkflow(workflowId) {
  if (!workflowId) return { name: '', nodes: [], connections: {} };

  const cached = workflowCache.get(workflowId);
  if (cached && Date.now() - cached.at < 30_000) return cached;

  const data = await callN8n(`/workflows/${encodeURIComponent(workflowId)}`);
  const entry = {
    at: Date.now(),
    name: data?.name || '',
    nodes: Array.isArray(data?.nodes) ? data.nodes : [],
    connections:
      data?.connections && typeof data.connections === 'object'
        ? data.connections
        : {},
  };

  workflowCache.set(workflowId, entry);
  return entry;
}

function urlHost(value) {
  try {
    return new URL(String(value)).host;
  } catch {
    return '';
  }
}

function fileNameOf(value) {
  const text = String(value || '');
  return text.split(/[\\/]/).filter(Boolean).pop() || text;
}

// Nama berkas yang masih berisi ekspresi n8n tidak layak ditampilkan.
function safeFileName(value) {
  const raw = String(value || '');
  if (!raw || raw.includes('{{') || raw.startsWith('=')) return '';
  return fileNameOf(raw);
}

const NODE_PLAIN_TEXT = {
  'n8n-nodes-base.manualTrigger': 'Pemicu manual memulai seluruh rangkaian langkah.',
  'n8n-nodes-base.scheduleTrigger': 'Pemicu jadwal memulai rangkaian langkah.',
  'n8n-nodes-base.cron': 'Pemicu jadwal memulai rangkaian langkah.',
  'n8n-nodes-base.webhook': 'Menunggu panggilan dari aplikasi lain untuk memulai proses.',
  'n8n-nodes-base.respondToWebhook': 'Membalas permintaan yang masuk.',
  'n8n-nodes-base.httpRequest': 'Mengirim permintaan ke layanan luar dan menunggu balasan.',
  'n8n-nodes-base.code': 'Mengolah data di dalam workflow.',
  'n8n-nodes-base.function': 'Mengolah data di dalam workflow.',
  'n8n-nodes-base.if': 'Memeriksa syarat lalu memilih jalur lanjutan.',
  'n8n-nodes-base.switch': 'Memeriksa syarat lalu memilih jalur lanjutan.',
  'n8n-nodes-base.filter': 'Menyaring data agar hanya yang sesuai yang lanjut.',
  'n8n-nodes-base.set': 'Menata ulang data sebelum langkah berikutnya.',
  'n8n-nodes-base.transform': 'Menata ulang data sebelum langkah berikutnya.',
  'n8n-nodes-base.merge': 'Menggabungkan beberapa jalur data.',
  'n8n-nodes-base.readBinaryFile': 'Membaca berkas dari penyimpanan.',
  'n8n-nodes-base.writeBinaryFile': 'Menyimpan berkas ke penyimpanan.',
  'n8n-nodes-base.readWriteFile': 'Membaca dan menulis berkas di penyimpanan.',
  'n8n-nodes-base.executeCommand': 'Menjalankan perintah di server.',
  'n8n-nodes-base.executeWorkflow': 'Memanggil workflow lain untuk mengerjakan bagian ini.',
  'n8n-nodes-base.wait': 'Menunggu jeda waktu sebelum melanjutkan.',
  'n8n-nodes-base.stopAndError': 'Menghentikan proses bila terjadi masalah.',
  'n8n-nodes-base.noOp': 'Langkah kosong, dilewati.',
  'n8n-nodes-base.openAi': 'Meminta AI membantu memproses data.',
  'n8n-nodes-base.slack': 'Mengirim pesan ke Slack.',
  'n8n-nodes-base.telegram': 'Mengirim pesan ke Telegram.',
  'n8n-nodes-base.discord': 'Mengirim pesan ke Discord.',
  'n8n-nodes-base.gmail': 'Mengirim email.',
  'n8n-nodes-base.emailSend': 'Mengirim email.',
  'n8n-nodes-base.googleSheets': 'Membaca atau menulis data di spreadsheet.',
  'n8n-nodes-base.notion': 'Membaca atau menulis data di Notion.',
  'n8n-nodes-base.airtable': 'Membaca atau menulis data di Airtable.',
};

function fallbackPlainText(type) {
  const t = String(type || '');
  if (/trigger|webhook/i.test(t)) return 'Pemicu yang memulai workflow.';
  if (/http|request|api/i.test(t)) return 'Berkomunikasi dengan layanan luar.';
  if (/code|function/i.test(t)) return 'Mengolah data di dalam workflow.';
  if (/if|switch|filter/i.test(t)) return 'Memeriksa syarat lalu memilih jalur lanjutan.';
  if (/file|disk|read|write/i.test(t)) return 'Membaca atau menulis berkas.';
  if (/slack|telegram|discord|mail|sms/i.test(t)) return 'Mengirim pesan ke penerima.';
  if (/sheet|table|database|mongo|postgres|mysql/i.test(t))
    return 'Membaca atau menyimpan data.';
  if (/wait|sleep/i.test(t)) return 'Menunggu jeda sebelum melanjutkan.';
  return 'Menjalankan langkah workflow.';
}

// Penjelasan singkat berbahasa sehari-hari untuk satu langkah workflow.
function explainNode(node) {
  const type = node?.type || '';
  const params = node?.parameters || {};
  let text = NODE_PLAIN_TEXT[type] || fallbackPlainText(type);

  if (type === 'n8n-nodes-base.httpRequest') {
    const host = urlHost(params.url);
    if (host) {
      text = /openrouter|openai|anthropic|gemini|groq|claude/i.test(host)
        ? `Meminta AI di ${host} menganalisis data.`
        : `Mengirim permintaan ke ${host} dan menunggu balasan.`;
    }
  } else if (type === 'n8n-nodes-base.readBinaryFile') {
    const file = safeFileName(params.fileSelector || params.fileName);
    if (file) text = `Membaca berkas ${file}.`;
  } else if (type === 'n8n-nodes-base.writeBinaryFile') {
    const file = safeFileName(params.fileName || params.fileSelector);
    if (file) text = `Menyimpan berkas ${file}.`;
  } else if (type === 'n8n-nodes-base.readWriteFile') {
    const file = safeFileName(params.fileSelector || params.fileName);
    if (file) text = `Membaca dan menulis berkas ${file}.`;
  } else if (type === 'n8n-nodes-base.executeCommand') {
    const command = String(params.command || '');
    const downloads = /yt-dlp|youtube-dl|ytdl/i.test(command);
    const cuts = /ffmpeg/i.test(command);

    if (downloads && cuts) {
      text = 'Mengunduh lalu memotong video.';
    } else if (downloads) {
      text = 'Mengunduh video dari internet.';
    } else if (cuts) {
      text = 'Memotong dan mengolah video.';
    } else if (/\bcurl\b|\bwget\b/i.test(command)) {
      text = 'Mengambil data dari layanan luar.';
    } else if (command && !command.includes('{{') && !command.startsWith('=')) {
      const binary = command.trim().split(/\s+/)[0];
      if (binary && !SHELL_KEYWORDS.has(binary.toLowerCase())) {
        text = `Menjalankan ${binary} di server.`;
      }
    }
  }

  return text;
}

const ACTIVE_RUN_STATES = new Set(['running', 'new', 'waiting', 'unknown']);

// Kata kunci shell bukan nama program, jangan ditampilkan sebagai executable.
const SHELL_KEYWORDS = new Set([
  'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done',
  'case', 'esac', 'function', 'echo', 'cd', 'export', 'set', 'eval', 'exit',
  'return', 'local', 'read', 'source', '.', '{', '}',
]);

// Gabungkan definisi workflow + runData menjadi status tiap langkah.
function buildNodeStates(execution, workflow) {
  const runData = execution?.data?.resultData?.runData || {};
  const finished =
    Boolean(execution?.finished) ||
    TERMINAL_STATUSES.includes(execution?.status || '');

  let definition = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  if (definition.length === 0) {
    // Definisi tidak terbaca: pakai nama langkah yang sudah terekam.
    definition = Object.keys(runData).map((name) => ({
      name,
      type: '',
      parameters: {},
    }));
  }

  const items = definition.map((node) => {
    const runs = Array.isArray(runData[node.name]) ? runData[node.name] : [];
    let status = 'pending';
    let itemCount = 0;
    let executionTime = 0;
    let startTime = null;
    let errorMessage = '';

    if (runs.length > 0) {
      const failed = runs.find(
        (run) =>
          run?.error || ['error', 'crashed'].includes(run?.executionStatus),
      );
      const active = runs.find(
        (run) =>
          ACTIVE_RUN_STATES.has(run?.executionStatus) ||
          (run?.executionTime == null && !run?.error),
      );

      status = failed ? 'error' : active && !finished ? 'running' : 'success';
      if (failed) errorMessage = cleanMessage(failed.error?.message || failed.error);

      for (const run of runs) {
        itemCount += Array.isArray(run?.data?.main?.[0])
          ? run.data.main[0].length
          : 0;
        executionTime += Number(run?.executionTime) || 0;
        if (
          run?.startTime != null &&
          (startTime == null || run.startTime < startTime)
        ) {
          startTime = run.startTime;
        }
      }
    }

    return {
      name: node.name,
      type: node.type,
      status,
      itemCount,
      errorMessage,
      startTime,
      executionTime,
      explanation: explainNode(node),
    };
  });

  if (finished) {
    for (const item of items) {
      if (item.status === 'running') item.status = 'success';
    }
  }

  const current = items.find((item) => item.status === 'running') || null;
  const completed = items.filter(
    (item) => item.status === 'success' || item.status === 'error',
  ).length;

  let currentStatus = current ? 'running' : null;

  // Bila n8n belum menulis runData node berikutnya, tebak dari koneksi graph.
  if (!current && !finished) {
    const incoming = new Map();
    for (const [source, outputs] of Object.entries(workflow.connections || {})) {
      for (const group of outputs?.main || []) {
        for (const link of group || []) {
          if (!incoming.has(link.node)) incoming.set(link.node, []);
          incoming.get(link.node).push(source);
        }
      }
    }

    const done = (name) => {
      const item = items.find((entry) => entry.name === name);
      return item && (item.status === 'success' || item.status === 'error');
    };

    const next = items.find(
      (item) =>
        item.status === 'pending' &&
        (incoming.get(item.name) || []).some(done),
    );

    if (next) {
      currentStatus = 'next';
      items.currentNext = next;
    }
  }

  const nextItem = items.currentNext || null;
  delete items.currentNext;

  const rank = { running: 0, success: 1, error: 1, pending: 2 };
  const ordered = [...items].sort((a, b) => {
    const diff = rank[a.status] - rank[b.status];
    if (diff !== 0) return diff;
    if (a.status === 'pending' && b.status === 'pending') return 0;
    return (a.startTime || 0) - (b.startTime || 0);
  });

  return {
    nodes: ordered,
    progress: {
      total: items.length,
      completed,
      percent: items.length
        ? Math.round((completed / items.length) * 100)
        : 0,
      currentName: (current || nextItem)?.name || null,
      currentExplanation: (current || nextItem)?.explanation || null,
      currentStatus,
    },
  };
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

      let workflow = { name: '', nodes: [], connections: {} };
      try {
        workflow = await loadWorkflow(execution?.workflowId);
      } catch {
        // Definisi gagal dimuat: tampilkan apa adanya dari runData.
      }

      const { nodes, progress } = buildNodeStates(execution, workflow);

      sendEvent(res, 'update', {
        id: execution?.id ?? req.params.id,
        status,
        startedAt: execution?.startedAt ?? null,
        stoppedAt: execution?.stoppedAt ?? null,
        workflowName: executionWorkflowName(execution) || workflow.name,
        nodes,
        progress,
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
const OPENROUTER_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';

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

const workflowLogs = new Map();

app.post('/api/log/ingest', express.json(), (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { workflowName, nodeName, message, status } = req.body || {};
  if (!workflowName || !nodeName || !message) {
    return res.status(400).json({ error: 'workflowName, nodeName, message wajib diisi.' });
  }
  const entry = { nodeName, message, status: status || 'running', timestamp: new Date().toISOString() };
  if (!workflowLogs.has(workflowName)) workflowLogs.set(workflowName, []);
  const logs = workflowLogs.get(workflowName);
  logs.push(entry);
  if (logs.length > 100) logs.splice(0, logs.length - 100);
  sseClients.forEach(c => {
    c.res.write(`event: log\ndata: ${JSON.stringify({ workflowName, ...entry })}\n\n`);
  });
  res.json({ ok: true });
});

app.get('/api/log/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  workflowLogs.forEach((logs, workflowName) => {
    logs.forEach(entry => res.write(`event: log\ndata: ${JSON.stringify({ workflowName, ...entry })}\n\n`));
  });
  const client = { res };
  sseClients.add(client);
  req.on('close', () => sseClients.delete(client));
});

app.get('/api/log/history', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const result = {};
  workflowLogs.forEach((logs, name) => { result[name] = logs; });
  res.json(result);
});

// --- Jalankan dan hentikan workflow ----------------------------------------

let n8nSession = null;

// Endpoint /rest butuh sesi login n8n; API key tidak berlaku di sini.
async function loginN8n() {
  const response = await fetch(`${n8nBaseUrl}/rest/login`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrLdapLoginId: n8nEmail, password: n8nPassword }),
    signal: AbortSignal.timeout(10_000),
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(
      `Login ke n8n gagal (${response.status}): ${cleanMessage(raw) || response.statusText}`,
    );
  }

  const cookies = (response.headers.getSetCookie?.() || []).map((cookie) =>
    cookie.split(';')[0],
  );
  const csrfCookie = cookies.find((cookie) =>
    cookie.startsWith('n8n-csrf-token='),
  );

  if (cookies.length === 0) {
    throw new Error('Login ke n8n tidak mengembalikan sesi.');
  }

  n8nSession = {
    cookie: cookies.join('; '),
    csrf: csrfCookie ? csrfCookie.slice('n8n-csrf-token='.length) : '',
  };

  return n8nSession;
}

// Panggil endpoint internal /rest n8n; login ulang sekali bila sesi kedaluwarsa.
async function callN8nRest(pathname, options = {}) {
  const attempt = async (session) => {
    const response = await fetch(`${n8nBaseUrl}${pathname}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Cookie: session.cookie,
        'X-N8N-CSRF-TOKEN': session.csrf,
        ...options.headers,
      },
      signal: AbortSignal.timeout(20_000),
    });

    return { response, stale: response.status === 401 || response.status === 403 };
  };

  let session = n8nSession || (await loginN8n());
  let result = await attempt(session);

  if (result.stale) {
    n8nSession = null;
    session = await loginN8n();
    result = await attempt(session);
  }

  return result.response;
}

app.post(
  '/api/workflows/:id/run',
  proxyRoute(async (req, res) => {
    if (!n8nEmail || !n8nPassword) {
      return res.status(503).json({
        error: 'Isi N8N_EMAIL dan N8N_PASSWORD di file .env untuk menjalankan workflow.',
      });
    }

    const id = encodeURIComponent(req.params.id);
    const response = await callN8nRest(`/rest/workflows/${id}/run`, {
      method: 'POST',
      body: '{}',
    });

    const raw = await response.text();

    if (!response.ok) {
      throw new Error(
        `n8n (${response.status}): ${cleanMessage(raw) || response.statusText}`,
      );
    }

    if (!raw) return res.json({ ok: true });

    try {
      return res.json(JSON.parse(raw));
    } catch {
      return res.json({ ok: true });
    }
  }),
);

app.post(
  '/api/executions/:id/stop',
  proxyRoute(async (req, res) => {
    const id = encodeURIComponent(req.params.id);
    res.json(await callN8n(`/executions/${id}/stop`, { method: 'POST' }));
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
