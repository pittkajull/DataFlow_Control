import { useState, useEffect, useRef } from 'react';

export function useWorkflowLogs() {
  const [logs, setLogs] = useState({});
  const esRef = useRef(null);

  useEffect(() => {
    fetch('/api/log/history')
      .then(r => r.json())
      .then(data => setLogs(data))
      .catch(() => {});

    const es = new EventSource('/api/log/stream');
    esRef.current = es;

    es.addEventListener('log', (e) => {
      const entry = JSON.parse(e.data);
      const { workflowName, ...rest } = entry;
      setLogs(prev => {
        const existing = prev[workflowName] || [];
        const updated = [...existing, rest].slice(-100);
        return { ...prev, [workflowName]: updated };
      });
    });

    es.onerror = () => {
      setTimeout(() => {
        const newEs = new EventSource('/api/log/stream');
        esRef.current = newEs;
      }, 3000);
    };

    return () => es.close();
  }, []);

  const getLogsFor = (workflowName) => logs[workflowName] || [];
  const clearLogs = (workflowName) => setLogs(prev => ({ ...prev, [workflowName]: [] }));

  return { logs, getLogsFor, clearLogs };
}
