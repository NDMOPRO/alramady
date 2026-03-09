import type { CellAddress, CellRange } from '../types/common.types.js';

export function parseCellAddress(ref: string): CellAddress | null {
  const match = ref.match(/^\$?([A-Z]+)\$?(\d+)$/i);
  if (!match) return null;
  return {
    col: letterToColNumber(match[1].toUpperCase()),
    row: parseInt(match[2], 10),
    absolute: {
      col: ref.startsWith('$'),
      row: ref.includes('$', 1),
    },
  };
}

export function cellAddressToString(addr: CellAddress): string {
  const colStr = colNumberToLetter(addr.col);
  const prefix = addr.absolute?.col ? '$' : '';
  const rowPrefix = addr.absolute?.row ? '$' : '';
  return `${prefix}${colStr}${rowPrefix}${addr.row}`;
}

export function parseRange(rangeStr: string): CellRange | null {
  const parts = rangeStr.split(':');
  if (parts.length !== 2) return null;
  const start = parseCellAddress(parts[0]);
  const end = parseCellAddress(parts[1]);
  if (!start || !end) return null;
  return { start, end };
}

export function rangeToString(range: CellRange): string {
  return `${cellAddressToString(range.start)}:${cellAddressToString(range.end)}`;
}

export function colNumberToLetter(col: number): string {
  let result = '';
  let c = col;
  while (c > 0) {
    c--;
    result = String.fromCharCode(65 + (c % 26)) + result;
    c = Math.floor(c / 26);
  }
  return result || 'A';
}

export function letterToColNumber(letter: string): number {
  let col = 0;
  for (let i = 0; i < letter.length; i++) {
    col = col * 26 + (letter.charCodeAt(i) - 64);
  }
  return col;
}

export function expandRange(range: CellRange): CellAddress[] {
  const cells: CellAddress[] = [];
  for (let row = range.start.row; row <= range.end.row; row++) {
    for (let col = range.start.col; col <= range.end.col; col++) {
      cells.push({ row, col });
    }
  }
  return cells;
}

export function isInRange(cell: CellAddress, range: CellRange): boolean {
  return (
    cell.row >= range.start.row &&
    cell.row <= range.end.row &&
    cell.col >= range.start.col &&
    cell.col <= range.end.col
  );
}

export function flattenValues(values: unknown[]): unknown[] {
  const result: unknown[] = [];
  for (const v of values) {
    if (Array.isArray(v)) {
      result.push(...flattenValues(v));
    } else {
      result.push(v);
    }
  }
  return result;
}

export function toNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'boolean') return val ? 1 : 0;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

export function isNumeric(val: unknown): boolean {
  return toNumber(val) !== null;
}

export function getCellRef(row: number, col: number): string {
  return `${colNumberToLetter(col)}${row}`;
}

export function parseCellRef(ref: string): { row: number; col: number } | null {
  const addr = parseCellAddress(ref);
  if (!addr) return null;
  return { row: addr.row, col: addr.col };
}
