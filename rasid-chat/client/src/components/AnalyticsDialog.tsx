/* RASID Visual DNA — Analytics Dialog
   Professional stats overview with activity timeline and usage metrics */
import { useEffect } from 'react';
import MaterialIcon from './MaterialIcon';

interface AnalyticsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AnalyticsDialog({ isOpen, onClose }: AnalyticsDialogProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const stats = [
    { label: 'المصادر', value: '٥', icon: 'database', color: 'oklch(0.55 0.18 250)' },
    { label: 'المخرجات', value: '١٢', icon: 'auto_awesome', color: 'oklch(0.62 0.17 155)' },
    { label: 'المحادثات', value: '٣٤', icon: 'chat', color: 'oklch(0.65 0.15 75)' },
    { label: 'التحليلات', value: '٨', icon: 'analytics', color: 'oklch(0.55 0.15 300)' },
  ];

  const usageMetrics = [
    { label: 'سعة التخزين', used: 2.4, total: 10, unit: 'GB', icon: 'cloud' },
    { label: 'طلبات التحليل', used: 34, total: 100, unit: 'طلب', icon: 'query_stats' },
    { label: 'المخرجات المُنشأة', used: 12, total: 50, unit: 'مخرج', icon: 'output' },
  ];

  const activities = [
    { text: 'تم إنشاء لوحة مؤشرات نضج البيانات', time: 'منذ ساعتين', icon: 'dashboard', type: 'create' },
    { text: 'تم رفع بيانات الجهات الحكومية Q4', time: 'منذ ٣ ساعات', icon: 'upload_file', type: 'upload' },
    { text: 'تم تحليل مؤشرات النضج الوطنية', time: 'أمس', icon: 'analytics', type: 'analyze' },
    { text: 'تم إنشاء تقرير الامتثال الربعي', time: 'أمس', icon: 'description', type: 'create' },
    { text: 'تم مشاركة العرض التقديمي مع الفريق', time: 'منذ يومين', icon: 'share', type: 'share' },
  ];

  const typeColors: Record<string, string> = {
    create: 'text-primary',
    upload: 'text-info',
    analyze: 'text-warning',
    share: 'text-success',
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-dialog-backdrop" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-popover w-full max-w-[580px] mx-4 rounded-2xl overflow-hidden shadow-2xl animate-dialog-content max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <MaterialIcon icon="trending_up" size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-foreground">تحليلات مساحة العمل</h3>
              <p className="text-[10px] text-muted-foreground">إحصائيات الاستخدام والنشاط</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent transition-all active:scale-95">
            <MaterialIcon icon="close" size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className="flex flex-col items-center p-3 sm:p-4 rounded-xl bg-accent/40 animate-stagger-in hover:bg-accent/60 transition-all cursor-default"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <MaterialIcon icon={stat.icon} size={20} style={{ color: stat.color } as any} />
                <span className="text-[22px] sm:text-[26px] font-bold text-foreground mt-1">{stat.value}</span>
                <span className="text-[10px] sm:text-[11px] text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* Usage Metrics */}
          <div className="mb-6">
            <h3 className="text-[13px] font-bold text-foreground mb-3 flex items-center gap-1.5">
              <MaterialIcon icon="data_usage" size={16} className="text-primary" />
              استهلاك الموارد
            </h3>
            <div className="flex flex-col gap-3">
              {usageMetrics.map((metric, i) => {
                const pct = (metric.used / metric.total) * 100;
                return (
                  <div key={metric.label} className="animate-stagger-in" style={{ animationDelay: `${(i + 4) * 0.06}s` }}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <MaterialIcon icon={metric.icon} size={14} className="text-muted-foreground" />
                        <span className="text-[11px] font-medium text-foreground">{metric.label}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {metric.used} / {metric.total} {metric.unit}
                      </span>
                    </div>
                    <div className="h-2 bg-accent rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: pct > 80 ? 'oklch(0.65 0.2 25)' : pct > 50 ? 'oklch(0.7 0.15 80)' : 'oklch(0.55 0.18 250)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <h3 className="text-[13px] font-bold text-foreground mb-3 flex items-center gap-1.5">
              <MaterialIcon icon="history" size={16} className="text-primary" />
              النشاط الأخير
            </h3>
            <div className="flex flex-col gap-1">
              {activities.map((activity, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-accent/40 transition-all duration-200 animate-stagger-in cursor-pointer"
                  style={{ animationDelay: `${(i + 7) * 0.06}s` }}
                >
                  <div className="w-8 h-8 rounded-lg bg-accent/60 flex items-center justify-center shrink-0">
                    <MaterialIcon icon={activity.icon} size={16} className={typeColors[activity.type] || 'text-muted-foreground'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-foreground truncate">{activity.text}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
