import { useEffect, useState } from 'react';
import useDashboard from './hooks/useDashboard.js';
import StatCards from './components/StatCards.jsx';
import WorkflowTable from './components/WorkflowTable.jsx';
import ExecutionTable from './components/ExecutionTable.jsx';
import WorkflowLogPanel from './components/WorkflowLogPanel.jsx';

const THEME_KEY = 'dataflow-theme';

function readStoredTheme() {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // localStorage bisa diblokir browser; pakai tema bawaan.
  }
  return 'dark';
}

function formatClock(value) {
  if (!value) return '--:--:--';
  return [value.getHours(), value.getMinutes(), value.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

export default function App() {
  const {
    workflows,
    executions,
    filterId,
    error,
    loading,
    lastUpdate,
    pendingIds,
    runningIds,
    stoppingIds,
    muat,
    toggleWorkflow,
    runWorkflow,
    stopExecution,
    setFilter,
  } = useDashboard();
  const [watchingId, setWatchingId] = useState(null);
  const [theme, setTheme] = useState(readStoredTheme);

  // Tema disimpan di <html data-theme> supaya semua token CSS ikut berganti.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Abaikan bila penyimpanan tidak tersedia.
    }
  }, [theme]);

  // Setelah workflow dijalankan, langsung buka panel pantau eksekusinya.
  const handleRun = async (id) => {
    const executionId = await runWorkflow(id);
    if (executionId != null) setWatchingId(executionId);
  };

  const syncState = error ? 'GANGGUAN' : loading ? 'SINKRON' : 'SIAGA';

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Lewati ke konten
      </a>

      <div className="page-shell">
        <header className="site-header">
          <div className="topbar">
            <a className="brand" href="/" aria-label="DataFlow Control — beranda">
              <span className="brand-mark" aria-hidden="true">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 7h6l4 5h6M4 17h6l4-5" />
                  <circle cx="4" cy="7" r="1.5" />
                  <circle cx="4" cy="17" r="1.5" />
                  <circle cx="20" cy="12" r="1.5" />
                </svg>
              </span>
              <span className="brand-name">
                DataFlow <em>/ Control</em>
              </span>
            </a>

            <div className="topbar-meta">
              <span className={`system-state${error ? ' has-error' : ''}`}>
                <span className="signal-dot" aria-hidden="true" />
                {syncState}
              </span>
              <span className="topbar-rule" aria-hidden="true" />
              <span className="topbar-network">Proxy n8n</span>
              <span className="topbar-rule" aria-hidden="true" />
              <span className="topbar-secure">Basic Auth</span>
              <button
                type="button"
                className="theme-toggle"
                onClick={() =>
                  setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
                }
                aria-pressed={theme === 'light'}
                title={
                  theme === 'dark'
                    ? 'Ganti ke tema terang'
                    : 'Ganti ke tema gelap'
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {theme === 'dark' ? (
                    <>
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                    </>
                  ) : (
                    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                  )}
                </svg>
                <span className="theme-toggle-label">
                  {theme === 'dark' ? 'Terang' : 'Gelap'}
                </span>
              </button>
            </div>
          </div>

          <div className="hero">
            <div className="hero-copy">
              <p className="eyebrow">
                <span>Panel kendali</span>
                <span className="eyebrow-index">/ 01</span>
              </p>
              <h1>
                DataFlow <span>Control</span>
              </h1>
              <p className="hero-subtitle">
                Dashboard kontrol dan pemantauan automasi
              </p>
            </div>

            <aside className="hero-console" aria-label="Status sinkronisasi">
              <div className="console-head">
                <span className="panel-kicker">Terminal sinkron</span>
                <span className={`console-state${error ? ' has-error' : ''}`}>
                  <span className="signal-dot" aria-hidden="true" />
                  {error ? 'TERPUTUS' : loading ? 'SINKRON' : 'AKTIF'}
                </span>
              </div>

              <div className="console-readout" aria-live="polite">
                <span>Diperbarui</span>
                <strong>{formatClock(lastUpdate)}</strong>
              </div>

              <div className="console-cadence">
                <span>Muat otomatis</span>
                <span className="cadence-track" aria-hidden="true">
                  <i />
                </span>
                <span>15 detik</span>
              </div>

              <button
                type="button"
                className="refresh-button"
                onClick={muat}
                disabled={loading}
              >
                <svg
                  className={loading ? 'is-spinning' : ''}
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 11a8 8 0 1 0-2.3 6.7" />
                  <path d="M20 4v7h-7" />
                </svg>
                {loading ? 'Memuat data' : 'Refresh'}
              </button>
            </aside>
          </div>
        </header>

        {error && (
          <div className="error-banner" role="alert">
            <span className="error-symbol" aria-hidden="true">
              !
            </span>
            <div>
              <strong>Terjadi kesalahan</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={muat} disabled={loading}>
              Coba lagi
            </button>
          </div>
        )}

        <main id="main">
          <section className="stats-section" aria-labelledby="stats-heading">
            <div className="section-bar">
              <span className="section-index">01</span>
              <h2 id="stats-heading">Ringkasan operasi</h2>
              <span className="section-line" aria-hidden="true" />
              <span className="section-meta">data terkini</span>
            </div>
            <StatCards workflows={workflows} executions={executions} />
          </section>

          <div className="dashboard-grid">
            <WorkflowTable
              workflows={workflows}
              filterId={filterId}
              pendingIds={pendingIds}
              runningIds={runningIds}
              loading={loading}
              onFilter={setFilter}
              onToggle={toggleWorkflow}
              onRun={handleRun}
            />
            <ExecutionTable
              executions={executions}
              workflows={workflows}
              filterId={filterId}
              loading={loading}
              stoppingIds={stoppingIds}
              onStop={stopExecution}
              watchingId={watchingId}
              onWatch={setWatchingId}
              onResetFilter={() => setFilter(filterId)}
            />
          </div>

          <WorkflowLogPanel workflowName="Multi-Platform Shorts Clipper" />
        </main>

        <footer className="site-footer">
          <span>
            DataFlow Control <i>/</i> operasi n8n
          </span>
          <span>
            API key tersimpan di server <i>·</i> Dilindungi Basic Auth
          </span>
        </footer>
      </div>
    </div>
  );
}
