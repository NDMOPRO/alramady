/* RASID Visual DNA — Data Panel (Right Column)
   Dropdown filter instead of tabs, compact layout, context menus, drag-and-drop
   Mobile-friendly: works inside drawer */
import { useState, useRef, useEffect, useCallback } from 'react';
import MaterialIcon from './MaterialIcon';
import { DATA_STATUSES, DATA_ITEM_MENU } from '@/lib/assets';
import type { DataItem } from '@/pages/Home';

interface DataPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onAddSourceClick: () => void;
  items: DataItem[];
}

const FILTER_OPTIONS = [
  { id: 'all', label: 'الكل', icon: 'apps' },
  { id: 'files', label: 'الملفات', icon: 'description' },
  { id: 'tables', label: 'الجداول', icon: 'table_chart' },
  { id: 'groups', label: 'المجموعات', icon: 'folder' },
  { id: 'flows', label: 'التدفقات', icon: 'account_tree' },
];

export default function DataPanel({ isOpen, onToggle, onAddSourceClick, items }: DataPanelProps) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const [expandedSections, setExpandedSections] = useState<string[]>(['files', 'tables', 'groups', 'flows']);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const filteredItems = items.filter(item => {
    if (activeFilter !== 'all') {
      const tabMap: Record<string, string> = { files: 'file', tables: 'table', groups: 'group', flows: 'flow' };
      if (item.type !== tabMap[activeFilter]) return false;
    }
    if (searchQuery) return item.title.includes(searchQuery);
    return true;
  });

  // Group items by type
  const groupedItems = {
    files: filteredItems.filter(i => i.type === 'file'),
    tables: filteredItems.filter(i => i.type === 'table'),
    groups: filteredItems.filter(i => i.type === 'group'),
    flows: filteredItems.filter(i => i.type === 'flow'),
  };

  const sectionLabels: Record<string, { label: string; icon: string }> = {
    files: { label: 'الملفات', icon: 'description' },
    tables: { label: 'الجداول', icon: 'table_chart' },
    groups: { label: 'المجموعات', icon: 'folder' },
    flows: { label: 'التدفقات', icon: 'account_tree' },
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev =>
      prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
    );
  };

  // Close context menu / filter on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      setContextMenu(null);
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, itemId: string) => {
    e.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) {
      setContextMenu({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        itemId,
      });
    }
  }, []);

  const handleDragStart = (id: string) => setDraggingId(id);
  const handleDragEnd = () => setDraggingId(null);

  const currentFilter = FILTER_OPTIONS.find(f => f.id === activeFilter) || FILTER_OPTIONS[0];
  const showSections = activeFilter === 'all';

  return (
    <div
      ref={panelRef}
      className={`h-full bg-card rounded-2xl flex flex-col overflow-hidden shadow-sm relative ${dragOver ? 'drop-zone-active' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={() => setDragOver(false)}
    >
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-3 shrink-0 border-b border-border">
        <span className="text-[13px] font-bold text-foreground">البيانات</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onAddSourceClick}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-accent transition-all active:scale-95"
            title="إضافة مصدر"
          >
            <MaterialIcon icon="add" size={18} className="text-muted-foreground" />
          </button>
          <button
            onClick={onToggle}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-accent transition-all active:scale-95"
            title="إغلاق اللوحة"
          >
            <MaterialIcon icon="close" size={16} className="text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Search + Filter Row */}
      <div className="px-2.5 pt-2 pb-1.5 flex items-center gap-1.5">
        {/* Search */}
        <div className={`flex-1 flex items-center gap-1.5 h-[32px] bg-accent/40 rounded-lg px-2 border transition-all duration-200 ${
          searchFocused ? 'border-primary/30 shadow-sm' : 'border-transparent'
        }`}>
          <MaterialIcon icon="search" size={15} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="ابحث..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="flex-1 bg-transparent text-[11px] outline-none text-foreground placeholder:text-muted-foreground min-w-0"
          />
        </div>

        {/* Dropdown Filter */}
        <div className="relative" ref={filterRef}>
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className={`h-[32px] flex items-center gap-1 px-2 rounded-lg border text-[11px] font-medium transition-all ${
              filterOpen ? 'border-primary/30 bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            <MaterialIcon icon={currentFilter.icon} size={14} />
            <span className="hidden sm:inline">{currentFilter.label}</span>
            <MaterialIcon icon="expand_more" size={14} />
          </button>
          {filterOpen && (
            <div className="absolute top-full mt-1 left-0 w-36 bg-popover rounded-xl shadow-xl border border-border py-1 z-50 animate-menu-pop">
              {FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => { setActiveFilter(opt.id); setFilterOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-all ${
                    activeFilter === opt.id ? 'text-primary bg-primary/5 font-medium' : 'text-foreground hover:bg-accent'
                  }`}
                >
                  <MaterialIcon icon={opt.icon} size={14} />
                  {opt.label}
                  {activeFilter === opt.id && <MaterialIcon icon="check" size={14} className="mr-auto text-primary" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Source */}
      <div className="px-2.5 pb-1.5">
        <button
          onClick={onAddSourceClick}
          className="w-full h-[38px] rounded-xl border-2 border-dashed border-border hover:border-primary/30 hover:bg-primary/5 transition-all duration-200 flex items-center justify-center gap-1.5 text-muted-foreground hover:text-primary active:scale-[0.98]"
        >
          <MaterialIcon icon="add_circle" size={16} />
          <span className="text-[11px] font-medium">إضافة مصدر بيانات</span>
        </button>
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto px-2.5 pb-2.5">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center animate-fade-in">
            <MaterialIcon icon="database" size={32} className="text-muted-foreground/25 mb-2" />
            <p className="text-[11px] text-muted-foreground">ستظهر مصادر البيانات هنا</p>
            <p className="text-[9px] text-muted-foreground/60 mt-0.5">اسحب ملفات أو اضغط إضافة مصدر</p>
          </div>
        ) : showSections ? (
          Object.entries(groupedItems).map(([key, sectionItems]) => {
            if (sectionItems.length === 0) return null;
            const sec = sectionLabels[key];
            const isExpanded = expandedSections.includes(key);
            return (
              <div key={key} className="mb-1">
                <button
                  onClick={() => toggleSection(key)}
                  className="flex items-center gap-1 w-full py-1 px-0.5 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                >
                  <MaterialIcon icon={isExpanded ? 'expand_more' : 'chevron_left'} size={14} />
                  <MaterialIcon icon={sec.icon} size={13} className="text-primary/60" />
                  <span>{sec.label}</span>
                  <span className="text-[9px] font-normal text-muted-foreground/60 mr-0.5">({sectionItems.length})</span>
                </button>
                {isExpanded && (
                  <div className="flex flex-col gap-px mt-0.5">
                    {sectionItems.map((item, i) => (
                      <DataItemRow
                        key={item.id}
                        item={item}
                        index={i}
                        isDragging={draggingId === item.id}
                        onContextMenu={handleContextMenu}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col gap-px">
            {filteredItems.map((item, i) => (
              <DataItemRow
                key={item.id}
                item={item}
                index={i}
                isDragging={draggingId === item.id}
                onContextMenu={handleContextMenu}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu absolute z-50 py-1 min-w-[170px]"
          style={{ top: contextMenu.y, right: contextMenu.x > 140 ? undefined : 8, left: contextMenu.x > 140 ? 8 : undefined }}
        >
          {DATA_ITEM_MENU.map(opt => (
            <button
              key={opt.id}
              onClick={() => setContextMenu(null)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-all ${
                opt.danger
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-foreground hover:bg-accent'
              }`}
            >
              <MaterialIcon icon={opt.icon} size={15} />
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 bg-primary/5 rounded-2xl flex items-center justify-center z-10 pointer-events-none animate-fade-in">
          <div className="flex flex-col items-center gap-2 animate-bounce-in">
            <MaterialIcon icon="cloud_upload" size={36} className="text-primary" />
            <span className="text-[12px] font-medium text-primary">أفلت الملفات هنا</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== Data Item Row ===== */
function DataItemRow({
  item,
  index,
  isDragging,
  onContextMenu,
  onDragStart,
  onDragEnd,
}: {
  item: DataItem;
  index: number;
  isDragging: boolean;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const status = DATA_STATUSES[item.status];
  return (
    <div
      className={`flex items-center gap-2 p-1.5 rounded-lg hover:bg-accent/40 transition-all duration-200 cursor-pointer group animate-stagger-in ${isDragging ? 'dragging-item' : ''}`}
      style={{ animationDelay: `${index * 0.03}s` }}
      draggable
      onDragStart={() => onDragStart(item.id)}
      onDragEnd={onDragEnd}
      onContextMenu={e => onContextMenu(e, item.id)}
    >
      <div className="w-7 h-7 rounded-lg bg-accent/60 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
        <MaterialIcon icon={item.icon} size={15} className="text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-foreground truncate leading-tight">{item.title}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <span
            className="text-[8px] font-medium px-1.5 py-[1px] rounded"
            style={{ color: status.color, backgroundColor: status.bg }}
          >
            {status.label}
          </span>
          {item.size && <span className="text-[8px] text-muted-foreground">{item.size}</span>}
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onContextMenu(e, item.id); }}
        className="w-5 h-5 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-accent transition-all duration-200"
      >
        <MaterialIcon icon="more_vert" size={13} className="text-muted-foreground" />
      </button>
    </div>
  );
}
