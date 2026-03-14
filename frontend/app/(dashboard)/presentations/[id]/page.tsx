'use client';

import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  FileImage,
  FileText,
  Layers,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import {
  addSlide,
  deletePresentation,
  deleteSlide,
  exportPresentation,
  fetchPresentation,
  updateSlide,
  type AddSlidePayload,
  type Slide,
  type SlideLayout,
} from '@/lib/api/presentation';
import { renderPreview, type RenderJob } from '@/lib/api/rendering';

function saveBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

export default function PresentationEditorPage() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const presentationId = typeof params?.id === "string" ? params.id : "";
  const [activeSlideIndex, setActiveSlideIndex] = React.useState(0);
  const [editLayout, setEditLayout] = React.useState<SlideLayout>('content');
  const [editTitle, setEditTitle] = React.useState('');
  const [editBody, setEditBody] = React.useState('');
  const [editSubtitle, setEditSubtitle] = React.useState('');
  const [editLeftContent, setEditLeftContent] = React.useState('');
  const [editRightContent, setEditRightContent] = React.useState('');
  const [editNotes, setEditNotes] = React.useState('');
  const [editorMessage, setEditorMessage] = React.useState('');
  const [editorError, setEditorError] = React.useState('');
  const [isExporting, setIsExporting] = React.useState(false);
  const [renderJob, setRenderJob] = React.useState<RenderJob | null>(null);
  const [isRendering, setIsRendering] = React.useState(false);

  const presentationQuery = useQuery({
    queryKey: ['presentation', presentationId],
    queryFn: () => fetchPresentation(presentationId),
    enabled: !!presentationId,
  });

  const presentation = presentationQuery.data;
  const slides = presentation?.slides ?? [];
  const activeSlide = slides[activeSlideIndex] ?? null;

  React.useEffect(() => {
    if (!activeSlide) {
      return;
    }

    setEditLayout(activeSlide.layout);
    setEditTitle(activeSlide.title);
    setEditBody(activeSlide.body);
    setEditSubtitle(activeSlide.subtitle);
    setEditLeftContent(activeSlide.leftContent);
    setEditRightContent(activeSlide.rightContent);
    setEditNotes(activeSlide.notes);
    setEditorMessage('');
    setEditorError('');
  }, [activeSlide?.id, activeSlide?.index, activeSlide?.layout, activeSlide?.title, activeSlide?.body, activeSlide?.subtitle, activeSlide?.leftContent, activeSlide?.rightContent, activeSlide?.notes]);

  const refreshPresentation = async () => {
    await queryClient.invalidateQueries({ queryKey: ['presentation', presentationId] });
    await queryClient.invalidateQueries({ queryKey: ['presentations', 'workspace'] });
  };

  const updateSlideMutation = useMutation({
    mutationFn: async () => {
      if (!activeSlide) {
        throw new Error('لا توجد شريحة محددة.');
      }

      await updateSlide(presentationId, {
        index: activeSlide.index,
        layout: editLayout,
        title: editTitle,
        body: editBody,
        subtitle: editSubtitle,
        leftContent: editLeftContent,
        rightContent: editRightContent,
        notes: editNotes,
      });
    },
    onSuccess: async () => {
      setEditorMessage('تم حفظ الشريحة على الخدمة الفعلية.');
      setEditorError('');
      await refreshPresentation();
    },
    onError: (error) => {
      setEditorError(error instanceof Error ? error.message : 'فشل حفظ الشريحة.');
      setEditorMessage('');
    },
  });

  const addSlideMutation = useMutation({
    mutationFn: async () => {
      const payload: AddSlidePayload = {
        layout: 'content',
        title: 'شريحة جديدة',
        body: 'أدخل المحتوى هنا',
        notes: '',
      };

      return addSlide(presentationId, payload);
    },
    onSuccess: async (createdSlide) => {
      setEditorError('');
      setEditorMessage('تم إنشاء شريحة جديدة.');
      await refreshPresentation();
      setActiveSlideIndex(createdSlide.slideIndex);
    },
    onError: (error) => {
      setEditorError(error instanceof Error ? error.message : 'فشل إنشاء الشريحة.');
      setEditorMessage('');
    },
  });

  const deleteSlideMutation = useMutation({
    mutationFn: async () => {
      if (!activeSlide) {
        throw new Error('لا توجد شريحة محددة.');
      }

      await deleteSlide(presentationId, activeSlide.index);
    },
    onSuccess: async () => {
      setEditorError('');
      setEditorMessage('تم حذف الشريحة.');
      await refreshPresentation();
      setActiveSlideIndex((currentIndex) => Math.max(0, currentIndex - 1));
    },
    onError: (error) => {
      setEditorError(error instanceof Error ? error.message : 'فشل حذف الشريحة.');
      setEditorMessage('');
    },
  });

  const deletePresentationMutation = useMutation({
    mutationFn: () => deletePresentation(presentationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['presentations', 'workspace'] });
      router.push('/presentations');
    },
    onError: (error) => {
      setEditorError(error instanceof Error ? error.message : 'فشل حذف العرض.');
    },
  });

  const handleExport = async (format: 'pptx' | 'pdf') => {
    setIsExporting(true);
    setEditorError('');

    try {
      const blob = await exportPresentation(presentationId, format);
      saveBlob(blob, `${presentation?.name || 'presentation'}.${format}`);
      setEditorMessage(`تم تصدير ${format.toUpperCase()} من الخدمة الفعلية.`);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'فشل التصدير.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleRenderPreview = async () => {
    setIsRendering(true);
    setEditorError('');
    try {
      const job = await renderPreview({
        templateId: presentationId,
        format: 'png',
        width: 1280,
        height: 720,
        data: { slideIndex: activeSlideIndex },
      });
      setRenderJob(job);
      setEditorMessage('تم إرسال طلب المعاينة إلى خدمة العرض.');
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'فشل طلب المعاينة.');
    } finally {
      setIsRendering(false);
    }
  };

  if (presentationQuery.isLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
        <span className="ms-3 text-gray-500">جاري تحميل العرض...</span>
      </div>
    );
  }

  if (presentationQuery.isError || !presentation) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="text-red-700 dark:text-red-400">
          {presentationQuery.error instanceof Error ? presentationQuery.error.message : 'تعذر تحميل العرض.'}
        </p>
        <button
          onClick={() => presentationQuery.refetch()}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/presentations')}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100" data-testid="presentation-title">
              {presentation.name}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{slides.length} شرائح</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleRenderPreview}
            disabled={isRendering}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-300 px-3 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-50 disabled:opacity-50 dark:border-sky-600 dark:text-sky-300 dark:hover:bg-sky-900"
            data-testid="presentation-render-preview"
          >
            {isRendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
            معاينة الشريحة
          </button>
          <button
            onClick={() => handleExport('pptx')}
            disabled={isExporting}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            data-testid="presentation-export-pptx"
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            تصدير PPTX
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={isExporting}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            data-testid="presentation-export-pdf"
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />}
            تصدير PDF
          </button>
          <button
            onClick={() => deletePresentationMutation.mutate()}
            disabled={deletePresentationMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
            data-testid="presentation-delete"
          >
            {deletePresentationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            حذف العرض
          </button>
        </div>
      </div>

      {(editorMessage || editorError) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            editorError
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200'
          }`}
        >
          {editorError || editorMessage}
        </div>
      )}

      <div className="grid h-[calc(100vh-240px)] grid-cols-12 gap-4">
        <div className="col-span-3 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">متصفح الشرائح</h2>
            <button
              onClick={() => addSlideMutation.mutate()}
              disabled={addSlideMutation.isPending}
              className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20"
              title="إضافة شريحة"
              data-testid="presentation-add-slide"
            >
              {addSlideMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </div>

          <div className="space-y-2">
            {slides.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Layers className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                <p className="text-xs text-gray-400">لا توجد شرائح</p>
              </div>
            )}

            {slides.map((slide, index) => (
              <button
                key={slide.id}
                onClick={() => setActiveSlideIndex(index)}
                className={`w-full rounded-lg border p-2 text-start transition ${
                  index === activeSlideIndex
                    ? 'border-sky-500 bg-sky-50 dark:border-sky-400 dark:bg-sky-900/20'
                    : 'border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500'
                }`}
                data-testid={`presentation-slide-${slide.index}`}
              >
                <div className="mb-2 flex aspect-video w-full items-center justify-center overflow-hidden rounded bg-gray-100 text-xs font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                  {slide.layout}
                </div>
                <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">
                  {slide.title || `شريحة ${index + 1}`}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-5 flex items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900 xl:col-span-6">
          {activeSlide ? (
            <div className="aspect-video w-full max-w-3xl rounded-2xl bg-white p-8 shadow-lg dark:bg-gray-800" data-testid="presentation-slide-preview">
              {activeSlide.layout === 'title' && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <h2 className="text-3xl font-black text-gray-900 dark:text-gray-100">{activeSlide.title}</h2>
                  <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">{activeSlide.subtitle}</p>
                </div>
              )}

              {activeSlide.layout === 'two-column' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100">{activeSlide.title}</h2>
                  <div className="grid grid-cols-2 gap-6 text-sm text-gray-700 dark:text-gray-300">
                    <div className="whitespace-pre-wrap rounded-2xl bg-gray-50 p-4 dark:bg-gray-900">{activeSlide.leftContent}</div>
                    <div className="whitespace-pre-wrap rounded-2xl bg-gray-50 p-4 dark:bg-gray-900">{activeSlide.rightContent}</div>
                  </div>
                </div>
              )}

              {(activeSlide.layout === 'content' || activeSlide.layout === 'blank') && (
                <div className="space-y-4">
                  {activeSlide.title && (
                    <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100">{activeSlide.title}</h2>
                  )}
                  <div className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">{activeSlide.body}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400">
              <Layers className="mx-auto mb-3 h-16 w-16" />
              <p>اختر شريحة للمعاينة</p>
            </div>
          )}
        </div>

        <div className="col-span-4 overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          {activeSlide ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">لوحة التعديل</h2>
                <div className="flex gap-1">
                  <button
                    onClick={() => updateSlideMutation.mutate()}
                    disabled={updateSlideMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                    data-testid="presentation-save-slide"
                  >
                    {updateSlideMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    حفظ
                  </button>
                  <button
                    onClick={() => deleteSlideMutation.mutate()}
                    disabled={deleteSlideMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    data-testid="presentation-delete-slide"
                  >
                    {deleteSlideMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    حذف
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">نوع التخطيط</label>
                <select
                  value={editLayout}
                  onChange={(event) => setEditLayout(event.target.value as SlideLayout)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  data-testid="presentation-slide-layout"
                >
                  <option value="title">title</option>
                  <option value="content">content</option>
                  <option value="two-column">two-column</option>
                  <option value="blank">blank</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">عنوان الشريحة</label>
                <input
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  data-testid="presentation-slide-title"
                />
              </div>

              {editLayout === 'title' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">العنوان الفرعي</label>
                  <textarea
                    value={editSubtitle}
                    onChange={(event) => setEditSubtitle(event.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    data-testid="presentation-slide-subtitle"
                  />
                </div>
              )}

              {editLayout === 'two-column' && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">المحتوى الأيسر</label>
                    <textarea
                      value={editLeftContent}
                      onChange={(event) => setEditLeftContent(event.target.value)}
                      rows={6}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      data-testid="presentation-slide-left"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">المحتوى الأيمن</label>
                    <textarea
                      value={editRightContent}
                      onChange={(event) => setEditRightContent(event.target.value)}
                      rows={6}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      data-testid="presentation-slide-right"
                    />
                  </div>
                </>
              )}

              {(editLayout === 'content' || editLayout === 'blank') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">محتوى الشريحة</label>
                  <textarea
                    value={editBody}
                    onChange={(event) => setEditBody(event.target.value)}
                    rows={10}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    data-testid="presentation-slide-body"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">ملاحظات المتحدث</label>
                <textarea
                  value={editNotes}
                  onChange={(event) => setEditNotes(event.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  data-testid="presentation-slide-notes"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">عناصر الشريحة</label>
                <div className="space-y-1">
                  {activeSlide.elements.length === 0 && <p className="text-xs text-gray-400">لا توجد عناصر</p>}
                  {activeSlide.elements.map((element) => (
                    <div
                      key={element.id}
                      className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-xs dark:border-gray-600"
                    >
                      <span className="font-medium text-gray-700 dark:text-gray-300">{element.type}</span>
                      <span className="text-gray-400">
                        {element.width}x{element.height}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-gray-400">
              <Layers className="mb-2 h-8 w-8" />
              <p className="text-sm">اختر شريحة للتعديل</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
