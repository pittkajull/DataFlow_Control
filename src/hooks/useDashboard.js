import { useCallback, useEffect, useRef, useState } from 'react';

const REFRESH_INTERVAL = 15_000;

async function requestJson(url, options = {}) {
  const { signal, ...fetchOptions } = options;
  const response = await fetch(url, {
    ...fetchOptions,
    signal,
    headers: { Accept: 'application/json', ...fetchOptions.headers },
  });

  const raw = await response.text();
  let payload = null;
  let invalidJson = false;

  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      invalidJson = true;
    }
  }

  if (!response.ok) {
    throw new Error(
      payload?.error ||
        payload?.message ||
        `Permintaan gagal (HTTP ${response.status}).`,
    );
  }

  if (invalidJson) throw new Error('Respons server bukan JSON yang valid.');
  return payload;
}

// n8n dapat membungkus list dalam { data } pada sebagian versi.
const toList = (payload) => {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.data) ? payload.data : [];
};

export default function useDashboard() {
  const [workflows, setWorkflows] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [filterId, setFilterId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [pendingIds, setPendingIds] = useState([]);
  const activeRequest = useRef(null);

  const muat = useCallback(async () => {
    // Batalkan request lama agar hasil filter sebelumnya tidak menimpa state baru.
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);

    const executionUrl = filterId
      ? `/api/executions?workflowId=${encodeURIComponent(filterId)}`
      : '/api/executions';

    try {
      const [workflowPayload, executionPayload] = await Promise.all([
        requestJson('/api/workflows', { signal: controller.signal }),
        requestJson(executionUrl, { signal: controller.signal }),
      ]);

      if (controller.signal.aborted) return;

      setWorkflows(toList(workflowPayload));
      setExecutions(toList(executionPayload));
      setError('');
      setLastUpdate(new Date());
    } catch (requestError) {
      if (controller.signal.aborted) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Gagal memuat data dari n8n.',
      );
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  }, [filterId]);

  // Muat ulang saat filter berubah, lalu setiap 15 detik. Cleanup wajib.
  useEffect(() => {
    muat();
    const intervalId = window.setInterval(muat, REFRESH_INTERVAL);

    return () => {
      window.clearInterval(intervalId);
      activeRequest.current?.abort();
    };
  }, [muat]);

  const toggleWorkflow = useCallback(
    async (id, aktifkan) => {
      if (id == null) return;

      setPendingIds((current) =>
        current.includes(id) ? current : [...current, id],
      );
      setError('');

      try {
        const action = aktifkan ? 'activate' : 'deactivate';
        await requestJson(
          `/api/workflows/${encodeURIComponent(id)}/${action}`,
          { method: 'POST' },
        );
        await muat();
      } catch (toggleError) {
        if (toggleError.name === 'AbortError') return;
        setError(
          toggleError instanceof Error
            ? toggleError.message
            : 'Gagal mengubah status workflow.',
        );
      } finally {
        setPendingIds((current) => current.filter((item) => item !== id));
      }
    },
    [muat],
  );

  const setFilter = useCallback((id) => {
    if (id == null) return;
    setFilterId((current) =>
      current !== null && String(current) === String(id) ? null : id,
    );
  }, []);

  return {
    workflows,
    executions,
    filterId,
    error,
    loading,
    lastUpdate,
    pendingIds,
    muat,
    toggleWorkflow,
    setFilter,
  };
}
