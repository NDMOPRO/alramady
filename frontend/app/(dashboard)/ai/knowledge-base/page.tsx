'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Database,
  FileText,
  Search,
  Loader2,
  AlertCircle,
  Trash2,
  Upload,
  MessageCircle,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import FileUploader from '@/components/ui/FileUploader';
import {
  fetchKnowledgeBases,
  createKnowledgeBase,
  deleteKnowledgeBase,
  uploadKBDocument,
  fetchKBDocuments,
  queryKnowledgeBase,
  type KnowledgeBase,
  type KBDocument,
  type KBQueryResult,
} from '@/lib/api/ai';

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  indexing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const statusLabels: Record<string, string> = {
  active: 'نشط',
  indexing: 'جاري الفهرسة',
  error: 'خطأ',
};

export default function KnowledgeBasePage() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedKBId, setSelectedKBId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newLang, setNewLang] = useState('ar');
  const [queryText, setQueryText] = useState('');
  const [queryResult, setQueryResult] = useState<KBQueryResult | null>(null);

  const { data: kbData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['knowledge-bases'],
    queryFn: () => fetchKnowledgeBases({ limit: 50 }),
  });

  const knowledgeBases = kbData?.data ?? [];

  const { data: documents } = useQuery({
    queryKey: ['kb-documents', selectedKBId],
    queryFn: () => fetchKBDocuments(selectedKBId!),
    enabled: !!selectedKBId,
  });

  const createMutation = useMutation({
    mutationFn: createKnowledgeBase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
      setShowCreateModal(false);
      setNewName('');
      setNewDesc('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteKnowledgeBase,
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
      if (selectedKBId === deletedId) {
        setSelectedKBId(null);
      }
    },
  });

  const queryMutation = useMutation({
    mutationFn: queryKnowledgeBase,
    onSuccess: (result) => {
      setQueryResult(result);
    },
  });

  const handleUploadFiles = async (files: File[]) => {
    if (!selectedKBId) return;
    for (const file of files) {
      await uploadKBDocument(selectedKBId, file);
    }
    queryClient.invalidateQueries({ queryKey: ['kb-documents', selectedKBId] });
  };

  const handleQuery = () => {
    const trimmed = queryText.trim();
    if (!trimmed || !selectedKBId) return;
    queryMutation.mutate({ query: trimmed, knowledgeBaseId: selectedKBId });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">إدارة قاعدة المعرفة</h1>
        <button onClick={() => setShowCreateModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-rasid-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-rasid-700">
          <Plus className="h-4 w-4" />
          إنشاء قاعدة معرفة
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-rasid-600" />
          <span className="ms-3 text-gray-500">جاري التحميل...</span>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-red-200 bg-red-50 py-12 dark:border-red-800 dark:bg-red-900/20">
          <AlertCircle className="h-10 w-10 text-red-500" />
          <p className="text-sm text-red-700 dark:text-red-400">{error instanceof Error ? error.message : 'حدث خطأ'}</p>
          <button onClick={() => refetch()} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700">إعادة المحاولة</button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="grid grid-cols-12 gap-6">
          {/* KB List */}
          <div className="col-span-5">
            {knowledgeBases.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white py-16 dark:border-gray-700 dark:bg-gray-800">
                <Database className="h-12 w-12 text-gray-300 dark:text-gray-600" />
                <p className="text-gray-500 dark:text-gray-400">لا توجد قواعد معرفة</p>
              </div>
            )}
            <div className="space-y-3">
              {knowledgeBases.map((kb: KnowledgeBase) => (
                <div
                  key={kb.id}
                  onClick={() => setSelectedKBId(kb.id)}
                  className={`cursor-pointer rounded-xl border p-4 transition ${
                    selectedKBId === kb.id
                      ? 'border-rasid-500 bg-rasid-50 dark:border-rasid-400 dark:bg-rasid-900/20'
                      : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                        <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{kb.name}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{kb.description}</p>
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(kb.id); }} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>{kb.documentCount} مستندات</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[kb.status]}`}>{statusLabels[kb.status]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detail Panel */}
          <div className="col-span-7 space-y-4">
            {selectedKBId ? (
              <>
                {/* Upload Section */}
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">المستندات</h3>
                    <button onClick={() => setShowUploadModal(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-rasid-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rasid-700">
                      <Upload className="h-3.5 w-3.5" />
                      رفع مستندات
                    </button>
                  </div>
                  {(!documents || documents.length === 0) && (
                    <div className="flex flex-col items-center gap-2 py-6 text-center">
                      <FileText className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                      <p className="text-xs text-gray-400">لا توجد مستندات</p>
                    </div>
                  )}
                  {documents && documents.length > 0 && (
                    <div className="space-y-2">
                      {documents.map((doc: KBDocument) => (
                        <div key={doc.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-600">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{doc.name}</span>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            doc.status === 'indexed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            doc.status === 'processing' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                            'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {doc.status === 'indexed' ? 'مفهرس' : doc.status === 'processing' ? 'قيد المعالجة' : 'خطأ'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Query Section */}
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">استعلام</h3>
                  <div className="flex gap-2">
                    <input
                      value={queryText}
                      onChange={(e) => setQueryText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                      placeholder="اطرح سؤالاً على قاعدة المعرفة..."
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    />
                    <button onClick={handleQuery} disabled={queryMutation.isPending || !queryText.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50">
                      {queryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      استعلام
                    </button>
                  </div>
                  {queryResult && (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
                        <h4 className="mb-1 text-xs font-semibold text-green-800 dark:text-green-400">الإجابة</h4>
                        <p className="text-sm text-green-900 dark:text-green-300">{queryResult.answer}</p>
                      </div>
                      {queryResult.sources.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-400">المصادر</h4>
                          <div className="space-y-2">
                            {queryResult.sources.map((src, idx) => (
                              <div key={idx} className="rounded-lg border border-gray-200 p-2 dark:border-gray-600">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{src.documentName}</span>
                                  <span className="text-xs text-gray-400">{(src.score * 100).toFixed(0)}%</span>
                                </div>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{src.chunk}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <MessageCircle className="h-12 w-12 text-gray-300 dark:text-gray-600" />
                <p className="text-gray-500 dark:text-gray-400">اختر قاعدة معرفة للبدء</p>
              </div>
            )}
          </div>
        </div>
      )}

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} titleAr="إنشاء قاعدة معرفة" footer={
        <>
          <button onClick={() => setShowCreateModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">إلغاء</button>
          <button onClick={() => createMutation.mutate({ name: newName, description: newDesc, language: newLang })} disabled={createMutation.isPending || !newName.trim()} className="inline-flex items-center gap-2 rounded-lg bg-rasid-600 px-4 py-2 text-sm text-white hover:bg-rasid-700 disabled:opacity-50">
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            إنشاء
          </button>
        </>
      }>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">اسم القاعدة</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="اسم قاعدة المعرفة" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">الوصف</label>
            <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="وصف القاعدة" rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">اللغة</label>
            <select value={newLang} onChange={(e) => setNewLang(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rasid-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              <option value="ar">العربية</option>
              <option value="en">الإنجليزية</option>
            </select>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showUploadModal} onClose={() => setShowUploadModal(false)} titleAr="رفع المستندات">
        <FileUploader
          onUpload={handleUploadFiles}
          accept={{ 'application/pdf': ['.pdf'], 'text/plain': ['.txt'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] }}
          maxFiles={10}
          labelAr="رفع المستندات"
          descriptionAr="اسحب الملفات وأفلتها هنا، أو انقر للتصفح"
        />
      </Modal>
    </div>
  );
}
