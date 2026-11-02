import useWorkflowMonitor from '../hooks/useWorkflowMonitor.js';

const STATUS_META = {
  idle: { label: 'Menunggu data', color: '#94a0b8' },
  running: { label: 'Berjalan', color: '#f5c451' },
  success: { label: 'Sukses', color: '#7ee2a8' },
  error: { label: 'Error', color: '#ff7b72' },
  crashed: { label: 'Crashed', color: '#ff7b72' },
  waiting: { label: 'Menunggu', color: '#8ecbff' },
  unknown: { label: 'Tidak diketahui', color: '#94a0b8' },
};

function formatDuration(milliseconds) {
  const value = Number(milliseconds);
  if (!Number.isFinite(value) || value < 0) return '-';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} dtk`;
}

export default function LogViewer({ executionId, onClose }) {
  const { status, nodes, progress, explanation, loadingAI, error, reset, stopping, stop } =
    useWorkflowMonitor(executionId);

  if (!executionId) return null;

  const meta = STATUS_META[status] || STATUS_META.unknown;
  const running = status === 'running';

  return (
    <div style={styles.overlay} role="presentation" onClick={onClose}>
      <div
        style={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Pantauan eksekusi ${executionId}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header style={styles.header}>
          <div>
            <p style={styles.kicker}>Pantauan eksekusi</p>
            <h2 style={styles.title}>Eksekusi #{executionId}</h2>
          </div>
          <div style={styles.headerActions}>
            <span
              style={{ ...styles.badge, color: meta.color, borderColor: meta.color }}
            >
              {running && <span style={styles.spinner} aria-hidden="true" />}
              {meta.label}
            </span>
            <button
              type="button"
              style={styles.closeButton}
              onClick={onClose}
              aria-label="Tutup pantauan"
            >
              ×
            </button>
          </div>
        </header>

        {progress && progress.total > 0 && (
          <section style={styles.progressBox} aria-live="polite">
            <div style={styles.progressHead}>
              <span style={styles.progressLabel}>
                {running ? 'Sedang berjalan' : 'Progres'}
              </span>
              <span style={styles.progressValue}>
                {progress.completed}/{progress.total} langkah · {progress.percent}%
              </span>
            </div>

            <div style={styles.progressTrack} aria-hidden="true">
              <span
                style={{ ...styles.progressFill, width: `${progress.percent}%` }}
              />
            </div>

            {running && progress.completed === 0 && (
              <p style={styles.hintText}>
                n8n belum mengirim rincian langkah. Jalankan workflow lewat
                tombol Jalankan di dashboard agar opsi “Save execution
                progress” ikut aktif.
              </p>
            )}

            {progress.currentName && (
              <div style={styles.currentBox}>
                {progress.currentStatus === 'running' ? (
                  <span style={styles.spinner} aria-hidden="true" />
                ) : (
                  <span style={styles.nextDot} aria-hidden="true" />
                )}
                <div style={styles.currentBody}>
                  <strong style={styles.currentTitle}>
                    {progress.currentStatus === 'running'
                      ? 'Sekarang: '
                      : 'Langkah saat ini: '}
                    {progress.currentName}
                  </strong>
                  {progress.currentExplanation && (
                    <p style={styles.currentText}>
                      {progress.currentExplanation}
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {error && <div style={styles.errorBox}>{error}</div>}

        <section style={styles.aiBox} aria-live="polite">
          <p style={styles.aiTitle}>Penjelasan sederhana</p>
          {loadingAI ? (
            <p style={styles.aiText}>
              <span style={styles.spinner} aria-hidden="true" /> Menyusun
              penjelasan…
            </p>
          ) : (
            <p style={styles.aiText}>
              {explanation ||
                (running
                  ? 'Penjelasan muncul setelah proses selesai.'
                  : 'Belum ada penjelasan dari AI.')}
            </p>
          )}
        </section>

        <section aria-label="Rincian langkah">
          <div style={styles.listHead}>
            <span style={styles.listTitle}>Langkah yang dijalankan</span>
            <span style={styles.listCount}>{nodes.length} langkah</span>
          </div>

          {nodes.length === 0 ? (
            <p style={styles.empty}>
              {running ? 'Menunggu langkah pertama…' : 'Belum ada langkah tercatat.'}
            </p>
          ) : (
            <ul style={styles.list}>
              {nodes.map((node) => {
                const color =
                  node.status === 'error'
                    ? '#ff7b72'
                    : node.status === 'running'
                      ? '#f5c451'
                      : node.status === 'pending'
                        ? '#475569'
                        : '#7ee2a8';

                return (
                  <li key={node.name} style={styles.node}>
                    <span
                      style={{ ...styles.dot, background: color }}
                      aria-hidden="true"
                    />
                    <div style={styles.nodeBody}>
                      <span style={styles.nodeName}>
                        {node.name}
                        {node.status === 'running' && ' · sedang berjalan'}
                        {node.status === 'pending' && ' · menunggu'}
                      </span>
                      {node.explanation && (
                        <span style={styles.nodeExplain}>{node.explanation}</span>
                      )}
                      <span style={styles.nodeMeta}>
                        {node.status === 'pending'
                          ? 'Belum dijalankan'
                          : `${node.itemCount} data · ${formatDuration(node.executionTime)}`}
                      </span>
                      {node.status === 'error' && node.errorMessage && (
                        <span style={styles.nodeError}>{node.errorMessage}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer style={styles.footer}>
          {running && (
            <button
              type="button"
              style={styles.dangerButton}
              onClick={stop}
              disabled={stopping}
            >
              {stopping ? 'Menghentikan…' : 'Hentikan proses'}
            </button>
          )}
          <button type="button" style={styles.secondaryButton} onClick={reset}>
            Reset pantauan
          </button>
          <button type="button" style={styles.primaryButton} onClick={onClose}>
            Tutup
          </button>
        </footer>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: 'rgba(4, 6, 9, 0.72)',
    backdropFilter: 'blur(3px)',
  },
  panel: {
    width: '100%',
    maxWidth: '560px',
    maxHeight: '86vh',
    overflowY: 'auto',
    background: '#1e2330',
    color: '#e6ebf5',
    border: '1px solid #2b3343',
    borderRadius: '14px',
    padding: '22px',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55)',
    fontFamily: 'inherit',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
  },
  headerActions: { display: 'flex', alignItems: 'center', gap: '10px' },
  kicker: {
    margin: 0,
    fontSize: '11px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#8b96ab',
  },
  title: { margin: '4px 0 0', fontSize: '19px', fontWeight: 600 },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    border: '1px solid',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    color: '#8b96ab',
    fontSize: '22px',
    lineHeight: 1,
    cursor: 'pointer',
    padding: '0 2px',
  },
  spinner: {
    display: 'inline-block',
    width: '11px',
    height: '11px',
    border: '2px solid rgba(245, 196, 81, 0.25)',
    borderTopColor: '#f5c451',
    borderRadius: '50%',
    animation: 'spin 900ms linear infinite',
  },
  errorBox: {
    marginTop: '14px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 123, 114, 0.45)',
    background: 'rgba(255, 123, 114, 0.12)',
    color: '#ffb4ae',
    fontSize: '13px',
  },
  aiBox: {
    marginTop: '16px',
    padding: '14px',
    borderRadius: '10px',
    background: '#151a24',
    border: '1px solid #2b3343',
  },
  aiTitle: {
    margin: 0,
    fontSize: '11px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#8b96ab',
  },
  aiText: {
    margin: '8px 0 0',
    fontSize: '14px',
    lineHeight: 1.65,
    color: '#d5dcea',
  },
  listHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '18px',
    marginBottom: '8px',
  },
  listTitle: { fontSize: '13px', fontWeight: 600, color: '#c7d0e0' },
  listCount: { fontSize: '12px', color: '#8b96ab' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' },
  node: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '8px',
    background: '#232936',
    border: '1px solid #2b3343',
  },
  dot: {
    flex: '0 0 auto',
    width: '8px',
    height: '8px',
    marginTop: '6px',
    borderRadius: '50%',
  },
  nodeBody: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  nodeName: { fontSize: '14px', fontWeight: 500, wordBreak: 'break-word' },
  nodeMeta: { fontSize: '12px', color: '#8b96ab' },
  nodeError: { fontSize: '12px', color: '#ff9d96', wordBreak: 'break-word' },
  empty: { margin: 0, fontSize: '13px', color: '#8b96ab' },
  progressBox: {
    marginTop: '16px',
    padding: '14px',
    borderRadius: '10px',
    background: '#151a24',
    border: '1px solid #2b3343',
  },
  progressHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
  },
  progressLabel: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#8b96ab',
  },
  progressValue: { fontSize: '12px', color: '#c7d0e0' },
  progressTrack: {
    marginTop: '10px',
    height: '6px',
    borderRadius: '999px',
    background: '#232936',
    overflow: 'hidden',
  },
  progressFill: {
    display: 'block',
    height: '100%',
    borderRadius: '999px',
    background: '#bdff74',
    transition: 'width 400ms ease',
  },
  currentBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    marginTop: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    background: '#1e2330',
    border: '1px solid #2b3343',
  },
  currentBody: { minWidth: 0 },
  currentTitle: { fontSize: '13px', fontWeight: 600, color: '#e6ebf5' },
  currentText: {
    margin: '4px 0 0',
    fontSize: '13px',
    lineHeight: 1.55,
    color: '#a9b4c7',
  },
  nextDot: {
    display: 'inline-block',
    width: '11px',
    height: '11px',
    marginTop: '3px',
    borderRadius: '50%',
    border: '2px solid #8b96ab',
    flexShrink: 0,
  },
  hintText: {
    margin: '10px 0 0',
    fontSize: '12px',
    lineHeight: 1.55,
    color: '#8b96ab',
  },
  nodeExplain: {
    fontSize: '12px',
    lineHeight: 1.5,
    color: '#a9b4c7',
    wordBreak: 'break-word',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '20px',
  },
  secondaryButton: {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid #2b3343',
    background: 'transparent',
    color: '#c7d0e0',
    fontSize: '13px',
    cursor: 'pointer',
  },
  dangerButton: {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid #7f2f30',
    background: '#2a1a1c',
    color: '#ff9d96',
    fontSize: '13px',
    cursor: 'pointer',
  },
  primaryButton: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid #bdff74',
    background: '#bdff74',
    color: '#10150d',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
