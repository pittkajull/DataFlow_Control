import { useState, useEffect, useRef } from 'react';

const RETRY_DELAY = 3_000;

export function useWorkflowLogs() {
  const [logs, setLogs] = useState({});
  const sourceRef = useRef(null);

  useEffect(() => {
    let closed = false;
    let retryTimer = null;

    const handleLog = (event) => {
      let entry = null;

      try {
        entry = JSON.parse(event.data);
      } catch {
        return;
      }

      const { workflowName, ...rest } = entry || {};
      if (!workflowName) return;

      setLogs((prev) => {
        const existing = prev[workflowName] || [];
        return { ...prev, [workflowName]: [...existing, rest].slice(-100) };
      });
    };

    // Satu koneksi aktif saja: tutup yang lama sebelum mencoba lagi.
    const connect = () => {
      if (closed) return;

      const source = new EventSource('/api/log/stream');
      sourceRef.current = source;
      source.addEventListener('log', handleLog);

      source.addEventListener('error', () => {
        source.close();
        if (sourceRef.current === source) sourceRef.current = null;
        if (closed) return;

        window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(connect, RETRY_DELAY);
      });
    };

    fetch('/api/log/history', { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!closed && data) setLogs(data);
      })
      .catch(() => {});

    connect();

    return () => {
      closed = true;
      window.clearTimeout(retryTimer);
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, []);

  const getLogsFor = (workflowName) => logs[workflowName] || [];
  const clearLogs = (workflowName) => setLogs(prev => ({ ...prev, [workflowName]: [] }));

  return { logs, getLogsFor, clearLogs };
}
