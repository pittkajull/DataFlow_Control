import useWorkflowMonitor from '../hooks/useWorkflowMonitor.js';

const STATUS_META = {
  idle: { label: 'Menunggu data', color: '#9aa7b6' },
  running: { label: 'Berjalan', color: '#e5c485' },
  success: { label: 'Sukses', color: '#86dcae' },
  error: { label: 'Error', color: '#ef8f8f' },
  crashed: { label: 'Crashed', color: '#ef8f8f' },
  waiting: { label: 'Menunggu', color: '#9ec8ea' },
  unknown: { label: 'Tidak diketahui', color: '#9aa7b6' },
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
                    ? '#ef8f8f'
                    : node.status === 'running'
                      ? '#e5c485'
                      : node.status === 'pending'
                        ? '#6c7887'
                        : '#86dcae';

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
    background: 'rgba(8, 11, 16, 0.7)',
    backdropFilter: 'blur(3px)',
  },
  panel: {
    width: '100%',
    maxWidth: '560px',
    maxHeight: '86vh',
    overflowY: 'auto',
    background: '#171d25',
    color: '#e6ebf2',
    border: '1px solid rgba(203, 213, 225, 0.14)',
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
    fontSize: '11px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#93a0af',
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
    color: '#93a0af',
    fontSize: '22px',
    lineHeight: 1,
    cursor: 'pointer',
    padding: '0 2px',
  },
  spinner: {
    display: 'inline-block',
    width: '11px',
    height: '11px',
    border: '2px solid rgba(229, 196, 133, 0.25)',
    borderTopColor: '#e5c485',
    borderRadius: '50%',
    animation: 'spin 900ms linear infinite',
  },
  errorBox: {
    marginTop: '14px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(239, 143, 143, 0.4)',
    background: 'rgba(239, 143, 143, 0.1)',
    color: '#f3b6b6',
    fontSize: '13px',
  },
  aiBox: {
    marginTop: '16px',
    padding: '14px',
    borderRadius: '10px',
    background: '#131820',
    border: '1px solid rgba(203, 213, 225, 0.14)',
  },
  aiTitle: {
    margin: 0,
    fontSize: '11px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#93a0af',
  },
  aiText: {
    margin: '8px 0 0',
    fontSize: '14px',
    lineHeight: 1.65,
    color: '#d3dbe6',
  },
  listHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '18px',
    marginBottom: '8px',
  },
  listTitle: { fontSize: '13px', fontWeight: 600, color: '#c5cfdb' },
  listCount: { fontSize: '12px', color: '#93a0af' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' },
  node: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '8px',
    background: '#1d2530',
    border: '1px solid rgba(203, 213, 225, 0.14)',
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
  nodeMeta: { fontSize: '12px', color: '#93a0af' },
  nodeError: { fontSize: '12px', color: '#f2a9a9', wordBreak: 'break-word' },
  empty: { margin: 0, fontSize: '13px', color: '#93a0af' },
  progressBox: {
    marginTop: '16px',
    padding: '14px',
    borderRadius: '10px',
    background: '#131820',
    border: '1px solid rgba(203, 213, 225, 0.14)',
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
    color: '#93a0af',
  },
  progressValue: { fontSize: '12px', color: '#c5cfdb' },
  progressTrack: {
    marginTop: '10px',
    height: '6px',
    borderRadius: '999px',
    background: '#1d2530',
    overflow: 'hidden',
  },
  progressFill: {
    display: 'block',
    height: '100%',
    borderRadius: '999px',
    background: '#a3d98b',
    transition: 'width 400ms ease',
  },
  currentBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    marginTop: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    background: '#1e2632',
    border: '1px solid rgba(203, 213, 225, 0.14)',
  },
  currentBody: { minWidth: 0 },
  currentTitle: { fontSize: '13px', fontWeight: 600, color: '#e6ebf2' },
  currentText: {
    margin: '4px 0 0',
    fontSize: '13px',
    lineHeight: 1.55,
    color: '#aab6c4',
  },
  nextDot: {
    display: 'inline-block',
    width: '11px',
    height: '11px',
    marginTop: '3px',
    borderRadius: '50%',
    border: '2px solid #93a0af',
    flexShrink: 0,
  },
  hintText: {
    margin: '10px 0 0',
    fontSize: '12px',
    lineHeight: 1.55,
    color: '#93a0af',
  },
  nodeExplain: {
    fontSize: '12px',
    lineHeight: 1.5,
    color: '#aab6c4',
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
    border: '1px solid rgba(203, 213, 225, 0.14)',
    background: 'transparent',
    color: '#c5cfdb',
    fontSize: '13px',
    cursor: 'pointer',
  },
  dangerButton: {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(239, 143, 143, 0.4)',
    background: 'rgba(239, 143, 143, 0.1)',
    color: '#f2a9a9',
    fontSize: '13px',
    cursor: 'pointer',
  },
  primaryButton: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid #a3d98b',
    background: '#a3d98b',
    color: '#12180f',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
