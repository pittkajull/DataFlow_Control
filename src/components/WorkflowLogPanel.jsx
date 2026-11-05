import { useWorkflowLogs } from '../hooks/useWorkflowLogs.js';

const STATUS_COLOR = {
  running: 'var(--amber)',
  success: 'var(--green)',
  error: 'var(--red)',
};

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return `${diff} detik lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  return `${Math.floor(diff / 3600)} jam lalu`;
}

export default function WorkflowLogPanel({ workflowName }) {
  const { getLogsFor } = useWorkflowLogs();
  const logs = getLogsFor(workflowName);

  return (
    <details className="log-panel">
      <summary className="log-summary">
        <span className="log-title">Log langsung</span>
        <span className="log-workflow">{workflowName}</span>
        <span className="log-count">{logs.length} entri</span>
        <svg
          className="log-chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>

      {logs.length === 0 ? (
        <p className="log-empty">
          Belum ada aktivitas. Jalankan workflow untuk melihat log.
        </p>
      ) : (
        <ul className="log-list">
          {[...logs].reverse().map((log, index) => (
            <li className="log-entry" key={`${log.timestamp}-${index}`}>
              <span
                className="log-dot"
                style={{
                  background: STATUS_COLOR[log.status] || 'var(--text-dim)',
                }}
                aria-hidden="true"
              />
              <div className="log-body">
                <p className="log-message">{log.message}</p>
                <span className="log-meta">
                  {log.nodeName} · {timeAgo(log.timestamp)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
