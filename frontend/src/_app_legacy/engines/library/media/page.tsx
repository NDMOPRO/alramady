'use client';
import { useState } from 'react';

interface MediaItem {
  id: number;
  name: string;
  type: 'image' | 'video' | 'document' | 'audio';
  size: string;
  date: string;
  tags: string[];
  thumbnail: string;
}

const mediaItems: MediaItem[] = [
  { id: 1, name: 'شعار_الشركة.png', type: 'image', size: '245 KB', date: '2025-03-04', tags: ['شعار', 'رسمي'], thumbnail: 'bg-blue-200' },
  { id: 2, name: 'صورة_الفريق.jpg', type: 'image', size: '1.8 MB', date: '2025-03-03', tags: ['فريق', 'صور'], thumbnail: 'bg-green-200' },
  { id: 3, name: 'فيديو_تعريفي.mp4', type: 'video', size: '45 MB', date: '2025-03-02', tags: ['فيديو', 'تعريفي'], thumbnail: 'bg-purple-200' },
  { id: 4, name: 'تقرير_سنوي.pdf', type: 'document', size: '3.4 MB', date: '2025-03-01', tags: ['تقرير', 'سنوي'], thumbnail: 'bg-red-200' },
  { id: 5, name: 'عرض_تقديمي.pptx', type: 'document', size: '12 MB', date: '2025-02-28', tags: ['عرض', 'تقديمي'], thumbnail: 'bg-amber-200' },
  { id: 6, name: 'تسجيل_صوتي.mp3', type: 'audio', size: '8.5 MB', date: '2025-02-27', tags: ['صوت', 'اجتماع'], thumbnail: 'bg-pink-200' },
  { id: 7, name: 'خلفية_الموقع.png', type: 'image', size: '890 KB', date: '2025-02-26', tags: ['خلفية', 'تصميم'], thumbnail: 'bg-indigo-200' },
  { id: 8, name: 'انفوجرافيك.svg', type: 'image', size: '156 KB', date: '2025-02-25', tags: ['انفوجرافيك', 'بيانات'], thumbnail: 'bg-teal-200' },
];

const typeIcons: Record<string, string> = { image: '🖼️', video: '🎬', document: '📄', audio: '🎵' };
const typeLabels: Record<string, string> = { image: 'صورة', video: 'فيديو', document: 'مستند', audio: 'صوت' };

export default function MediaLibraryPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedItems, setSelectedItems] = useState<number[]>([]);

  const filtered = mediaItems.filter(item =>
    (typeFilter === 'all' || item.type === typeFilter) &&
    (search === '' || item.name.includes(search) || item.tags.some(t => t.includes(search)))
  );

  const toggleSelect = (id: number) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">مكتبة الوسائط</h1>
          <p className="text-gray-500">Media Library - Upload, Tag, Search</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          + رفع ملفات
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الملفات', value: mediaItems.length, color: 'bg-blue-50 text-blue-700' },
          { label: 'الصور', value: mediaItems.filter(m => m.type === 'image').length, color: 'bg-green-50 text-green-700' },
          { label: 'الفيديوهات', value: mediaItems.filter(m => m.type === 'video').length, color: 'bg-purple-50 text-purple-700' },
          { label: 'المستندات', value: mediaItems.filter(m => m.type === 'document').length, color: 'bg-amber-50 text-amber-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الوسم... / Search by name or tag..."
          className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <div className="flex gap-2">
          {[{ key: 'all', label: 'الكل' }, { key: 'image', label: 'صور' }, { key: 'video', label: 'فيديو' }, { key: 'document', label: 'مستندات' }, { key: 'audio', label: 'صوت' }].map(f => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                typeFilter === f.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 border rounded-lg overflow-hidden">
          <button onClick={() => setViewMode('grid')} className={`px-3 py-1.5 text-sm ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white'}`}>شبكة</button>
          <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 text-sm ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white'}`}>قائمة</button>
        </div>
      </div>

      {selectedItems.length > 0 && (
        <div className="bg-blue-50 rounded-lg p-3 flex items-center gap-3">
          <span className="text-sm text-blue-700">{selectedItems.length} عنصر محدد</span>
          <button className="text-sm text-blue-600 hover:underline">تحميل</button>
          <button className="text-sm text-red-600 hover:underline">حذف</button>
          <button onClick={() => setSelectedItems([])} className="text-sm text-gray-500 hover:underline mr-auto">إلغاء</button>
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(item => (
            <div
              key={item.id}
              onClick={() => toggleSelect(item.id)}
              className={`bg-white rounded-xl shadow border cursor-pointer transition overflow-hidden ${
                selectedItems.includes(item.id) ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-100 hover:shadow-lg'
              }`}
            >
              <div className={`h-32 ${item.thumbnail} flex items-center justify-center text-4xl`}>
                {typeIcons[item.type]}
              </div>
              <div className="p-3">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-gray-400">{item.size}</span>
                  <span className="text-xs text-gray-400">{typeLabels[item.type]}</span>
                </div>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {item.tags.map((tag, j) => (
                    <span key={j} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          {filtered.map(item => (
            <div
              key={item.id}
              onClick={() => toggleSelect(item.id)}
              className={`flex items-center gap-4 p-4 border-b border-gray-100 cursor-pointer transition ${
                selectedItems.includes(item.id) ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <div className={`w-12 h-12 rounded-lg ${item.thumbnail} flex items-center justify-center text-xl`}>
                {typeIcons[item.type]}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{item.name}</p>
                <div className="flex gap-1 mt-1">
                  {item.tags.map((tag, j) => (
                    <span key={j} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{tag}</span>
                  ))}
                </div>
              </div>
              <span className="text-xs text-gray-400">{item.size}</span>
              <span className="text-xs text-gray-400">{item.date}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
