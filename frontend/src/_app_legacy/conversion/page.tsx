"use client";

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import {
  RefreshCw,
  FileText,
  FileSpreadsheet,
  Presentation,
  ImageIcon,
  Code,
  Layers,
  Zap,
  Settings,
  Loader2,
  AlertCircle,
  Upload,
} from "lucide-react";

interface ConversionStats {
  todayConversions: number;
  supportedFormats: number;
  pipelines: number;
  successRate: string;
}

interface Module {
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
  status: string;
}

interface ConversionResponse {
  stats: ConversionStats;
  modules: Module[];
}

const iconMap: Record<string, any> = {
  FileText, FileSpreadsheet, Presentation, ImageIcon, Code, Layers, Zap, Settings,
};

export default function ConversionEnginePage() {
  const [stats, setStats] = useState<ConversionStats | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<ConversionResponse>('/api/conversion')
      .then(res => {
        setStats(res.stats);
        setModules(res.modules);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleConvert = async (file: File) => {
    setConverting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.upload('/api/conversion/convert', formData);
      // Refresh stats after conversion
      const res = await api.get<ConversionResponse>('/api/conversion');
      setStats(res.stats);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setConverting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-rose-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-rose-50">
            <RefreshCw className="h-7 w-7 text-rose-600" />
          </div>
          <div>
            <h1 className="page-title">محرك التحويل</h1>
            <p className="text-lg font-medium text-rose-600">Conversion Engine</p>
          </div>
        </div>
        <p className="page-description mt-4">
          تحويل تنسيقات الملفات بدعم PDF وDOCX وXLSX وPPTX وHTML وCSV وJSON وتنسيقات الصور مع
          المعالجة الدفعية. يوفر خطوط أنابيب تحويل قابلة للربط وإعدادات جودة مخصصة.
        </p>
        <div className="mt-4">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleConvert(file);
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={converting}
            className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {converting ? 'جاري التحويل...' : 'تحويل ملف'}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-rose-600">{stats?.todayConversions ?? 0}</p>
          <p className="text-sm text-gray-500">تحويلات اليوم</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-rose-600">{stats?.supportedFormats ?? 0}</p>
          <p className="text-sm text-gray-500">تنسيقات مدعومة</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-rose-600">{stats?.pipelines ?? 0}</p>
          <p className="text-sm text-gray-500">خطوط أنابيب</p>
        </div>
        <div className="section-card text-center">
          <p className="text-3xl font-bold text-rose-600">{stats?.successRate ?? '--'}</p>
          <p className="text-sm text-gray-500">معدل النجاح</p>
        </div>
      </div>

      <h2 className="section-title mb-6 text-2xl">الوحدات - Modules</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => {
          const Icon = iconMap[mod.icon] || FileText;
          return (
            <div key={mod.title} className="section-card">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50">
                  <Icon className="h-5 w-5 text-rose-600" />
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                  {mod.status === "planned" ? "مخطط" : "نشط"}
                </span>
              </div>
              <h3 className="mb-1 font-semibold text-gray-900">{mod.titleAr}</h3>
              <p className="mb-2 text-sm font-medium text-gray-400">{mod.title}</p>
              <p className="text-sm leading-relaxed text-gray-600">{mod.descriptionAr}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
