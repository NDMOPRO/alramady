'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';

interface Report {
  id: string;
  title: string;
  description: string;
  type: string;
  status: 'draft' | 'published' | 'locked' | 'archived';
  content: Record<string, unknown>;
  scheduleCron: string | null;
  lockedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ReportListItem {
  id: string;
  title: string;
  type: string;
  status: string;
  updatedAt: string;
}

interface SchedulePayload {
  cron: string;
  recipients: string[];
  format: 'pdf' | 'excel' | 'html';
}

interface SmsDeliveryPayload {
  reportId: string;
  phoneNumbers: string[];
  message: string;
}

export function useReports(reportId?: string) {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [current, setCurrent] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<{ data: ReportListItem[] }>('/api/v1/reports');
      setReports(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadReport = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<{ data: Report }>(`/api/v1/reports/${id}`);
      setCurrent(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createReport = useCallback(async (payload: { title: string; description: string; type: string }) => {
    const result = await api.post<{ data: Report }>('/api/v1/reports', payload);
    setReports(prev => [...prev, { id: result.data.id, title: result.data.title, type: result.data.type, status: result.data.status, updatedAt: result.data.updatedAt }]);
    return result.data;
  }, []);

  const updateReport = useCallback(async (id: string, payload: Partial<Pick<Report, 'title' | 'description' | 'content'>>) => {
    const result = await api.put<{ data: Report }>(`/api/v1/reports/${id}`, payload);
    setCurrent(result.data);
    setReports(prev => prev.map(r => r.id === id ? { ...r, title: result.data.title, status: result.data.status, updatedAt: result.data.updatedAt } : r));
    return result.data;
  }, []);

  const deleteReport = useCallback(async (id: string) => {
    await api.del(`/api/v1/reports/${id}`);
    setReports(prev => prev.filter(r => r.id !== id));
    if (current?.id === id) setCurrent(null);
  }, [current?.id]);

  const scheduleReport = useCallback(async (id: string, schedule: SchedulePayload) => {
    const result = await api.post<{ data: Report }>(`/api/v1/reports/${id}/schedule`, schedule);
    setCurrent(result.data);
    return result.data;
  }, []);

  const removeSchedule = useCallback(async (id: string) => {
    const result = await api.del<{ data: Report }>(`/api/v1/reports/${id}/schedule`);
    setCurrent(result.data);
    return result.data;
  }, []);

  const lockReport = useCallback(async (id: string) => {
    const result = await api.post<{ data: Report }>(`/api/v1/reports/${id}/lock`, {});
    setCurrent(result.data);
    setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'locked' } : r));
    return result.data;
  }, []);

  const unlockReport = useCallback(async (id: string) => {
    const result = await api.post<{ data: Report }>(`/api/v1/reports/${id}/unlock`, {});
    setCurrent(result.data);
    setReports(prev => prev.map(r => r.id === id ? { ...r, status: result.data.status } : r));
    return result.data;
  }, []);

  const sendSms = useCallback(async (payload: SmsDeliveryPayload) => {
    const result = await api.post<{ data: { sent: number; failed: number } }>('/api/v1/reports/sms-deliver', payload);
    return result.data;
  }, []);

  useEffect(() => {
    if (reportId) {
      loadReport(reportId);
    } else {
      loadReports();
    }
  }, [reportId, loadReport, loadReports]);

  return {
    reports,
    current,
    isLoading,
    error,
    createReport,
    updateReport,
    deleteReport,
    scheduleReport,
    removeSchedule,
    lockReport,
    unlockReport,
    sendSms,
    refresh: reportId ? () => loadReport(reportId) : loadReports,
  };
}
