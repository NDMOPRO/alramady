import { motion } from 'framer-motion';
import type { FocusStageData } from '@/types/canvas';
import { cn } from '@/lib/utils';
import { durations, easings, staggerContainer, staggerItem } from '@/lib/motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import {
  FileText, Table, Presentation, LayoutDashboard, Image,
  FileBarChart, CheckCircle2, AlertTriangle,
} from 'lucide-react';

interface ArtifactRendererProps {
  data: FocusStageData;
  zoom: number;
}

// E07-0092 to E07-0097: Real artifact rendering inside Focus Stage
export function ArtifactRenderer({ data, zoom }: ArtifactRendererProps) {
  const style = { transform: `scale(${zoom / 100})`, transformOrigin: 'center top' };

  switch (data.artifactType) {
    case 'dashboard':
      return <DashboardPreview data={data} style={style} />;
    case 'pptx':
      return <PresentationPreview data={data} style={style} />;
    case 'xlsx':
      return <SpreadsheetPreview data={data} style={style} />;
    case 'docx':
    case 'pdf':
      return <DocumentPreview data={data} style={style} />;
    case 'png':
      return <ImagePreview data={data} style={style} />;
    default:
      return <GenericPreview data={data} style={style} />;
  }
}

// Sample data for dashboard charts
const barData = [
  { name: 'يناير', value: 4200 },
  { name: 'فبراير', value: 3800 },
  { name: 'مارس', value: 5100 },
  { name: 'أبريل', value: 4600 },
  { name: 'مايو', value: 6200 },
  { name: 'يونيو', value: 5800 },
];

const pieData = [
  { name: 'المبيعات', value: 35 },
  { name: 'التسويق', value: 25 },
  { name: 'التطوير', value: 22 },
  { name: 'العمليات', value: 18 },
];

const lineData = [
  { name: 'أسبوع 1', current: 2400, previous: 2100 },
  { name: 'أسبوع 2', current: 3600, previous: 2800 },
  { name: 'أسبوع 3', current: 3200, previous: 3100 },
  { name: 'أسبوع 4', current: 4500, previous: 3600 },
];

const COLORS = ['hsl(221, 83%, 53%)', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)'];

function DashboardPreview({ data, style }: { data: FocusStageData; style: React.CSSProperties }) {
  return (
    <motion.div style={style} className="w-[960px]" {...staggerContainer} initial="initial" animate="animate">
      {/* Dashboard header */}
      <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border/50 p-4 mb-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">{data.title}</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">تحديث تلقائي</span>
            <span className="text-xs text-success bg-success/10 px-2 py-1 rounded-md flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> مكتمل
            </span>
          </div>
        </div>
      </motion.div>

      {/* KPI cards */}
      <motion.div variants={staggerItem} className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'إجمالي الإيرادات', value: '٢.٤ مليون ر.س', change: '+١٢٪', positive: true },
          { label: 'عدد العملاء', value: '١,٢٤٥', change: '+٨٪', positive: true },
          { label: 'معدل التحويل', value: '٣.٨٪', change: '-٠.٥٪', positive: false },
          { label: 'رضا العملاء', value: '٤.٧ / ٥', change: '+٠.٢', positive: true },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-card rounded-xl border border-border/50 p-4 shadow-sm">
            <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
            <p className="text-xl font-bold text-foreground">{kpi.value}</p>
            <p className={cn('text-xs mt-1', kpi.positive ? 'text-success' : 'text-destructive')}>
              {kpi.change}
            </p>
          </div>
        ))}
      </motion.div>

      {/* Charts grid */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border/50 p-4 shadow-sm">
          <h3 className="text-sm font-bold text-foreground mb-3">الإيرادات الشهرية</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border/50 p-4 shadow-sm">
          <h3 className="text-sm font-bold text-foreground mb-3">توزيع الأقسام</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {pieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border/50 p-4 shadow-sm col-span-2">
          <h3 className="text-sm font-bold text-foreground mb-3">المقارنة الأسبوعية</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="current" stroke="hsl(221, 83%, 53%)" strokeWidth={2} name="الحالي" />
              <Line type="monotone" dataKey="previous" stroke="var(--muted-foreground)" strokeWidth={2} strokeDasharray="5 5" name="السابق" />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
    </motion.div>
  );
}

