'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';

interface Language {
  code: string;
  name: string;
  nameAr: string;
  direction: 'ltr' | 'rtl';
}

interface TranslationResult {
  id: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceText: string;
  translatedText: string;
  qualityScore: number;
  createdAt: string;
}

interface QualityReport {
  overallScore: number;
  issues: Array<{ type: string; severity: 'low' | 'medium' | 'high'; description: string; position: number }>;
  suggestions: string[];
}

interface TitleProminenceResult {
  original: string;
  localized: string;
  prominence: number;
  alternatives: string[];
}

export function useLocalization() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [translations, setTranslations] = useState<TranslationResult[]>([]);

  const loadLanguages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<{ data: Language[] }>('/api/v1/localization/languages');
      setLanguages(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load languages');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const translate = useCallback(async (payload: { text: string; sourceLanguage: string; targetLanguage: string; context?: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<{ data: TranslationResult }>('/api/v1/localization/translate', payload);
      setTranslations(prev => [result.data, ...prev]);
      return result.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Translation failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const translateFile = useCallback(async (formData: FormData) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.upload<{ data: TranslationResult }>('/api/v1/localization/translate-file', formData);
      setTranslations(prev => [result.data, ...prev]);
      return result.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'File translation failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkQuality = useCallback(async (payload: { text: string; language: string; context?: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<{ data: QualityReport }>('/api/v1/localization/quality', payload);
      return result.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Quality check failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const titleProminence = useCallback(async (payload: { title: string; sourceLanguage: string; targetLanguage: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<{ data: TitleProminenceResult }>('/api/v1/localization/title-prominence', payload);
      return result.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Title prominence failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<{ data: TranslationResult[] }>('/api/v1/localization/history');
      setTranslations(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadLanguages(); }, [loadLanguages]);

  return {
    languages,
    translations,
    isLoading,
    error,
    translate,
    translateFile,
    checkQuality,
    titleProminence,
    loadHistory,
    refresh: loadLanguages,
  };
}
