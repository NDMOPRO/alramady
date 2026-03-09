'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';

interface Slide {
  id: string;
  order: number;
  type: string;
  content: Record<string, unknown>;
}

interface Presentation {
  id: string;
  title: string;
  description: string;
  slides: Slide[];
  password: string | null;
  qrCode: string | null;
  isLive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PresentationListItem {
  id: string;
  title: string;
  slideCount: number;
  isLive: boolean;
  updatedAt: string;
}

interface VideoExportResult {
  jobId: string;
  status: string;
  url: string | null;
}

interface HtmlExportResult {
  url: string;
  size: number;
}

export function usePresentations(presentationId?: string) {
  const [presentations, setPresentations] = useState<PresentationListItem[]>([]);
  const [current, setCurrent] = useState<Presentation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPresentations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<{ data: PresentationListItem[] }>('/api/v1/presentations');
      setPresentations(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load presentations');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadPresentation = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<{ data: Presentation }>(`/api/v1/presentations/${id}`);
      setCurrent(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load presentation');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createPresentation = useCallback(async (payload: { title: string; description: string }) => {
    const result = await api.post<{ data: Presentation }>('/api/v1/presentations', payload);
    setPresentations(prev => [...prev, { id: result.data.id, title: result.data.title, slideCount: result.data.slides.length, isLive: result.data.isLive, updatedAt: result.data.updatedAt }]);
    return result.data;
  }, []);

  const updatePresentation = useCallback(async (id: string, payload: Partial<Pick<Presentation, 'title' | 'description'>>) => {
    const result = await api.put<{ data: Presentation }>(`/api/v1/presentations/${id}`, payload);
    setCurrent(result.data);
    setPresentations(prev => prev.map(p => p.id === id ? { ...p, title: result.data.title, updatedAt: result.data.updatedAt } : p));
    return result.data;
  }, []);

  const deletePresentation = useCallback(async (id: string) => {
    await api.del(`/api/v1/presentations/${id}`);
    setPresentations(prev => prev.filter(p => p.id !== id));
    if (current?.id === id) setCurrent(null);
  }, [current?.id]);

  const generateQr = useCallback(async (id: string) => {
    const result = await api.post<{ data: { qrCode: string } }>(`/api/v1/presentations/${id}/qr`, {});
    setCurrent(prev => prev ? { ...prev, qrCode: result.data.qrCode } : prev);
    return result.data.qrCode;
  }, []);

  const setPassword = useCallback(async (id: string, password: string) => {
    const result = await api.post<{ data: Presentation }>(`/api/v1/presentations/${id}/password`, { password });
    setCurrent(result.data);
    return result.data;
  }, []);

  const removePassword = useCallback(async (id: string) => {
    const result = await api.del<{ data: Presentation }>(`/api/v1/presentations/${id}/password`);
    setCurrent(result.data);
    return result.data;
  }, []);

  const exportVideo = useCallback(async (id: string, options: { resolution: string; fps: number }) => {
    const result = await api.post<{ data: VideoExportResult }>(`/api/v1/presentations/${id}/export/video`, options);
    return result.data;
  }, []);

  const checkVideoStatus = useCallback(async (id: string, jobId: string) => {
    const result = await api.get<{ data: VideoExportResult }>(`/api/v1/presentations/${id}/export/video/${jobId}`);
    return result.data;
  }, []);

  const startLive = useCallback(async (id: string) => {
    const result = await api.post<{ data: { sessionUrl: string } }>(`/api/v1/presentations/${id}/live/start`, {});
    setCurrent(prev => prev ? { ...prev, isLive: true } : prev);
    setPresentations(prev => prev.map(p => p.id === id ? { ...p, isLive: true } : p));
    return result.data.sessionUrl;
  }, []);

  const stopLive = useCallback(async (id: string) => {
    await api.post<{ data: { stopped: boolean } }>(`/api/v1/presentations/${id}/live/stop`, {});
    setCurrent(prev => prev ? { ...prev, isLive: false } : prev);
    setPresentations(prev => prev.map(p => p.id === id ? { ...p, isLive: false } : p));
  }, []);

  const exportHtml = useCallback(async (id: string) => {
    const result = await api.post<{ data: HtmlExportResult }>(`/api/v1/presentations/${id}/export/html`, {});
    return result.data;
  }, []);

  useEffect(() => {
    if (presentationId) {
      loadPresentation(presentationId);
    } else {
      loadPresentations();
    }
  }, [presentationId, loadPresentation, loadPresentations]);

  return {
    presentations,
    current,
    isLoading,
    error,
    createPresentation,
    updatePresentation,
    deletePresentation,
    generateQr,
    setPassword,
    removePassword,
    exportVideo,
    checkVideoStatus,
    startLive,
    stopLive,
    exportHtml,
    refresh: presentationId ? () => loadPresentation(presentationId) : loadPresentations,
  };
}
