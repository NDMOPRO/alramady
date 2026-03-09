'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Upload, FileSpreadsheet, FileJson, FileText, Database, CheckCircle,
  ArrowLeft, ArrowRight, X, AlertCircle, Loader2, Eye, Download, Columns,
} from 'lucide-react';

type Step = 'upload' | 'mapping' | 'preview' | 'execute';

interface ColumnMapping {
  source: string;
  target: string;
  type: string;
  mapped: boolean;
}

interface PreviewRow {
  [key: string]: string;
}

interface UploadResponse {
  fileName: string;
  fileSize: string;
  totalRecords: number;
  totalColumns: number;
  columns: ColumnMapping[];
  preview: PreviewRow[];
}

interface ImportResponse {
  success: boolean;
  recordsImported: number;
}

const fileTypes = [
  { type: 'Excel', ext: '.xlsx, .xls', icon: FileSpreadsheet, color: 'bg-green-100 text-green-600' },
  { type: 'CSV', ext: '.csv', icon: FileText, color: 'bg-blue-100 text-blue-600' },
  { type: 'JSON', ext: '.json', icon: FileJson, color: 'bg-amber-100 text-amber-600' },
  { type: 'Database', ext: 'SQL Connection', icon: Database, color: 'bg-purple-100 text-purple-600' },
];

