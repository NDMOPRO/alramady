'use client';

import React, { useCallback } from 'react';
import {
  DragOverlay,
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  RasidDnDProvider,
  SortableItem,
  useSortableList,
  type SortableListItem,
} from './index';

// ─── Types ───────────────────────────────────────────────────────────

export interface SortableWidgetListProps<T extends SortableListItem> {
  items: T[];
  onReorder: (reorderedItems: T[]) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  direction?: 'vertical' | 'horizontal';
  className?: string;
  itemClassName?: string;
  handle?: boolean;
  disabled?: boolean;
  renderOverlay?: (item: T) => React.ReactNode;
}

// ─── Component ───────────────────────────────────────────────────────

export function SortableWidgetList<T extends SortableListItem>({
  items: externalItems,
  onReorder,
  renderItem,
  direction = 'vertical',
  className = '',
  itemClassName = '',
  handle = false,
  disabled = false,
  renderOverlay,
}: SortableWidgetListProps<T>) {
  const {
    items,
    setItems,
    activeId,
    activeItem,
    itemIds,
    handleDragStart,
    handleDragEnd: internalDragEnd,
    handleDragCancel,
  } = useSortableList<T>(externalItems);

  const strategy = direction === 'vertical'
    ? verticalListSortingStrategy
    : horizontalListSortingStrategy;

  const containerStyle: React.CSSProperties = {
    display: direction === 'horizontal' ? 'flex' : 'block',
    gap: direction === 'horizontal' ? '12px' : '0',
    flexWrap: direction === 'horizontal' ? 'wrap' : undefined,
  };

  const itemStyle: React.CSSProperties = {
    marginBottom: direction === 'vertical' ? '8px' : '0',
  };

  const handleDragEnd = useCallback(
    (event: Parameters<typeof internalDragEnd>[0]) => {
      internalDragEnd(event);

      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = [...items];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      onReorder(reordered);
    },
    [items, internalDragEnd, onReorder],
  );

  return (
    <RasidDnDProvider
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={itemIds} strategy={strategy}>
        <div
          className={`rasid-sortable-widget-list ${className}`}
          style={containerStyle}
          role="list"
          aria-label="Sortable widget list"
        >
          {items.map((item, index) => (
            <div key={item.id} style={itemStyle} role="listitem">
              <SortableItem
                id={item.id}
                handle={handle}
                disabled={disabled}
                className={itemClassName}
              >
                {renderItem(item, index)}
              </SortableItem>
            </div>
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeItem && renderOverlay ? (
          <div style={{ opacity: 0.85, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: '8px' }}>
            {renderOverlay(activeItem)}
          </div>
        ) : activeItem ? (
          <div style={{ opacity: 0.85, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: '8px', padding: '12px', background: '#fff' }}>
            {renderItem(activeItem, items.indexOf(activeItem))}
          </div>
        ) : null}
      </DragOverlay>
    </RasidDnDProvider>
  );
}

export default SortableWidgetList;
