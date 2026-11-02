const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function formatDateParts(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    iso: date.toISOString(),
    date: dateFormatter.format(date),
    time: timeFormatter.format(date),
  };
}

export default function WorkflowTable({
  workflows,
  filterId,
  pendingIds,
  loading,
  onFilter,
  onToggle,
}) {
  return (
    <section className="panel" aria-labelledby="workflow-panel-title">
      <header className="panel-header">
        <div className="panel-heading">
          <span className="panel-kicker">02 / Workflow</span>
          <h2 id="workflow-panel-title" className="panel-title">
            Kontrol workflow
          </h2>
          <p className="panel-hint">Klik baris untuk memfilter log eksekusi.</p>
        </div>
        <span className="count-pill">
          <span className="count-dot" aria-hidden="true" />
          {workflows.length} workflow
        </span>
      </header>

      <div className="table-wrap workflow-table-wrap">
        <table className="data-table workflow-table">
          <caption className="sr-only">Daftar workflow n8n</caption>
          <thead>
            <tr>
              <th scope="col">Nama</th>
              <th scope="col">Toggle ON/OFF</th>
              <th scope="col">Waktu diubah</th>
            </tr>
          </thead>
          <tbody>
            {workflows.map((workflow) => {
              const active = Boolean(workflow.active);
              const pending = pendingIds.includes(workflow.id);
              const filtered =
                filterId !== null && String(filterId) === String(workflow.id);
              const name = workflow.name || 'Tanpa nama';
              const updatedAt = formatDateParts(
                workflow.updatedAt || workflow.createdAt,
              );

              return (
                <tr
                  className={`workflow-row${filtered ? ' is-filtered' : ''}${
                    pending ? ' is-pending' : ''
                  }`}
                  key={workflow.id}
                  onClick={() => onFilter(workflow.id)}
                  title={`Filter eksekusi: ${name}`}
                >
                  <td>
                    <div className="workflow-identity">
                      <span className="workflow-glyph" aria-hidden="true">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="5" cy="6" r="2.5" />
                          <circle cx="19" cy="18" r="2.5" />
                          <path d="M7.5 6h4a3 3 0 0 1 3 3v6a3 3 0 0 0 3 3" />
                        </svg>
                      </span>
                      <span className="workflow-copy">
                        <button
                          type="button"
                          className="workflow-name"
                          aria-pressed={filtered}
                          onClick={(event) => {
                            event.stopPropagation();
                            onFilter(workflow.id);
                          }}
                        >
                          {name}
                        </button>
                        <span className="workflow-id">ID {workflow.id}</span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`switch${active ? ' is-on' : ''}`}
                      aria-pressed={active}
                      aria-busy={pending}
                      aria-label={`${active ? 'Nonaktifkan' : 'Aktifkan'} ${name}`}
                      title={pending ? 'Sedang memproses…' : active ? 'Nonaktifkan' : 'Aktifkan'}
                      disabled={pending}
                      onClick={(event) => {
                        // Jangan sampai klik toggle ikut memfilter tabel.
                        event.stopPropagation();
                        onToggle(workflow.id, !active);
                      }}
                    >
                      <span className="switch-track" aria-hidden="true">
                        <span className="switch-thumb" />
                      </span>
                      <span className="switch-text">{active ? 'ON' : 'OFF'}</span>
                      {pending && <span className="switch-spinner" aria-hidden="true" />}
                    </button>
                  </td>
                  <td className="date-cell">
                    {updatedAt ? (
                      <time dateTime={updatedAt.iso}>
                        <span>{updatedAt.date}</span>
                        <span className="updated-time">{updatedAt.time}</span>
                      </time>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {workflows.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">
              {loading ? <span className="loader" /> : '∅'}
            </span>
            <p>{loading ? 'Memuat workflow…' : 'Belum ada workflow'}</p>
            {!loading && (
              <span>Buat workflow pertamamu di antarmuka n8n.</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
