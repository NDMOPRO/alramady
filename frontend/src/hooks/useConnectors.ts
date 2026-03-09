'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';

interface ConnectorInfo {
  type: string;
  name: string;
  authType: string;
}

interface Connection {
  id: string;
  type: string;
  name: string;
  status: string;
  createdAt: string;
}

export function useConnectors() {
  const [connectorTypes, setConnectorTypes] = useState<ConnectorInfo[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConnectors = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [types, conns] = await Promise.all([
        api.get<{ data: ConnectorInfo[] }>('/api/v1/connectors/types'),
        api.get<{ data: Connection[] }>('/api/v1/connectors/connections'),
      ]);
      setConnectorTypes(types.data);
      setConnections(conns.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connectors');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const connect = useCallback(async (type: string, credentials: Record<string, string>) => {
    const result = await api.post<{ data: Connection }>('/api/v1/connectors/connect', { type, credentials });
    setConnections(prev => [...prev, result.data]);
    return result.data;
  }, []);

  const disconnect = useCallback(async (connectionId: string) => {
    await api.del(`/api/v1/connectors/${connectionId}`);
    setConnections(prev => prev.filter(c => c.id !== connectionId));
  }, []);

  useEffect(() => { loadConnectors(); }, [loadConnectors]);

  return { connectorTypes, connections, isLoading, error, connect, disconnect, refresh: loadConnectors };
}
