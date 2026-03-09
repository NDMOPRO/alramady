'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';

interface Widget {
  id: string;
  type: string;
  title: string;
  config: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
}

interface Dashboard {
  id: string;
  name: string;
  description: string;
  widgets: Widget[];
  filters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface DashboardListItem {
  id: string;
  name: string;
  description: string;
  widgetCount: number;
  updatedAt: string;
}

interface CrossFilterPayload {
  sourceWidgetId: string;
  field: string;
  value: unknown;
}

export function useDashboard(dashboardId?: string) {
  const [dashboards, setDashboards] = useState<DashboardListItem[]>([]);
  const [current, setCurrent] = useState<Dashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tvMode, setTvMode] = useState(false);

  const loadDashboards = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<{ data: DashboardListItem[] }>('/api/v1/dashboards');
      setDashboards(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboards');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDashboard = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<{ data: Dashboard }>(`/api/v1/dashboards/${id}`);
      setCurrent(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createDashboard = useCallback(async (payload: { name: string; description: string }) => {
    const result = await api.post<{ data: Dashboard }>('/api/v1/dashboards', payload);
    setDashboards(prev => [...prev, { id: result.data.id, name: result.data.name, description: result.data.description, widgetCount: 0, updatedAt: result.data.updatedAt }]);
    return result.data;
  }, []);

  const updateDashboard = useCallback(async (id: string, payload: { name?: string; description?: string }) => {
    const result = await api.put<{ data: Dashboard }>(`/api/v1/dashboards/${id}`, payload);
    setCurrent(result.data);
    setDashboards(prev => prev.map(d => d.id === id ? { ...d, name: result.data.name, description: result.data.description, updatedAt: result.data.updatedAt } : d));
    return result.data;
  }, []);

  const deleteDashboard = useCallback(async (id: string) => {
    await api.del(`/api/v1/dashboards/${id}`);
    setDashboards(prev => prev.filter(d => d.id !== id));
    if (current?.id === id) setCurrent(null);
  }, [current?.id]);

  const addWidget = useCallback(async (dId: string, widget: Omit<Widget, 'id'>) => {
    const result = await api.post<{ data: Widget }>(`/api/v1/dashboards/${dId}/widgets`, widget);
    setCurrent(prev => prev ? { ...prev, widgets: [...prev.widgets, result.data] } : prev);
    return result.data;
  }, []);

  const updateWidget = useCallback(async (dId: string, widgetId: string, updates: Partial<Widget>) => {
    const result = await api.put<{ data: Widget }>(`/api/v1/dashboards/${dId}/widgets/${widgetId}`, updates);
    setCurrent(prev => prev ? { ...prev, widgets: prev.widgets.map(w => w.id === widgetId ? result.data : w) } : prev);
    return result.data;
  }, []);

  const removeWidget = useCallback(async (dId: string, widgetId: string) => {
    await api.del(`/api/v1/dashboards/${dId}/widgets/${widgetId}`);
    setCurrent(prev => prev ? { ...prev, widgets: prev.widgets.filter(w => w.id !== widgetId) } : prev);
  }, []);

  const applyCrossFilter = useCallback(async (dId: string, payload: CrossFilterPayload) => {
    const result = await api.post<{ data: Dashboard }>(`/api/v1/dashboards/${dId}/cross-filter`, payload);
    setCurrent(result.data);
    return result.data;
  }, []);

  const toggleTvMode = useCallback(() => {
    setTvMode(prev => !prev);
  }, []);

  useEffect(() => {
    if (dashboardId) {
      loadDashboard(dashboardId);
    } else {
      loadDashboards();
    }
  }, [dashboardId, loadDashboard, loadDashboards]);

  return {
    dashboards,
    current,
    isLoading,
    error,
    tvMode,
    createDashboard,
    updateDashboard,
    deleteDashboard,
    addWidget,
    updateWidget,
    removeWidget,
    applyCrossFilter,
    toggleTvMode,
    refresh: dashboardId ? () => loadDashboard(dashboardId) : loadDashboards,
  };
}
