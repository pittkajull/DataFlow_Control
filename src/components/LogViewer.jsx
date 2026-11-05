import useWorkflowMonitor from '../hooks/useWorkflowMonitor.js';

const STATUS_META = {
  idle: { label: 'Menunggu data', color: 'var(--text-muted)' },
  running: { label: 'Berjalan', color: 'var(--amber)' },
  success: { label: 'Sukses', color: 'var(--green)' },
  error: { label: 'Error', color: 'var(--red)' },
  crashed: { label: 'Crashed', color: 'var(--red)' },
  waiting: { label: 'Menunggu', color: 'var(--info)' },
  unknown: { label: 'Tidak diketahui', color: 'var(--text-muted)' },
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
                    ? 'var(--red)'
                    : node.status === 'running'
                      ? 'var(--amber)'
                      : node.status === 'pending'
                        ? 'var(--text-dim)'
                        : 'var(--green)';

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
    background: 'var(--overlay)',
    backdropFilter: 'blur(3px)',
  },
  panel: {
    width: '100%',
    maxWidth: '560px',
    maxHeight: '86vh',
    overflowY: 'auto',
    background: 'var(--surface)',
    color: 'var(--text)',
    border: '1px solid var(--modal-line)',
    borderRadius: '14px',
    padding: '22px',
    boxShadow: '0 22px 55px rgba(0, 0, 0, 0.42)',
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
    fontSize: '0.6875rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  },
  title: { margin: '4px 0 0', fontSize: '1.1875rem', fontWeight: 600 },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    border: '1px solid',
    borderRadius: '999px',
    fontSize: '0.75rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '1.375rem',
    lineHeight: 1,
    cursor: 'pointer',
    padding: '0 2px',
  },
  spinner: {
    display: 'inline-block',
    width: '11px',
    height: '11px',
    border: '2px solid rgba(229, 196, 133, 0.25)',
    borderTopColor: 'var(--amber)',
    borderRadius: '50%',
    animation: 'spin 900ms linear infinite',
  },
  errorBox: {
    marginTop: '14px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(var(--red-rgb), 0.4)',
    background: 'var(--red-soft)',
    color: 'var(--red)',
    fontSize: '0.8125rem',
  },
  aiBox: {
    marginTop: '16px',
    padding: '14px',
    borderRadius: '10px',
    background: 'var(--modal-inner)',
    border: '1px solid var(--modal-line)',
  },
  aiTitle: {
    margin: 0,
    fontSize: '0.6875rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  },
  aiText: {
    margin: '8px 0 0',
    fontSize: '0.875rem',
    lineHeight: 1.65,
    color: 'var(--text)',
  },
  listHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '18px',
    marginBottom: '8px',
  },
  listTitle: { fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-soft)' },
  listCount: { fontSize: '0.75rem', color: 'var(--text-muted)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' },
  node: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '8px',
    background: 'var(--modal-node)',
    border: '1px solid var(--modal-line)',
  },
  dot: {
    flex: '0 0 auto',
    width: '8px',
    height: '8px',
    marginTop: '6px',
    borderRadius: '50%',
  },
  nodeBody: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  nodeName: { fontSize: '0.875rem', fontWeight: 500, wordBreak: 'break-word' },
  nodeMeta: { fontSize: '0.75rem', color: 'var(--text-muted)' },
  nodeError: { fontSize: '0.75rem', color: 'var(--red)', wordBreak: 'break-word' },
  empty: { margin: 0, fontSize: '0.8125rem', color: 'var(--text-muted)' },
  progressBox: {
    marginTop: '16px',
    padding: '14px',
    borderRadius: '10px',
    background: 'var(--modal-inner)',
    border: '1px solid var(--modal-line)',
  },
  progressHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
  },
  progressLabel: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  },
  progressValue: { fontSize: '0.75rem', color: 'var(--text-soft)' },
  progressTrack: {
    marginTop: '10px',
    height: '6px',
    borderRadius: '999px',
    background: 'var(--modal-node)',
    overflow: 'hidden',
  },
  progressFill: {
    display: 'block',
    height: '100%',
    borderRadius: '999px',
    background: 'var(--lime)',
    transition: 'width 400ms ease',
  },
  currentBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    marginTop: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    background: 'var(--modal-raised)',
    border: '1px solid var(--modal-line)',
  },
  currentBody: { minWidth: 0 },
  currentTitle: { fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)' },
  currentText: {
    margin: '4px 0 0',
    fontSize: '0.8125rem',
    lineHeight: 1.55,
    color: 'var(--text-soft)',
  },
  nextDot: {
    display: 'inline-block',
    width: '11px',
    height: '11px',
    marginTop: '3px',
    borderRadius: '50%',
    border: '2px solid var(--text-muted)',
    flexShrink: 0,
  },
  hintText: {
    margin: '10px 0 0',
    fontSize: '0.75rem',
    lineHeight: 1.55,
    color: 'var(--text-muted)',
  },
  nodeExplain: {
    fontSize: '0.75rem',
    lineHeight: 1.5,
    color: 'var(--text-soft)',
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
    border: '1px solid var(--modal-line)',
    background: 'transparent',
    color: 'var(--text-soft)',
    fontSize: '0.8125rem',
    cursor: 'pointer',
  },
  dangerButton: {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(var(--red-rgb), 0.4)',
    background: 'var(--red-soft)',
    color: 'var(--red)',
    fontSize: '0.8125rem',
    cursor: 'pointer',
  },
  primaryButton: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid var(--lime)',
    background: 'var(--lime)',
    color: 'var(--on-accent)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