export default function SmartImportPage() {
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const steps: { key: Step; label: string; labelEn: string }[] = [
    { key: 'upload', label: 'رفع الملف', labelEn: 'Upload' },
    { key: 'mapping', label: 'ربط الأعمدة', labelEn: 'Mapping' },
    { key: 'preview', label: 'معاينة', labelEn: 'Preview' },
    { key: 'execute', label: 'تنفيذ', labelEn: 'Execute' },
  ];

  const stepIndex = steps.findIndex(s => s.key === currentStep);

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.upload<UploadResponse>('/api/data/import', formData);
      setUploadData(res);
    } catch (err: any) {
      setError(err.message || 'فشل رفع الملف');
      setSelectedFile(null);
    }
  };

  const handleNext = async () => {
    if (currentStep === 'execute') {
      setImporting(true);
      setError(null);
      try {
        const res = await api.post<ImportResponse>('/api/data/import/execute', {
          fileName: uploadData?.fileName,
          columns: uploadData?.columns,
        });
        setImportResult(res);
        setImportDone(true);
      } catch (err: any) {
        setError(err.message || 'فشل الاستيراد');
      } finally {
        setImporting(false);
      }
      return;
    }
    const nextIdx = stepIndex + 1;
    if (nextIdx < steps.length) setCurrentStep(steps[nextIdx].key);
  };

  const handleBack = () => {
    const prevIdx = stepIndex - 1;
    if (prevIdx >= 0) setCurrentStep(steps[prevIdx].key);
  };

  const columns = uploadData?.columns ?? [];
  const previewRows = uploadData?.preview ?? [];
  const previewKeys = previewRows.length > 0 ? Object.keys(previewRows[0]) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
          <Link href="/data" className="hover:text-blue-600">محرك البيانات</Link>
          <span>/</span>
          <span>الاستيراد الذكي</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">الاستيراد الذكي</h1>
        <p className="text-gray-500">Smart Import Wizard</p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Progress Steps */}
      <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm border border-gray-100">
        {steps.map((step, i) => (
          <div key={step.key} className="flex items-center gap-2 flex-1">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
              i < stepIndex ? 'bg-green-500 text-white' :
              i === stepIndex ? 'bg-blue-600 text-white' :
              'bg-gray-200 text-gray-500'
            }`}>
              {i < stepIndex ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{step.label}</p>
              <p className="text-xs text-gray-400">{step.labelEn}</p>
            </div>
            {i < steps.length - 1 && <div className="mx-2 h-px flex-1 bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        {/* Upload Step */}
        {currentStep === 'upload' && (
          <div className="space-y-6">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
            <div
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
                dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileSelect(file);
              }}
            >
              <Upload className="mb-4 h-12 w-12 text-gray-300" />
              <p className="text-lg font-medium text-gray-700">اسحب الملفات هنا أو انقر للاختيار</p>
              <p className="text-sm text-gray-400">Drag & drop files here or click to browse</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                اختيار ملف
              </button>
            </div>
            {selectedFile && (
              <div className="flex items-center gap-3 rounded-lg bg-green-50 p-4 border border-green-200">
                <FileSpreadsheet className="h-8 w-8 text-green-600" />
                <div className="flex-1">
                  <p className="font-medium text-green-800">{selectedFile.name}</p>
                  <p className="text-sm text-green-600">
                    {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                    {uploadData ? ` - ${uploadData.totalRecords} سجل - ${uploadData.totalColumns} عمود` : ''}
                  </p>
                </div>
                <button onClick={() => { setSelectedFile(null); setUploadData(null); }}><X className="h-5 w-5 text-green-400 hover:text-red-500" /></button>
              </div>
            )}
            <div>
              <p className="mb-3 text-sm font-medium text-gray-700">الأنواع المدعومة - Supported Types</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {fileTypes.map((ft) => {
                  const Icon = ft.icon;
                  return (
                    <div key={ft.type} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${ft.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{ft.type}</p>
                        <p className="text-xs text-gray-400">{ft.ext}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Mapping Step */}
        {currentStep === 'mapping' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">ربط الأعمدة - Column Mapping</h3>
              <button className="text-sm text-blue-600 hover:underline">ربط تلقائي بالذكاء الاصطناعي</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-start font-medium text-gray-500">العمود المصدر</th>
                    <th className="px-4 py-3 text-start font-medium text-gray-500">العمود الهدف</th>
                    <th className="px-4 py-3 text-start font-medium text-gray-500">النوع</th>
                    <th className="px-4 py-3 text-start font-medium text-gray-500">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {columns.map((col, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-gray-700">{col.source}</td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          defaultValue={col.target}
                          placeholder="حدد العمود الهدف..."
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{col.type}</span>
                      </td>
                      <td className="px-4 py-3">
                        {col.mapped ? (
                          <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle className="h-4 w-4" /> مربوط</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600"><AlertCircle className="h-4 w-4" /> غير مربوط</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Preview Step */}
        {currentStep === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">معاينة البيانات - Data Preview</h3>
              <p className="text-sm text-gray-400">عرض أول {previewRows.length} سجلات من {uploadData?.totalRecords ?? 0}</p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-2 text-start font-medium text-gray-500">#</th>
                    {previewKeys.map((key) => (
                      <th key={key} className="px-4 py-2 text-start font-medium text-gray-500">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {previewRows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                      {previewKeys.map((key) => (
                        <td key={key} className="px-4 py-2 text-gray-600">{row[key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-blue-50 p-3 text-center">
                <p className="text-xl font-bold text-blue-700">{uploadData?.totalRecords ?? 0}</p>
                <p className="text-xs text-blue-500">إجمالي السجلات</p>
              </div>
              <div className="rounded-lg bg-green-50 p-3 text-center">
                <p className="text-xl font-bold text-green-700">{columns.filter(c => c.mapped).length} / {columns.length}</p>
                <p className="text-xs text-green-500">أعمدة مربوطة</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3 text-center">
                <p className="text-xl font-bold text-amber-700">{columns.filter(c => !c.mapped).length}</p>
                <p className="text-xs text-amber-500">تحذيرات</p>
              </div>
            </div>
          </div>
        )}

        {/* Execute Step */}
        {currentStep === 'execute' && (
          <div className="space-y-6 text-center py-8">
            {!importing && !importDone && (
              <>
                <Upload className="mx-auto h-16 w-16 text-blue-300" />
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">جاهز للاستيراد</h3>
                  <p className="text-gray-500">Ready to import {uploadData?.totalRecords ?? 0} records</p>
                </div>
                <div className="mx-auto max-w-sm space-y-2 text-start">
                  <div className="flex justify-between text-sm"><span className="text-gray-500">الملف:</span><span className="font-medium">{selectedFile?.name}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">السجلات:</span><span className="font-medium">{uploadData?.totalRecords ?? 0}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">الأعمدة:</span><span className="font-medium">{columns.length}</span></div>
                </div>
              </>
            )}
            {importing && (
              <>
                <Loader2 className="mx-auto h-16 w-16 text-blue-500 animate-spin" />
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">جاري الاستيراد...</h3>
                  <p className="text-gray-500">Importing data, please wait...</p>
                </div>
              </>
            )}
            {importDone && (
              <>
                <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
                <div>
                  <h3 className="text-xl font-semibold text-green-700">تم الاستيراد بنجاح!</h3>
                  <p className="text-gray-500">Successfully imported {importResult?.recordsImported ?? 0} records</p>
                </div>
                <Link href="/data/tables" className="inline-block rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700">
                  عرض الجدول
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      {!importDone && (
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={stepIndex === 0}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <ArrowRight className="h-4 w-4" />
            السابق
          </button>
          <button
            onClick={handleNext}
            disabled={(currentStep === 'upload' && !uploadData) || importing}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {currentStep === 'execute' ? 'بدء الاستيراد' : 'التالي'}
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
