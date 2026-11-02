import { useCallback, useEffect, useRef, useState } from 'react';

const TERMINAL_STATUSES = ['success', 'error', 'crashed', 'waiting'];

const readEvent = (event) => {
  try {
    return JSON.parse(event.data);
  } catch {
    return null;
  }
};

export default function useWorkflowMonitor(executionId) {
  const [status, setStatus] = useState('idle');
  const [nodes, setNodes] = useState([]);
  const [explanation, setExplanation] = useState('');
  const [progress, setProgress] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const sourceRef = useRef(null);
  const closedRef = useRef(false);
  const nodesRef = useRef([]);

  useEffect(() => {
    if (!executionId) {
      setStatus('idle');
      setNodes([]);
      setExplanation('');
      setError('');
      return undefined;
    }

    closedRef.current = false;
    nodesRef.current = [];
    setStatus('running');
    setNodes([]);
    setExplanation('');
    setProgress(null);
    setLoadingAI(false);
    setError('');

    let workflowName = '';
    const source = new EventSource(
      `/api/executions/${encodeURIComponent(executionId)}/stream`,
    );
    sourceRef.current = source;

    // Penjelasan AI diminta sekali saja setelah eksekusi berhenti.
    const askAi = async (nodeList, finalStatus) => {
      if (closedRef.current) return;
      setLoadingAI(true);

      try {
        const response = await fetch('/api/log/parse', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            nodes: nodeList,
            workflowName,
            status: finalStatus,
          }),
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || 'Penjelasan AI gagal dimuat.');
        }

        if (!closedRef.current) setExplanation(payload?.explanation || '');
      } catch (aiError) {
        if (!closedRef.current) {
          setError(
            aiError instanceof Error
              ? aiError.message
              : 'Penjelasan AI gagal dimuat.',
          );
        }
      } finally {
        if (!closedRef.current) setLoadingAI(false);
      }
    };

    source.addEventListener('update', (event) => {
      const data = readEvent(event);
      if (!data) return;

      if (data.workflowName) workflowName = data.workflowName;
      const list = Array.isArray(data.nodes) ? data.nodes : [];

      nodesRef.current = list;
      setStatus(data.status || 'running');
      setNodes(list);
      if (data.progress) setProgress(data.progress);
    });

    source.addEventListener('done', (event) => {
      const data = readEvent(event);
      source.close();

      if (closedRef.current) return;

      const finalStatus = data?.status || 'success';
      setStatus(finalStatus);
      askAi(nodesRef.current, finalStatus);
    });

    source.addEventListener('error', (event) => {
      if (closedRef.current) return;

      if (event.data) {
        const data = readEvent(event);
        setError(data?.message || 'Pemantauan eksekusi gagal.');
        setStatus((current) =>
          TERMINAL_STATUSES.includes(current) ? current : 'error',
        );
        source.close();
        return;
      }

      if (source.readyState === EventSource.CLOSED) {
        setError('Koneksi pemantauan terputus.');
      }
    });

    return () => {
      closedRef.current = true;
      source.close();
      if (sourceRef.current === source) sourceRef.current = null;
    };
  }, [executionId]);

  // Hentikan eksekusi yang sedang dipantau; stream akan menangkap status akhirnya.
  const stop = useCallback(async () => {
    if (!executionId) return;

    setStopping(true);

    try {
      const response = await fetch(
        `/api/executions/${encodeURIComponent(executionId)}/stop`,
        { method: 'POST', headers: { Accept: 'application/json' } },
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.error || `Permintaan gagal (HTTP ${response.status}).`,
        );
      }

      setError('');
    } catch (stopError) {
      if (!closedRef.current) {
        setError(
          stopError instanceof Error
            ? stopError.message
            : 'Gagal menghentikan eksekusi.',
        );
      }
    } finally {
      if (!closedRef.current) setStopping(false);
    }
  }, [executionId]);

  const reset = useCallback(() => {
    closedRef.current = true;
    sourceRef.current?.close();
    sourceRef.current = null;

    nodesRef.current = [];
    setStatus('idle');
    setNodes([]);
    setProgress(null);
    setExplanation('');
    setLoadingAI(false);
    setError('');
  }, []);

  return {
    status,
    nodes,
    progress,
    explanation,
    loadingAI,
    error,
    reset,
    stopping,
    stop,
  };
}
