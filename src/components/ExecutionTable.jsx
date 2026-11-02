const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const durationFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 2,
});

const STATUS_LABELS = {
  success: 'Sukses',
  error: 'Error',
  crashed: 'Crashed',
  running: 'Berjalan',
  waiting: 'Menunggu',
  canceled: 'Dibatalkan',
  new: 'Baru',
  unknown: 'Tidak diketahui',
};

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : dateFormatter.format(date);
}

function getDuration(startedAt, stoppedAt) {
  if (!startedAt || !stoppedAt) return '-';

  const seconds = (new Date(stoppedAt).getTime() - new Date(startedAt).getTime()) / 1000;
  if (!Number.isFinite(seconds) || seconds < 0) return '-';

  return `${durationFormatter.format(seconds)} dtk`;
}

function statusTone(status) {
  if (status === 'success') return 'success';
  if (status === 'error' || status === 'crashed') return 'error';
  return 'neutral';
}

export default function ExecutionTable({
  executions,
  workflows,
  filterId,
  loading,
  onResetFilter,
}) {
  const workflowNames = new Map(
    workflows.map((workflow) => [String(workflow.id), workflow.name]),
  );
  const filteredWorkflow = filterId
    ? workflows.find((workflow) => String(workflow.id) === String(filterId))
    : null;
  const filterLabel = filteredWorkflow?.name || (filterId ? `ID ${filterId}` : null);

  return (
    <section className="panel" aria-labelledby="execution-panel-title">
      <header className="panel-header">
        <div className="panel-heading">
          <span className="panel-kicker">03 / Log eksekusi</span>
          <h2 id="execution-panel-title" className="panel-title">
            Eksekusi terbaru
            {filterLabel && <span className="title-filter">/ {filterLabel}</span>}
          </h2>
          <p className="panel-hint">
            {filterId
              ? 'Filter aktif. Klik workflow yang sama lagi untuk reset.'
              : '20 eksekusi terbaru dari seluruh workflow.'}
            <span className="mobile-scroll-hint">
              {' '}
              Geser tabel untuk melihat kolom lainnya.
            </span>
          </p>
        </div>
        <span className="count-pill">
          <span className="count-dot" aria-hidden="true" />
          {executions.length} eksekusi
        </span>
      </header>

      {filterId && (
        <div className="filter-bar">
          <span className="filter-chip-label">Filter aktif</span>
          <strong>{filterLabel}</strong>
          <button type="button" onClick={onResetFilter}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
            klik lagi untuk reset
          </button>
        </div>
      )}

      <div
        className="table-wrap execution-table-wrap"
        role="region"
        aria-label="Tabel eksekusi, dapat digeser horizontal"
        tabIndex={0}
      >
        <table className="data-table execution-table">
          <caption className="sr-only">Daftar eksekusi n8n</caption>
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Nama workflow</th>
              <th scope="col">Status</th>
              <th scope="col">Mode</th>
              <th scope="col">Waktu mulai</th>
              <th scope="col">Durasi</th>
            </tr>
          </thead>
          <tbody>
            {executions.map((execution) => {
              const status = execution.status || 'unknown';
              const tone = statusTone(status);
              const workflowName =
                workflowNames.get(String(execution.workflowId)) ||
                (execution.workflowId != null ? String(execution.workflowId) : '-');

              return (
                <tr className="execution-row" key={execution.id}>
                  <td className="execution-id">#{execution.id}</td>
                  <td>
                    <span className="execution-workflow">{workflowName}</span>
                  </td>
                  <td>
                    <span className={`status-badge is-${tone}`}>
                      <span className="badge-dot" aria-hidden="true" />
                      {STATUS_LABELS[status] || status}
                    </span>
                  </td>
                  <td>
                    <span className="mode-tag">{execution.mode || '-'}</span>
                  </td>
                  <td className="date-cell">
                    <time dateTime={execution.startedAt || undefined}>
                      {formatDate(execution.startedAt)}
                    </time>
                  </td>
                  <td className="duration-cell">
                    {getDuration(execution.startedAt, execution.stoppedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {executions.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">
              {loading ? <span className="loader" /> : '∅'}
            </span>
            <p>{loading ? 'Memuat eksekusi…' : 'Belum ada eksekusi'}</p>
            {!loading && (
              <span>
                {filterId
                  ? 'Jalankan workflow ini atau reset filter untuk melihat yang lain.'
                  : 'Jalankan workflow di n8n lalu refresh dashboard.'}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
