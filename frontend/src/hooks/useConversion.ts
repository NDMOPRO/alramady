'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';

interface ConversionJob {
  id: string;
  sourceFormat: string;
  targetFormat: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  outputUrl: string | null;
  createdAt: string;
}

interface TranscriptionResult {
  id: string;
  text: string;
  language: string;
  duration: number;
  segments: Array<{ start: number; end: number; text: string }>;
}

interface LegalArchiveResult {
  id: string;
  originalFileId: string;
  pdfaUrl: string;
  metadata: Record<string, string>;
  complianceStatus: string;
}

export function useConversion() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ConversionJob[]>([]);

  const convert = useCallback(async (fileId: string, targetFormat: string, options?: Record<string, unknown>) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<{ data: ConversionJob }>('/api/v1/conversion/convert', { fileId, targetFormat, options });
      setJobs(prev => [...prev, result.data]);
      return result.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Conversion failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkStatus = useCallback(async (jobId: string) => {
    const result = await api.get<{ data: ConversionJob }>(`/api/v1/conversion/jobs/${jobId}`);
    setJobs(prev => prev.map(j => j.id === jobId ? result.data : j));
    return result.data;
  }, []);

  const transcribeAudio = useCallback(async (formData: FormData) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.upload<{ data: TranscriptionResult }>('/api/v1/conversion/transcribe', formData);
      return result.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transcription failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const archiveLegal = useCallback(async (fileId: string, metadata: Record<string, string>) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<{ data: LegalArchiveResult }>('/api/v1/conversion/legal-archive', { fileId, metadata });
      return result.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Legal archive failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadJobs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<{ data: ConversionJob[] }>('/api/v1/conversion/jobs');
      setJobs(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  return {
    isLoading,
    error,
    jobs,
    convert,
    checkStatus,
    transcribeAudio,
    archiveLegal,
    refresh: loadJobs,
  };
}
