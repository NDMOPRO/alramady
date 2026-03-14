/* RASID Visual DNA — Studio Panel (Left Column)
   Compact layout, single-column tools, outputs list
   Width: 220px on desktop, full in mobile drawer */
import { useState } from 'react';
import MaterialIcon from './MaterialIcon';
import { STUDIO_TOOLS } from '@/lib/assets';
import type { StudioOutput } from '@/pages/Home';

interface StudioPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onToolClick: (tool: { icon: string; label: string; id: string }) => void;
  outputs: StudioOutput[];
}

export default function StudioPanel({ isOpen, onToggle, onToolClick, outputs }: StudioPanelProps) {
  const [outputMenuId, setOutputMenuId] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <div className="h-full bg-card rounded-2xl flex flex-col overflow-hidden shadow-sm">
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-3 shrink-0 border-b border-border">
        <span className="text-[13px] font-bold text-foreground">الاستوديو</span>
        <button
          onClick={onToggle}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-accent transition-all active:scale-95"
          title="إغلاق الاستوديو"
        >
          <MaterialIcon icon="close" size={16} className="text-muted-foreground" />
        </button>
      </div>

      {/* Tools — Compact single column */}
      <div className="px-2 pt-2 pb-1.5">
        <p className="text-[9px] text-muted-foreground font-bold mb-1 px-1 uppercase tracking-wider">أدوات الإنشاء</p>
        <div className="flex flex-col gap-px">
          {STUDIO_TOOLS.map((tool, i) => (
            <button
              key={tool.id}
              onClick={() => onToolClick({ icon: tool.icon, label: tool.label, id: tool.id })}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent transition-all duration-200 active:scale-[0.97] group animate-stagger-in"
              style={{ animationDelay: `${i * 0.03}s` }}
            >
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-all duration-200 group-hover:scale-110"
                style={{ backgroundColor: `${tool.color}12` }}
              >
                <MaterialIcon icon={tool.icon} size={14} style={{ color: tool.color } as any} />
              </div>
              <span className="text-[11px] font-medium text-foreground truncate">{tool.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Quick Create */}
      <div className="px-2 pb-1.5">
        <button className="w-full h-8 rounded-lg bg-primary/8 text-primary text-[11px] font-medium hover:bg-primary/12 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-1">
          <MaterialIcon icon="add" size={14} />
          إنشاء مخرج
        </button>
      </div>

      {/* Divider */}
      <div className="h-px bg-border mx-2" />

      {/* Outputs */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <p className="text-[9px] text-muted-foreground font-bold mb-1 px-1 uppercase tracking-wider">المخرجات</p>
        {outputs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center animate-fade-in">
            <MaterialIcon icon="auto_awesome" size={28} className="text-muted-foreground/20 mb-1.5" />
            <p className="text-[11px] text-muted-foreground">ستُحفظ المخرجات هنا</p>
          </div>
        ) : (
          <div className="flex flex-col gap-px">
            {outputs.map((output, i) => (
              <div
                key={output.id}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-accent/40 transition-all duration-200 cursor-pointer group animate-stagger-in"
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div className="w-7 h-7 rounded-md bg-accent/60 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
                  <MaterialIcon icon={output.icon} size={15} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-foreground truncate">{output.title}</p>
                  <p className="text-[8px] text-muted-foreground mt-0.5">{output.time}</p>
                </div>
                <div className="relative">
                  <button
                    onClick={e => { e.stopPropagation(); setOutputMenuId(outputMenuId === output.id ? null : output.id); }}
                    className="w-5 h-5 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-accent transition-all duration-200"
                  >
                    <MaterialIcon icon="more_vert" size={13} className="text-muted-foreground" />
                  </button>
                  {outputMenuId === output.id && (
                    <div className="absolute left-0 top-full mt-1 w-36 bg-popover rounded-xl shadow-xl border border-border py-1 z-50 animate-menu-pop">
                      {[
                        { icon: 'open_in_new', label: 'فتح' },
                        { icon: 'edit', label: 'تعديل' },
                        { icon: 'download', label: 'تصدير' },
                        { icon: 'share', label: 'مشاركة' },
                        { icon: 'delete', label: 'حذف' },
                      ].map(opt => (
                        <button
                          key={opt.label}
                          onClick={() => setOutputMenuId(null)}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-all ${
                            opt.label === 'حذف' ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-accent'
                          }`}
                        >
                          <MaterialIcon icon={opt.icon} size={13} />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Templates */}
      <div className="border-t border-border px-2 py-2">
        <p className="text-[9px] text-muted-foreground font-bold mb-1 px-1 uppercase tracking-wider">النماذج</p>
        <div className="flex flex-col gap-px">
          {[
            { icon: 'description', label: 'قالب تقرير الامتثال' },
            { icon: 'slideshow', label: 'قالب عرض تقديمي' },
          ].map(model => (
            <button
              key={model.label}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-accent transition-all text-[10px] group"
            >
              <MaterialIcon icon={model.icon} size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-foreground font-medium truncate">{model.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
