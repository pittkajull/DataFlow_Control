import { useEffect, useRef, useState } from 'react';
import useDashboard from './hooks/useDashboard.js';
import StatCards from './components/StatCards.jsx';
import WorkflowTable from './components/WorkflowTable.jsx';
import ExecutionTable from './components/ExecutionTable.jsx';
import WorkflowLogPanel from './components/WorkflowLogPanel.jsx';

const THEME_KEY = 'dataflow-theme';
const TEXT_SCALE_KEY = 'dataflow-text-scale';
const TEXT_SCALES = [0.9, 1, 1.1, 1.25, 1.4];

function readStoredTheme() {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // localStorage bisa diblokir browser; pakai tema bawaan.
  }
  return 'dark';
}

function readStoredTextScale() {
  try {
    const saved = Number(window.localStorage.getItem(TEXT_SCALE_KEY));
    if (TEXT_SCALES.includes(saved)) return saved;
  } catch {
    // localStorage bisa diblokir browser; pakai ukuran bawaan.
  }
  return 1;
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
  const [textScale, setTextScale] = useState(readStoredTextScale);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);
  const scaleIndex = TEXT_SCALES.indexOf(textScale);

  // Tema disimpan di <html data-theme> supaya semua token CSS ikut berganti.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Abaikan bila penyimpanan tidak tersedia.
    }
  }, [theme]);

  // Skala teks menggeser font-size akar; semua ukuran rem ikut membesar.
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--text-scale',
      String(textScale),
    );
    try {
      window.localStorage.setItem(TEXT_SCALE_KEY, String(textScale));
    } catch {
      // Abaikan bila penyimpanan tidak tersedia.
    }
  }, [textScale]);

  // Tutup menu pengaturan saat klik di luar atau menekan Escape.
  useEffect(() => {
    if (!settingsOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!settingsRef.current?.contains(event.target)) setSettingsOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [settingsOpen]);

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
              <div className="settings" ref={settingsRef}>
                <button
                  type="button"
                  className="settings-trigger"
                  onClick={() => setSettingsOpen((open) => !open)}
                  aria-expanded={settingsOpen}
                  aria-controls="pengaturan-tampilan"
                  aria-label="Pengaturan tampilan"
                  title="Pengaturan tampilan"
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
                    <path d="M4 7h9M19 7h1M4 17h1M11 17h9" />
                    <circle cx="16" cy="7" r="2.2" />
                    <circle cx="8" cy="17" r="2.2" />
                  </svg>
                </button>

                {settingsOpen && (
                  <div
                    className="settings-menu"
                    id="pengaturan-tampilan"
                    role="dialog"
                    aria-label="Pengaturan tampilan"
                  >
                    <div className="settings-row">
                      <span className="settings-label">Tema</span>
                      <div className="segmented">
                        <button
                          type="button"
                          className={`seg-btn${theme === 'dark' ? ' is-active' : ''}`}
                          aria-pressed={theme === 'dark'}
                          onClick={() => setTheme('dark')}
                        >
                          Gelap
                        </button>
                        <button
                          type="button"
                          className={`seg-btn${theme === 'light' ? ' is-active' : ''}`}
                          aria-pressed={theme === 'light'}
                          onClick={() => setTheme('light')}
                        >
                          Terang
                        </button>
                      </div>
                    </div>

                    <div className="settings-row">
                      <span className="settings-label">Ukuran teks</span>
                      <div className="stepper">
                        <button
                          type="button"
                          onClick={() =>
                            setTextScale(
                              TEXT_SCALES[Math.max(scaleIndex - 1, 0)],
                            )
                          }
                          disabled={scaleIndex <= 0}
                          aria-label="Perkecil ukuran teks"
                          title="Perkecil ukuran teks"
                        >
                          A−
                        </button>
                        <button
                          type="button"
                          className="stepper-value"
                          onClick={() => setTextScale(1)}
                          title="Kembalikan ke 100%"
                          aria-label={`Ukuran teks ${Math.round(textScale * 100)} persen, klik untuk kembali ke 100 persen`}
                        >
                          {Math.round(textScale * 100)}%
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setTextScale(
                              TEXT_SCALES[
                                Math.min(
                                  scaleIndex + 1,
                                  TEXT_SCALES.length - 1,
                                )
                              ],
                            )
                          }
                          disabled={scaleIndex >= TEXT_SCALES.length - 1}
                          aria-label="Perbesar ukuran teks"
                          title="Perbesar ukuran teks"
                        >
                          A+
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="hero">
            <div className="hero-copy">
              <h1>
                DataFlow <span>Control</span>
              </h1>
              <p className="hero-subtitle">
                Dashboard kontrol dan pemantauan automasi
              </p>
            </div>

            <div className="hero-sync">
              <span className="hero-sync-time" aria-live="polite">
                <span>Diperbarui</span>
                <strong>{formatClock(lastUpdate)}</strong>
              </span>
              <button
                type="button"
                className="btn hero-refresh"
                onClick={muat}
                disabled={loading}
              >
                <svg
                  className={loading ? 'is-spinning' : ''}
                  width="15"
                  height="15"
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
                {loading ? 'Memuat' : 'Refresh'}
              </button>
            </div>
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
              <h2 id="stats-heading">Ringkasan operasi</h2>
              <span className="section-line" aria-hidden="true" />
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
