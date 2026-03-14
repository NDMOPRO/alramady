/* RASID Visual DNA — Workspace Views
   5 workspace areas: بياناتي، عروضي، تقاريري، مطابقة، مكتبتي
   Mobile-responsive layouts */
import { useState } from 'react';
import MaterialIcon from './MaterialIcon';
import { CHARACTERS, REPORT_ACTIONS, PRESENTATION_ACTIONS, DASHBOARD_ACTIONS } from '@/lib/assets';
import { useTheme } from '@/contexts/ThemeContext';

interface WorkspaceViewProps {
  viewId: string;
}

export default function WorkspaceView({ viewId }: WorkspaceViewProps) {
  switch (viewId) {
    case 'data': return <DataWorkspace />;
    case 'presentations': return <PresentationsWorkspace />;
    case 'reports': return <ReportsWorkspace />;
    case 'matching': return <MatchingWorkspace />;
    case 'library': return <LibraryWorkspace />;
    default: return <DataWorkspace />;
  }
}

/* ===== بياناتي — Smart Table ===== */
function DataWorkspace() {
  const [dragOver, setDragOver] = useState(false);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);

  const sampleHeaders = ['الجهة', 'نسبة الامتثال', 'مستوى النضج', 'البيانات المفتوحة', 'التصنيف', 'الحالة'];
  const sampleRows = [
    ['وزارة المالية', '٩٤٪', 'متقدم', '٨٧٪', 'أ', 'مكتمل'],
    ['وزارة الصحة', '٨٨٪', 'متقدم', '٧٩٪', 'أ', 'مكتمل'],
    ['وزارة التعليم', '٧٦٪', 'متوسط', '٦٥٪', 'ب', 'قيد المراجعة'],
    ['هيئة الاتصالات', '٩١٪', 'متقدم', '٨٣٪', 'أ', 'مكتمل'],
    ['هيئة الزكاة', '٦٩٪', 'مبتدئ', '٤٢٪', 'ج', 'يحتاج تحسين'],
    ['وزارة الداخلية', '٨٢٪', 'متوسط', '٧١٪', 'ب', 'مكتمل'],
    ['هيئة السوق المالية', '٩٦٪', 'متقدم', '٩٠٪', 'أ+', 'مكتمل'],
  ];

  const toggleRow = (i: number) => {
    setSelectedRows(prev => prev.includes(i) ? prev.filter(r => r !== i) : [...prev, i]);
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'مكتمل': return 'badge-success';
      case 'قيد المراجعة': return 'badge-info';
      case 'يحتاج تحسين': return 'badge-danger';
      default: return 'badge-warning';
    }
  };

  const getMaturityStyle = (level: string) => {
    switch (level) {
      case 'متقدم': return 'text-success';
      case 'متوسط': return 'text-warning';
      case 'مبتدئ': return 'text-danger';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div
      className={`flex-1 h-full bg-card rounded-2xl flex flex-col overflow-hidden shadow-sm ${dragOver ? 'drop-zone-active' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={() => setDragOver(false)}
    >
      {/* Toolbar */}
      <div className="h-10 flex items-center gap-1 px-2 sm:px-3 border-b border-border shrink-0 overflow-x-auto no-scrollbar">
        <ToolbarBtn icon="upload_file" label="استيراد" />
        <ToolbarBtn icon="cleaning_services" label="تنظيف" />
        <ToolbarBtn icon="merge_type" label="دمج" />
        <ToolbarBtn icon="analytics" label="تحليل" />
        <ToolbarBtn icon="download" label="تصدير" />
        <div className="flex-1" />
        {selectedRows.length > 0 && (
          <span className="text-[9px] sm:text-[10px] text-primary font-medium animate-fade-in">{selectedRows.length} محدد</span>
        )}
        <span className="text-[9px] sm:text-[10px] text-muted-foreground whitespace-nowrap">{sampleRows.length} صفوف</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px] sm:text-[12px]">
          <thead>
            <tr className="bg-accent/20">
              <th className="w-8 text-center py-2 text-muted-foreground font-medium text-[9px] sm:text-[10px]">#</th>
              {sampleHeaders.map(h => (
                <th key={h} className="text-right py-2 px-2 sm:px-3 text-muted-foreground font-medium text-[9px] sm:text-[10px] border-b border-border whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sampleRows.map((row, i) => (
              <tr
                key={i}
                onClick={() => toggleRow(i)}
                className={`hover:bg-accent/15 transition-colors border-b border-border/40 cursor-pointer animate-stagger-in ${selectedRows.includes(i) ? 'bg-primary/5' : ''}`}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <td className="text-center py-2 text-muted-foreground text-[9px] sm:text-[10px]">{i + 1}</td>
                <td className="py-2 px-2 sm:px-3 text-foreground font-medium whitespace-nowrap">{row[0]}</td>
                <td className="py-2 px-2 sm:px-3 text-foreground">{row[1]}</td>
                <td className={`py-2 px-2 sm:px-3 font-medium ${getMaturityStyle(row[2])}`}>{row[2]}</td>
                <td className="py-2 px-2 sm:px-3 text-foreground">{row[3]}</td>
                <td className="py-2 px-2 sm:px-3">
                  <span className="text-[9px] sm:text-[10px] font-bold">{row[4]}</span>
                </td>
                <td className="py-2 px-2 sm:px-3">
                  <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded font-medium ${getStatusStyle(row[5])}`}>{row[5]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RasidMiniBar placeholder="اسأل راصد عن البيانات..." />
    </div>
  );
}

/* ===== عروضي — Slide Builder ===== */
function PresentationsWorkspace() {
  const [activeSlide, setActiveSlide] = useState(0);
  const slides = [
    { title: 'تقرير نضج البيانات الوطنية', subtitle: 'الربع الرابع ٢٠٢٥' },
    { title: 'النتائج الرئيسية', subtitle: '١٧ جهة حكومية' },
    { title: 'مستوى الامتثال', subtitle: 'تحليل مقارن' },
    { title: 'التوصيات', subtitle: 'خطة التحسين' },
    { title: 'الخطوات التالية', subtitle: 'الربع الأول ٢٠٢٦' },
  ];

  return (
    <div className="flex-1 h-full bg-card rounded-2xl flex flex-col overflow-hidden shadow-sm">
      <div className="h-10 flex items-center gap-1 px-2 sm:px-3 border-b border-border shrink-0 overflow-x-auto no-scrollbar">
        <ToolbarBtn icon="add" label="شريحة جديدة" />
        <ToolbarBtn icon="auto_fix_high" label="توليد تلقائي" />
        <ToolbarBtn icon="palette" label="القالب" />
        <ToolbarBtn icon="play_arrow" label="عرض" />
        <div className="flex-1" />
        <ActionButtons actions={PRESENTATION_ACTIONS} />
      </div>

      <div className="flex-1 flex flex-col sm:flex-row">
        {/* Slide Thumbnails — horizontal on mobile, vertical on desktop */}
        <div className="sm:w-[140px] border-b sm:border-b-0 sm:border-l border-border bg-accent/15 p-1.5 sm:p-2 overflow-auto flex sm:flex-col gap-1.5 shrink-0">
          {slides.map((s, n) => (
            <button
              key={n}
              onClick={() => setActiveSlide(n)}
              className={`aspect-[16/9] rounded-lg border-2 transition-all cursor-pointer animate-stagger-in shrink-0 w-[100px] sm:w-full ${
                n === activeSlide ? 'border-primary shadow-sm' : 'border-border/50 hover:border-primary/20'
              }`}
              style={{ animationDelay: `${n * 0.05}s` }}
            >
              <div className="w-full h-full bg-card rounded-md p-1.5 flex flex-col items-center justify-center">
                <div className="w-3/4 h-1.5 bg-muted rounded-full mb-1" />
                <div className="w-1/2 h-1 bg-muted/50 rounded-full" />
              </div>
            </button>
          ))}
        </div>

        {/* Main Slide Canvas */}
        <div className="flex-1 flex items-center justify-center p-3 sm:p-5">
          <div className="w-full max-w-[600px] aspect-[16/9] bg-gradient-to-br from-primary/3 to-accent rounded-xl border border-border shadow-sm flex flex-col items-center justify-center p-4 sm:p-6 animate-morph-in">
            <h3 className="text-[14px] sm:text-[20px] font-bold text-foreground mb-1 text-center">{slides[activeSlide].title}</h3>
            <p className="text-[11px] sm:text-[13px] text-muted-foreground mb-3 sm:mb-4">{slides[activeSlide].subtitle}</p>
            {activeSlide === 0 && (
              <div className="flex gap-2 animate-rise flex-wrap justify-center" style={{ animationDelay: '0.2s' }}>
                <div className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 bg-primary/8 rounded-lg text-[9px] sm:text-[11px] font-medium text-primary">١٧ جهة حكومية</div>
                <div className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 bg-success/10 rounded-lg text-[9px] sm:text-[11px] font-medium text-success">نسبة امتثال ٨٥٪</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <RasidMiniBar placeholder="اطلب من راصد تعديل العرض..." />
    </div>
  );
}

/* ===== تقاريري — Report Editor ===== */
function ReportsWorkspace() {
  return (
    <div className="flex-1 h-full bg-card rounded-2xl flex flex-col overflow-hidden shadow-sm">
      <div className="h-10 flex items-center gap-1 px-2 sm:px-3 border-b border-border shrink-0 overflow-x-auto no-scrollbar">
        <ToolbarBtn icon="auto_fix_high" label="توليد تلقائي" />
        <div className="h-4 w-px bg-border" />
        <ToolbarBtn icon="format_bold" label="" />
        <ToolbarBtn icon="format_italic" label="" />
        <ToolbarBtn icon="format_underlined" label="" />
        <div className="h-4 w-px bg-border" />
        <ToolbarBtn icon="format_list_bulleted" label="" />
        <ToolbarBtn icon="format_list_numbered" label="" />
        <div className="flex-1" />
        <ActionButtons actions={REPORT_ACTIONS} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-10 py-4 sm:py-6">
        <div className="max-w-[660px] mx-auto animate-fade-in-up">
          {/* Cover */}
          <div className="text-center mb-6 sm:mb-8 pb-4 sm:pb-6 border-b border-border">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2 sm:mb-3">
              <MaterialIcon icon="description" size={22} className="text-primary" />
            </div>
            <h1 className="text-[18px] sm:text-[22px] font-bold text-foreground mb-1">تقرير الرصد الربعي لامتثال الجهات</h1>
            <p className="text-[11px] sm:text-[13px] text-muted-foreground">الربع الرابع — ٢٠٢٥</p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1">مكتب إدارة البيانات الوطنية</p>
          </div>

          {/* Executive Summary */}
          <div className="mb-5 sm:mb-6">
            <h2 className="text-[14px] sm:text-[16px] font-bold text-foreground mb-2 flex items-center gap-2">
              <MaterialIcon icon="summarize" size={17} className="text-primary" />
              الملخص التنفيذي
            </h2>
            <p className="text-[12px] sm:text-[13px] text-foreground/80 leading-[1.8]">
              يرصد هذا التقرير مستوى امتثال الجهات الحكومية لمعايير البيانات الوطنية خلال الربع الرابع من عام ٢٠٢٥. شمل التقييم ١٧ جهة حكومية رئيسية، وأظهرت النتائج تحسناً ملحوظاً بنسبة ٨٪ مقارنة بالربع السابق.
            </p>
          </div>

          {/* Key Results */}
          <div className="mb-5 sm:mb-6">
            <h2 className="text-[14px] sm:text-[16px] font-bold text-foreground mb-2 flex items-center gap-2">
              <MaterialIcon icon="assessment" size={17} className="text-primary" />
              النتائج الرئيسية
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {[
                { label: 'الجهات المقيّمة', value: '١٧', color: 'text-foreground' },
                { label: 'متوسط الامتثال', value: '٨٥٪', color: 'text-success' },
                { label: 'الجهات المكتملة', value: '٧', color: 'text-info' },
                { label: 'تحسن عن الربع السابق', value: '+٨٪', color: 'text-primary' },
              ].map((kpi, i) => (
                <div key={kpi.label} className="p-3 bg-accent/30 rounded-xl text-center animate-stagger-in" style={{ animationDelay: `${i * 0.08}s` }}>
                  <p className={`text-[18px] sm:text-[20px] font-bold ${kpi.color}`}>{kpi.value}</p>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">{kpi.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div className="mb-5 sm:mb-6">
            <h2 className="text-[14px] sm:text-[16px] font-bold text-foreground mb-2 flex items-center gap-2">
              <MaterialIcon icon="lightbulb" size={17} className="text-warning" />
              التوصيات
            </h2>
            <div className="flex flex-col gap-2">
              {[
                'تكثيف برامج التدريب للجهات ذات المستوى المبتدئ',
                'تفعيل آلية المتابعة الدورية لمؤشرات الامتثال',
                'إطلاق مبادرة لتحسين جودة البيانات المفتوحة',
              ].map((rec, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-warning/5 animate-stagger-in" style={{ animationDelay: `${(i + 3) * 0.06}s` }}>
                  <span className="text-[9px] sm:text-[10px] font-bold text-warning bg-warning/10 w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-[11px] sm:text-[12px] text-foreground/80 leading-relaxed">{rec}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <RasidMiniBar placeholder="اطلب من راصد تعديل التقرير..." />
    </div>
  );
}

/* ===== مطابقة — Matching Workspace ===== */
function MatchingWorkspace() {
  const [selectedOp, setSelectedOp] = useState<string | null>(null);

  const operations = [
    { icon: 'slideshow', label: 'مطابقة إلى عرض', desc: 'تحويل الملف إلى عرض تقديمي' },
    { icon: 'article', label: 'مطابقة إلى مستند', desc: 'تحويل إلى مستند نصي' },
    { icon: 'table_chart', label: 'مطابقة إلى جدول', desc: 'استخراج البيانات في جدول' },
    { icon: 'dashboard', label: 'مطابقة إلى لوحة', desc: 'إنشاء لوحة مؤشرات' },
    { icon: 'g_translate', label: 'تعريب احترافي', desc: 'ترجمة وتعريب المحتوى' },
    { icon: 'mic', label: 'تفريغ صوت/فيديو', desc: 'تحويل الصوت إلى نص' },
  ];

  return (
    <div className="flex-1 h-full bg-card rounded-2xl flex flex-col overflow-hidden shadow-sm">
      <div className="h-10 flex items-center gap-1 px-2 sm:px-3 border-b border-border shrink-0 overflow-x-auto no-scrollbar">
        <ToolbarBtn icon="compare" label="مطابقة بصرية" active />
        <ToolbarBtn icon="g_translate" label="تعريب" />
        <ToolbarBtn icon="text_snippet" label="تفريغ" />
        <ToolbarBtn icon="swap_horiz" label="تحويل صيغ" />
        <div className="flex-1" />
      </div>

      <div className="flex-1 flex flex-col sm:flex-row gap-2 p-2 sm:p-3">
        {/* Source Drop Zone */}
        <div className="flex-1 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center hover:border-primary/30 hover:bg-primary/3 transition-all cursor-pointer group p-4">
          <MaterialIcon icon="upload_file" size={36} className="text-muted-foreground/20 mb-2 group-hover:text-primary/30 transition-colors" />
          <p className="text-[12px] sm:text-[13px] font-medium text-foreground mb-0.5">أسقط الملف المصدر هنا</p>
          <p className="text-[10px] sm:text-[11px] text-muted-foreground">PDF, Word, صورة, فيديو, صوت</p>
          <button className="mt-2 sm:mt-3 px-3 py-1.5 bg-primary/8 text-primary rounded-lg text-[11px] sm:text-[12px] font-medium hover:bg-primary/12 transition-all">
            اختر ملف
          </button>
        </div>

        {/* Operations Column */}
        <div className="sm:w-[170px] flex sm:flex-col gap-1 overflow-x-auto sm:overflow-x-visible">
          <p className="text-[9px] sm:text-[10px] font-bold text-muted-foreground mb-1 px-0.5 hidden sm:block">نوع العملية</p>
          {operations.map((opt, i) => (
            <button
              key={opt.label}
              onClick={() => setSelectedOp(opt.label)}
              className={`flex items-center gap-1.5 px-2 py-1.5 sm:py-2 rounded-xl border text-[10px] sm:text-[11px] font-medium transition-all animate-stagger-in whitespace-nowrap shrink-0 ${
                selectedOp === opt.label
                  ? 'border-primary/30 bg-primary/5 text-primary'
                  : 'border-border hover:border-primary/20 hover:bg-accent text-foreground'
              }`}
              style={{ animationDelay: `${i * 0.04}s` }}
            >
              <MaterialIcon icon={opt.icon} size={14} className={selectedOp === opt.label ? 'text-primary' : 'text-muted-foreground'} />
              <span className="truncate">{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Output Preview */}
        <div className="flex-1 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center p-4">
          <MaterialIcon icon="preview" size={36} className="text-muted-foreground/20 mb-2" />
          <p className="text-[12px] sm:text-[13px] font-medium text-foreground mb-0.5">معاينة المخرج</p>
          <p className="text-[10px] sm:text-[11px] text-muted-foreground">سيظهر الناتج هنا بعد التنفيذ</p>
        </div>
      </div>

      <RasidMiniBar placeholder="اطلب من راصد المطابقة أو التحويل..." />
    </div>
  );
}

/* ===== مكتبتي — Library ===== */
function LibraryWorkspace() {
  const sections = [
    {
      title: 'لوحات المؤشرات',
      icon: 'dashboard',
      items: [
        { title: 'لوحة مؤشرات نضج البيانات الوطنية', date: '٥ مارس ٢٠٢٦', type: 'dashboard' },
        { title: 'لوحة امتثال الجهات', date: '١٢ فبراير ٢٠٢٦', type: 'dashboard' },
        { title: 'لوحة جودة البيانات المفتوحة', date: '٢٨ يناير ٢٠٢٦', type: 'dashboard' },
      ],
    },
    {
      title: 'التقارير',
      icon: 'article',
      items: [
        { title: 'تقرير الرصد الربعي للجهات', date: '١٠ مارس ٢٠٢٦', type: 'report' },
        { title: 'مذكرة تقييم النضج السنوية', date: '٣ يناير ٢٠٢٦', type: 'report' },
      ],
    },
    {
      title: 'العروض التقديمية',
      icon: 'slideshow',
      items: [
        { title: 'عرض نتائج التقييم الوطني', date: '٨ مارس ٢٠٢٦', type: 'presentation' },
        { title: 'عرض خارطة الطريق', date: '٢٠ فبراير ٢٠٢٦', type: 'presentation' },
      ],
    },
    {
      title: 'البيانات',
      icon: 'table_chart',
      items: [
        { title: 'بيانات الجهات الموحدة', date: '٥ مارس ٢٠٢٦', type: 'data' },
        { title: 'سجل الامتثال المحدّث', date: '١ مارس ٢٠٢٦', type: 'data' },
      ],
    },
  ];

  const [expanded, setExpanded] = useState<string[]>(['لوحات المؤشرات', 'التقارير', 'العروض التقديمية']);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'dashboard': return 'dashboard';
      case 'report': return 'article';
      case 'presentation': return 'slideshow';
      default: return 'table_chart';
    }
  };

  return (
    <div className="flex-1 h-full bg-card rounded-2xl flex flex-col overflow-hidden shadow-sm">
      <div className="h-10 flex items-center gap-1.5 px-2 sm:px-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 flex-1">
          <MaterialIcon icon="search" size={15} className="text-muted-foreground" />
          <input
            type="text"
            placeholder="ابحث في المكتبة..."
            className="flex-1 bg-transparent text-[11px] sm:text-[12px] outline-none text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <ToolbarBtn icon="filter_list" label="تصفية" />
        <ToolbarBtn icon="sort" label="ترتيب" />
      </div>

      <div className="flex-1 overflow-y-auto p-2 sm:p-3">
        {sections.map((section, si) => (
          <div key={section.title} className="mb-1.5 sm:mb-2 animate-stagger-in" style={{ animationDelay: `${si * 0.06}s` }}>
            <button
              onClick={() => setExpanded(prev => prev.includes(section.title) ? prev.filter(s => s !== section.title) : [...prev, section.title])}
              className="flex items-center gap-1.5 w-full py-1.5 text-[11px] sm:text-[12px] font-bold text-foreground hover:text-primary transition-colors"
            >
              <MaterialIcon
                icon={expanded.includes(section.title) ? 'expand_more' : 'chevron_left'}
                size={16}
                className="text-muted-foreground"
              />
              <MaterialIcon icon={section.icon} size={15} className="text-primary/60" />
              {section.title}
              <span className="text-[9px] sm:text-[10px] text-muted-foreground font-normal mr-0.5">({section.items.length})</span>
            </button>
            {expanded.includes(section.title) && (
              <div className="flex flex-col gap-px pr-5 sm:pr-7 mt-0.5">
                {section.items.map((item, i) => (
                  <div
                    key={item.title}
                    className="flex items-center gap-2 p-1.5 sm:p-2 rounded-lg hover:bg-accent/40 transition-all cursor-pointer group animate-fade-in"
                    style={{ animationDelay: `${i * 0.04}s` }}
                  >
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-accent/60 flex items-center justify-center shrink-0">
                      <MaterialIcon icon={getTypeIcon(item.type)} size={14} className="text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] sm:text-[12px] font-medium text-foreground truncate">{item.title}</p>
                      <p className="text-[8px] sm:text-[9px] text-muted-foreground mt-0.5">{item.date}</p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                      <button className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-lg hover:bg-accent">
                        <MaterialIcon icon="open_in_new" size={13} className="text-muted-foreground" />
                      </button>
                      <button className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-lg hover:bg-accent">
                        <MaterialIcon icon="more_vert" size={13} className="text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== Shared Components ===== */
function ToolbarBtn({ icon, label, active }: { icon: string; label: string; active?: boolean }) {
  return (
    <button className={`flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg text-[10px] sm:text-[11px] font-medium transition-all active:scale-95 whitespace-nowrap ${
      active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
    }`}>
      <MaterialIcon icon={icon} size={14} />
      {label && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}

function ActionButtons({ actions }: { actions: ReadonlyArray<{ id: string; label: string; icon: string }> }) {
  return (
    <div className="flex items-center gap-0.5">
      {actions.slice(0, 3).map(action => (
        <button
          key={action.id}
          className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg text-[9px] sm:text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-all active:scale-95"
          title={action.label}
        >
          <MaterialIcon icon={action.icon} size={13} />
          <span className="hidden lg:inline">{action.label}</span>
        </button>
      ))}
    </div>
  );
}

function RasidMiniBar({ placeholder }: { placeholder: string }) {
  const { theme } = useTheme();
  const char = theme === 'dark' ? CHARACTERS.char3_dark : CHARACTERS.char1_waving;

  return (
    <div className="px-2 pb-1.5 pt-1 border-t border-border shrink-0">
      <div className="flex items-center gap-1.5 bg-accent/30 rounded-xl px-2 py-1.5">
        <img src={char} alt="راصد" className="w-5 h-5 rounded-full object-contain" />
        <input
          type="text"
          placeholder={placeholder}
          className="flex-1 bg-transparent text-[10px] sm:text-[11px] outline-none text-foreground placeholder:text-muted-foreground"
        />
        <button className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-accent transition-all">
          <MaterialIcon icon="send" size={13} className="text-primary" />
        </button>
      </div>
    </div>
  );
}
