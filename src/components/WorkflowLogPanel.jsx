import { useWorkflowLogs } from '../hooks/useWorkflowLogs.js';

const STATUS_COLOR = { running: '#facc15', success: '#4ade80', error: '#f87171' };

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return `${diff}d lalu`;
  if (diff < 3600) return `${Math.floor(diff/60)}m lalu`;
  return `${Math.floor(diff/3600)}j lalu`;
}

export default function WorkflowLogPanel({ workflowName }) {
  const { getLogsFor } = useWorkflowLogs();
  const logs = getLogsFor(workflowName);

  return (
    <div style={{ background: '#151a27', border: '1px solid #2e3447', borderRadius: 10, padding: '14px 16px', marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        Log Langsung — {workflowName}
      </div>

      {logs.length === 0 ? (
        <div style={{ fontSize: 13, color: '#475569', textAlign: 'center', padding: '16px 0' }}>
          Belum ada aktivitas. Jalankan workflow untuk melihat log.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
          {[...logs].reverse().map((log, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', background: '#1e2330', borderRadius: 7 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[log.status] || '#94a3b8', marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.5 }}>{log.message}</div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{log.nodeName} · {timeAgo(log.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
