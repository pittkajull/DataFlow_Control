import { useWorkflowLogs } from '../hooks/useWorkflowLogs.js';

const STATUS_COLOR = {
  running: 'var(--amber)',
  success: 'var(--green)',
  error: 'var(--red)',
};

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return `${diff}d lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
  return `${Math.floor(diff / 3600)}j lalu`;
}

export default function WorkflowLogPanel({ workflowName }) {
  const { getLogsFor } = useWorkflowLogs();
  const logs = getLogsFor(workflowName);

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 18,
        padding: '18px 20px',
        marginTop: 18,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--lime)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 12,
        }}
      >
        Log langsung — {workflowName}
      </div>

      {logs.length === 0 ? (
        <div
          style={{
            fontSize: 13,
            color: 'var(--text-muted)',
            textAlign: 'center',
            padding: '18px 0',
          }}
        >
          Belum ada aktivitas. Jalankan workflow untuk melihat log.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {[...logs].reverse().map((log, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                padding: '10px 12px',
                background: 'var(--surface-raised)',
                border: '1px solid var(--line)',
                borderRadius: 9,
              }}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: STATUS_COLOR[log.status] || 'var(--text-dim)',
                  marginTop: 6,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                  {log.message}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
                  {log.nodeName} · {timeAgo(log.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
