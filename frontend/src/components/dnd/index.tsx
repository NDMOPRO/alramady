'use client';

import React, { useState, useCallback, createContext, useContext, useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  closestCorners,
  CollisionDetection,
  Modifier,
  useDroppable,
  UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
  useSortable,
  SortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';

// ─── Types ───────────────────────────────────────────────────────────

export interface RasidDnDProviderProps {
  children: React.ReactNode;
  onDragStart?: (event: DragStartEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  collisionDetection?: CollisionDetection;
  modifiers?: Modifier[];
}

export interface SortableItemProps {
  id: string;
  children: React.ReactNode;
  handle?: boolean;
  disabled?: boolean;
  className?: string;
}

export interface DropZoneProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
}

export interface SortableListItem {
  id: string;
  [key: string]: unknown;
}

// ─── DnD Provider ────────────────────────────────────────────────────

export function RasidDnDProvider({
  children,
  onDragStart,
  onDragOver,
  onDragEnd,
  collisionDetection = closestCenter,
  modifiers,
}: RasidDnDProviderProps) {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });

  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });

  const sensors = useSensors(pointerSensor, keyboardSensor);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      modifiers={modifiers}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      {children}
    </DndContext>
  );
}

// ─── Sortable Item ───────────────────────────────────────────────────

export function SortableItem({
  id,
  children,
  handle = false,
  disabled = false,
  className = '',
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: disabled ? 'default' : handle ? 'default' : 'grab',
    position: 'relative',
    touchAction: 'none',
  };

  const dragHandleListeners = handle ? {} : listeners;
  const dragHandleAttributes = handle ? {} : attributes;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rasid-sortable-item ${isDragging ? 'rasid-sortable-item--dragging' : ''} ${className}`}
      {...dragHandleAttributes}
      {...dragHandleListeners}
    >
      {handle && (
        <button
          type="button"
          className="rasid-drag-handle"
          style={{
            cursor: disabled ? 'not-allowed' : 'grab',
            background: 'none',
            border: 'none',
            padding: '4px 8px',
            fontSize: '16px',
            lineHeight: 1,
            color: '#999',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          {...listeners}
          {...attributes}
          disabled={disabled}
          aria-label="Drag handle"
        >
          {'\u2807'}
        </button>
      )}
      {children}
    </div>
  );
}

// ─── Drop Zone ───────────────────────────────────────────────────────

export function DropZone({
  id,
  children,
  className = '',
  activeClassName = '',
}: DropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  const baseStyle: React.CSSProperties = {
    border: '2px dashed',
    borderColor: isOver ? '#2196F3' : '#CCCCCC',
    backgroundColor: isOver ? 'rgba(33, 150, 243, 0.06)' : 'transparent',
    borderRadius: '8px',
    padding: '16px',
    minHeight: '80px',
    transition: 'border-color 200ms ease, background-color 200ms ease',
  };

  return (
    <div
      ref={setNodeRef}
      style={baseStyle}
      className={`rasid-drop-zone ${isOver ? `rasid-drop-zone--active ${activeClassName}` : ''} ${className}`}
    >
      {children}
    </div>
  );
}

// ─── useSortableList Hook ────────────────────────────────────────────

export function useSortableList<T extends SortableListItem>(initialItems: T[]) {
  const [items, setItems] = useState<T[]>(initialItems);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) {
      return;
    }

    setItems((currentItems) => {
      const oldIndex = currentItems.findIndex((item) => item.id === active.id);
      const newIndex = currentItems.findIndex((item) => item.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return currentItems;
      }

      return arrayMove(currentItems, oldIndex, newIndex);
    });
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const activeItem = useMemo(
    () => items.find((item) => item.id === activeId) ?? null,
    [items, activeId],
  );

  const itemIds = useMemo(() => items.map((item) => item.id), [items]);

  return {
    items,
    setItems,
    activeId,
    activeItem,
    itemIds,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  };
}

// ─── Re-exports for convenience ──────────────────────────────────────

export {
  DndContext,
  DragOverlay,
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  closestCenter,
  closestCorners,
  restrictToVerticalAxis,
  restrictToParentElement,
  CSS,
};

export type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  UniqueIdentifier,
  SortingStrategy,
};
