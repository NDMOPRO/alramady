'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  GitBranch, Search, Loader2, ArrowRight, Key, Link2, Table2,
  AlertCircle, CheckCircle, Plus, Eye,
} from 'lucide-react';
import { api } from '@/lib/api';

interface RelationshipSuggestion {
  sourceDataset: string;
  sourceColumn: string;
  targetDataset: string;
  targetColumn: string;
  confidence: number;
  type: 'primary_key' | 'foreign_key' | 'similar_values';
}

interface DatasetInfo {
  id: string;
  name: string;
  columnCount: number;
  rowCount: number;
}

export default function RelationsPage() {
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);

  const { data: datasetsRes, isLoading: loadingDatasets } = useQuery({
    queryKey: ['datasets-for-relations'],
    queryFn: () => api.get<{ success: boolean; data: DatasetInfo[] }>('/api/v1/data/sources'),
  });

  const detectRelationsMutation = useMutation({
    mutationFn: (datasetIds: string[]) =>
      api.post<{ success: boolean; data: { relationships: RelationshipSuggestion[] } }>(
        '/api/v1/data/key-detection/detect',
        { datasetIds }
      ),
  });

  const joinMutation = useMutation({
    mutationFn: (params: { leftDatasetId: string; rightDatasetId: string; leftColumn: string; rightColumn: string; joinType: string }) =>
      api.post<{ success: boolean; data: { previewRows: Record<string, unknown>[] } }>(
        '/api/v1/data/joins/preview',
        params
      ),
  });

  const datasets = (datasetsRes as { data?: DatasetInfo[] })?.data ?? [];
  const relations = detectRelationsMutation.data as { data?: { relationships: RelationshipSuggestion[] } };
  const suggestions = relations?.data?.relationships ?? [];

  const toggleDataset = (id: string) => {
    setSelectedDatasets(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
          <Link href="/data" className="hover:text-blue-600">محرك البيانات</Link>
          <span>/</span>
          <span>العلاقات</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">العلاقات بين الجداول</h1>
            <p className="text-gray-500">Cross-Dataset Relationship Graph</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Dataset Selection */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-4">اختر مجموعات البيانات</h3>
            {loadingDatasets ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              </div>
            ) : datasets.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">لا توجد مجموعات بيانات</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {datasets.map((ds: DatasetInfo) => (
                  <label
                    key={ds.id}
                    className={`flex items-center gap-3 rounded-lg p-3 cursor-pointer transition-colors ${
                      selectedDatasets.includes(ds.id) ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-transparent hover:bg-gray-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDatasets.includes(ds.id)}
                      onChange={() => toggleDataset(ds.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{ds.name}</p>
                      <p className="text-xs text-gray-400">{ds.columnCount ?? 0} عمود - {(ds.rowCount ?? 0).toLocaleString()} صف</p>
                    </div>
                    <Table2 className="h-4 w-4 text-gray-300" />
                  </label>
                ))}
              </div>
            )}

            <button
              onClick={() => {
                if (selectedDatasets.length >= 2) {
                  detectRelationsMutation.mutate(selectedDatasets);
                }
              }}
              disabled={selectedDatasets.length < 2 || detectRelationsMutation.isPending}
              className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {detectRelationsMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              اكتشاف العلاقات
            </button>
          </div>

          {/* Key Detection Info */}
          <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-3">اكتشاف المفاتيح</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-amber-500" />
                <span className="text-gray-600">المفاتيح الأولية</span>
              </div>
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-blue-500" />
                <span className="text-gray-600">المفاتيح الخارجية</span>
              </div>
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-green-500" />
                <span className="text-gray-600">علاقات القيم المتشابهة</span>
              </div>
            </div>
          </div>
        </div>

        {/* Relations Results */}
        <div className="lg:col-span-2">
          <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100 min-h-[400px]">
            <h3 className="font-semibold text-gray-900 mb-4">العلاقات المكتشفة</h3>

            {detectRelationsMutation.isError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                فشل في اكتشاف العلاقات. تأكد من اختيار مجموعتين على الأقل.
              </div>
            )}

            {!detectRelationsMutation.data && !detectRelationsMutation.isPending && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <GitBranch className="h-16 w-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">اختر مجموعتين أو أكثر</p>
                <p className="text-sm">ثم اضغط "اكتشاف العلاقات" لعرض الروابط</p>
              </div>
            )}

            {detectRelationsMutation.isPending && (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-blue-400 mb-4" />
                <p className="text-gray-500">جاري تحليل العلاقات...</p>
              </div>
            )}

            {suggestions.length > 0 && (
              <div className="space-y-3">
                {suggestions.map((rel: RelationshipSuggestion, i: number) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-4 hover:border-blue-200 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {rel.type === 'primary_key' && <Key className="h-4 w-4 text-amber-500" />}
                        {rel.type === 'foreign_key' && <Link2 className="h-4 w-4 text-blue-500" />}
                        {rel.type === 'similar_values' && <GitBranch className="h-4 w-4 text-green-500" />}
                        <span className="text-sm font-medium text-gray-900">
                          {rel.type === 'primary_key' ? 'مفتاح أولي' : rel.type === 'foreign_key' ? 'مفتاح خارجي' : 'قيم متشابهة'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          rel.confidence >= 0.8 ? 'bg-green-100 text-green-700' :
                          rel.confidence >= 0.5 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {Math.round(rel.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="rounded bg-gray-50 px-3 py-1.5">
                        <span className="text-gray-500">{rel.sourceDataset}</span>
                        <span className="text-gray-900 font-medium">.{rel.sourceColumn}</span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-300" />
                      <div className="rounded bg-gray-50 px-3 py-1.5">
                        <span className="text-gray-500">{rel.targetDataset}</span>
                        <span className="text-gray-900 font-medium">.{rel.targetColumn}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