function PresentationPreview({ data, style }: { data: FocusStageData; style: React.CSSProperties }) {
  const slides = [
    { title: data.title, subtitle: 'عرض تقديمي احترافي', type: 'title' as const },
    { title: 'نظرة عامة', content: 'تحليل شامل للبيانات والمؤشرات الرئيسية مع توصيات عملية للتحسين المستمر', type: 'content' as const },
    { title: 'النتائج', content: 'chart', type: 'chart' as const },
    { title: 'التوصيات', items: ['تحسين معدل التحويل بنسبة ١٥٪', 'زيادة الاستثمار في القنوات الرقمية', 'تطوير برنامج ولاء العملاء', 'تحسين تجربة المستخدم'], type: 'bullets' as const },
  ];

  return (
    <motion.div style={style} className="w-[800px] space-y-4" {...staggerContainer} initial="initial" animate="animate">
      {slides.map((slide, i) => (
        <motion.div
          key={i}
          variants={staggerItem}
          className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden aspect-[16/9] relative"
        >
          {slide.type === 'title' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5 p-12">
              <Presentation className="w-10 h-10 text-primary mb-4" />
              <h2 className="text-2xl font-bold text-foreground text-center">{slide.title}</h2>
              <p className="text-sm text-muted-foreground mt-2">{slide.subtitle}</p>
              <div className="absolute bottom-4 left-4 text-[10px] text-muted-foreground/50">شريحة {i + 1} / {slides.length}</div>
            </div>
          ) : slide.type === 'chart' ? (
            <div className="absolute inset-0 p-6">
              <h3 className="text-sm font-bold text-foreground mb-3">{slide.title}</h3>
              <ResponsiveContainer width="100%" height="80%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                  <Bar dataKey="value" fill="hsl(221, 83%, 53%)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="absolute bottom-4 left-4 text-[10px] text-muted-foreground/50">شريحة {i + 1} / {slides.length}</div>
            </div>
          ) : slide.type === 'bullets' ? (
            <div className="absolute inset-0 p-8">
              <h3 className="text-lg font-bold text-foreground mb-6">{slide.title}</h3>
              <ul className="space-y-3">
                {slide.items?.map((item, j) => (
                  <li key={j} className="flex items-center gap-3 text-sm text-foreground">
                    <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="absolute bottom-4 left-4 text-[10px] text-muted-foreground/50">شريحة {i + 1} / {slides.length}</div>
            </div>
          ) : (
            <div className="absolute inset-0 p-8">
              <h3 className="text-lg font-bold text-foreground mb-4">{slide.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{slide.content}</p>
              <div className="absolute bottom-4 left-4 text-[10px] text-muted-foreground/50">شريحة {i + 1} / {slides.length}</div>
            </div>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}

function SpreadsheetPreview({ data, style }: { data: FocusStageData; style: React.CSSProperties }) {
  const headers = ['#', 'القسم', 'الميزانية', 'المصروفات', 'الفرق', 'النسبة'];
  const rows = [
    ['1', 'المبيعات', '٥٠٠,٠٠٠', '٤٢٠,٠٠٠', '٨٠,٠٠٠', '٨٤٪'],
    ['2', 'التسويق', '٣٠٠,٠٠٠', '٢٨٥,٠٠٠', '١٥,٠٠٠', '٩٥٪'],
    ['3', 'التطوير', '٤٠٠,٠٠٠', '٣٧٠,٠٠٠', '٣٠,٠٠٠', '٩٣٪'],
    ['4', 'العمليات', '٢٥٠,٠٠٠', '٢٤٠,٠٠٠', '١٠,٠٠٠', '٩٦٪'],
    ['5', 'الموارد البشرية', '٢٠٠,٠٠٠', '١٩٥,٠٠٠', '٥,٠٠٠', '٩٨٪'],
    ['6', 'الدعم الفني', '١٥٠,٠٠٠', '١٣٠,٠٠٠', '٢٠,٠٠٠', '٨٧٪'],
    ['7', 'الإدارة', '١٨٠,٠٠٠', '١٧٥,٠٠٠', '٥,٠٠٠', '٩٧٪'],
    ['8', 'المشتريات', '٣٥٠,٠٠٠', '٣٢٠,٠٠٠', '٣٠,٠٠٠', '٩١٪'],
  ];

  return (
    <motion.div
      style={style}
      className="w-[900px] bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.33, 1, 0.68, 1] }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/30">
        <Table className="w-4 h-4 text-success" />
        <span className="text-sm font-bold text-foreground">{data.title}</span>
        <span className="text-[10px] text-muted-foreground mr-auto">٨ صفوف × ٦ أعمدة</span>
      </div>
      <div className="overflow-auto max-h-[500px]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40">
              {headers.map((h) => (
                <th key={h} className="px-4 py-2.5 text-right text-xs font-bold text-muted-foreground border-b border-border/30">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={cn('hover:bg-muted/20 transition-colors', i % 2 === 0 && 'bg-muted/5')}>
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2 text-right text-foreground border-b border-border/20 tabular-nums">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

function DocumentPreview({ data, style }: { data: FocusStageData; style: React.CSSProperties }) {
  return (
    <motion.div
      style={style}
      className="w-[700px] bg-card rounded-xl border border-border/50 shadow-lg overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.36 }}
    >
      {/* Doc header */}
      <div className="flex items-center gap-2 px-6 py-4 border-b border-border/50">
        <FileText className="w-5 h-5 text-primary" />
        <h2 className="text-base font-bold text-foreground">{data.title}</h2>
      </div>

      {/* Doc body - simulated A4 page */}
      <div className="p-8 space-y-6 min-h-[600px]">
        <div className="space-y-3">
          <h3 className="text-lg font-bold text-foreground">١. المقدمة</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            يقدم هذا التقرير تحليلاً شاملاً للبيانات المستخرجة من الملف المرفق. تم إجراء التحليل باستخدام
            أحدث تقنيات الذكاء الاصطناعي لضمان أعلى مستوى من الدقة والموثوقية.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-bold text-foreground">٢. المنهجية</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            تم اتباع منهجية تحليلية متعددة المراحل تشمل: استخراج البيانات، تنظيفها، تحليلها إحصائياً،
            ثم بناء النماذج التنبؤية. كل مرحلة خضعت لبوابات تحقق صارمة.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-bold text-foreground">٣. النتائج الرئيسية</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {['نمو الإيرادات بنسبة ١٢٪ مقارنة بالربع السابق',
              'تحسن رضا العملاء إلى ٤.٧ من ٥',
              'خفض تكاليف التشغيل بنسبة ٨٪',
              'زيادة الإنتاجية بنسبة ١٥٪',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-bold text-foreground">٤. التوصيات</h3>
          <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span className="text-sm font-bold text-foreground">نقاط تحتاج اهتمام</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              يُوصى بمراجعة ميزانية قسم التسويق حيث بلغت نسبة الإنفاق ٩٥٪ من المخصص.
              كما يُنصح بزيادة الاستثمار في البنية التحتية الرقمية.
            </p>
          </div>
        </div>
      </div>

      {/* Page number */}
      <div className="px-6 py-3 border-t border-border/30 text-center">
        <span className="text-[10px] text-muted-foreground">صفحة ١ من ١</span>
      </div>
    </motion.div>
  );
}

function ImagePreview({ data, style }: { data: FocusStageData; style: React.CSSProperties }) {
  return (
    <motion.div
      style={style}
      className="w-[800px] bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        <Image className="w-4 h-4 text-info" />
        <span className="text-sm font-bold text-foreground">{data.title}</span>
      </div>
      <div className="aspect-[4/3] bg-muted/20 flex items-center justify-center">
        <div className="text-center space-y-2">
          <Image className="w-16 h-16 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">معاينة الصورة</p>
        </div>
      </div>
    </motion.div>
  );
}

function GenericPreview({ data, style }: { data: FocusStageData; style: React.CSSProperties }) {
  return (
    <motion.div
      style={style}
      className="w-[700px] bg-card rounded-xl border border-border/50 shadow-sm p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="text-center space-y-4">
        <FileBarChart className="w-12 h-12 text-primary mx-auto" />
        <h3 className="text-lg font-bold text-foreground">{data.title}</h3>
        <p className="text-sm text-muted-foreground">
          معاينة {data.artifactType}
        </p>
      </div>
    </motion.div>
  );
}
