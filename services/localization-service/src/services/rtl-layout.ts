import { z } from 'zod';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'rtl-layout' },
  transports: [new winston.transports.Console()],
});

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const ChartMirrorInputSchema = z.object({
  chart: z.object({
    type: z.enum(['bar', 'line', 'area', 'scatter', 'pie', 'donut', 'radar', 'heatmap', 'waterfall', 'funnel']),
    xAxis: z.object({
      labels: z.array(z.string()).optional(),
      position: z.enum(['top', 'bottom']).default('bottom'),
      reversed: z.boolean().default(false),
      title: z.string().optional(),
    }).optional(),
    yAxis: z.object({
      labels: z.array(z.string()).optional(),
      position: z.enum(['left', 'right']).default('left'),
      title: z.string().optional(),
    }).optional(),
    legend: z.object({
      position: z.enum(['top', 'bottom', 'left', 'right']).default('right'),
      items: z.array(z.string()).optional(),
    }).optional(),
    series: z.array(z.object({
      name: z.string(),
      data: z.array(z.number()),
    })).optional(),
    layout: z.record(z.unknown()).optional(),
  }),
  preserveSpacing: z.boolean().default(true),
});

const TableMirrorInputSchema = z.object({
  table: z.object({
    headers: z.array(z.string()),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
    alignment: z.array(z.enum(['left', 'center', 'right'])).optional(),
    layout: z.record(z.unknown()).optional(),
    caption: z.string().optional(),
    direction: z.enum(['ltr', 'rtl']).default('ltr'),
  }),
  preserveNumericAlignment: z.boolean().default(true),
});

const UIElementsMirrorInputSchema = z.object({
  elements: z.array(z.object({
    type: z.enum(['button', 'list', 'menu', 'dropdown', 'tabs', 'breadcrumb', 'pagination', 'toolbar', 'sidebar', 'navbar']),
    id: z.string().optional(),
    label: z.string().optional(),
    items: z.array(z.string()).optional(),
    position: z.enum(['left', 'right', 'center']).optional(),
    layout: z.record(z.unknown()).optional(),
    icon: z.object({
      name: z.string(),
      position: z.enum(['left', 'right', 'start', 'end']).optional(),
      mirrorable: z.boolean().default(true),
    }).optional(),
  })),
  globalDirection: z.enum(['ltr', 'rtl']).default('rtl'),
});

// ─── Icon Mirror Rules ──────────────────────────────────────────────────────

const NON_MIRRORABLE_ICONS = new Set([
  'check', 'checkmark', 'close', 'x', 'plus', 'minus',
  'search', 'settings', 'gear', 'cog', 'star', 'heart',
  'lock', 'unlock', 'eye', 'download', 'upload', 'refresh',
  'sync', 'clock', 'calendar', 'mail', 'phone', 'camera',
  'home', 'user', 'bell', 'flag', 'pin', 'trash', 'delete',
  'edit', 'pencil', 'filter', 'sort', 'grid', 'list-view',
  'play', 'pause', 'stop', 'volume', 'mute',
]);

const MIRRORABLE_ICONS = new Set([
  'arrow-left', 'arrow-right', 'chevron-left', 'chevron-right',
  'caret-left', 'caret-right', 'indent', 'outdent',
  'align-left', 'align-right', 'text-left', 'text-right',
  'reply', 'forward', 'undo', 'redo',
  'external-link', 'logout', 'login', 'enter', 'exit',
  'skip-back', 'skip-forward', 'rewind', 'fast-forward',
  'panel-left', 'panel-right', 'sidebar-left', 'sidebar-right',
]);

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChartMirrorResult {
  chart: Record<string, unknown>;
  transformations: string[];
  axesMirrored: boolean;
  legendRepositioned: boolean;
}

interface TableMirrorResult {
  table: Record<string, unknown>;
  transformations: string[];
  columnsReversed: boolean;
  alignmentMirrored: boolean;
}

interface UIElementsMirrorResult {
  elements: Array<Record<string, unknown>>;
  transformations: string[];
  totalMirrored: number;
  iconsMirrored: number;
}

// ─── Service Functions ───────────────────────────────────────────────────────

export function mirrorChart(
  input: z.infer<typeof ChartMirrorInputSchema>
): ChartMirrorResult {
  const validated = ChartMirrorInputSchema.parse(input);
  logger.info('mirrorChart called', { chartType: validated.chart.type });

  const chart = JSON.parse(JSON.stringify(validated.chart));
  const transformations: string[] = [];
  let axesMirrored = false;
  let legendRepositioned = false;

  // Mirror X axis for bar/line/area/scatter charts
  if (['bar', 'line', 'area', 'scatter', 'waterfall'].includes(chart.type)) {
    if (chart.xAxis) {
      chart.xAxis.reversed = !chart.xAxis.reversed;
      if (chart.xAxis.labels) {
        chart.xAxis.labels = [...chart.xAxis.labels].reverse();
      }
      transformations.push('X-axis reversed for RTL reading direction');
      axesMirrored = true;
    }

    if (chart.yAxis) {
      const currentPos = chart.yAxis.position || 'left';
      chart.yAxis.position = currentPos === 'left' ? 'right' : 'left';
      transformations.push(`Y-axis moved from ${currentPos} to ${chart.yAxis.position}`);
      axesMirrored = true;
    }

    // Reverse series data to match reversed X axis
    if (chart.series) {
      for (const series of chart.series) {
        series.data = [...series.data].reverse();
      }
      transformations.push('Series data reversed to match RTL axis order');
    }
  }

  // Mirror funnel chart (reading direction swap)
  if (chart.type === 'funnel') {
    if (chart.layout) {
      const currentAlign = chart.layout['alignment'] || 'left';
      chart.layout['alignment'] = currentAlign === 'left' ? 'right' : 'left';
      transformations.push('Funnel alignment mirrored');
    }
  }

  // Mirror legend position
  if (chart.legend) {
    const currentLegendPos = chart.legend.position || 'right';
    if (currentLegendPos === 'left') {
      chart.legend.position = 'right';
      legendRepositioned = true;
      transformations.push('Legend moved from left to right');
    } else if (currentLegendPos === 'right') {
      chart.legend.position = 'left';
      legendRepositioned = true;
      transformations.push('Legend moved from right to left');
    }
    // top/bottom stay the same but items are reversed
    if (chart.legend.items) {
      chart.legend.items = [...chart.legend.items].reverse();
      transformations.push('Legend items order reversed for RTL');
    }
  }

  // Mirror layout properties
  if (chart.layout) {
    chart.layout = mirrorLayoutProperties(chart.layout as Record<string, unknown>);
    transformations.push('Chart layout CSS properties mirrored');
  }

  // Preserve spacing ratios
  if (validated.preserveSpacing && chart.layout) {
    const layout = chart.layout as Record<string, unknown>;
    preserveSpacingRatios(layout);
    transformations.push('Spacing ratios preserved during mirror');
  }

  // Set direction
  if (!chart.layout) {
    chart.layout = {};
  }
  (chart.layout as Record<string, unknown>)['direction'] = 'rtl';

  logger.info('Chart mirrored', {
    type: chart.type,
    transformationCount: transformations.length,
    axesMirrored,
    legendRepositioned,
  });

  return {
    chart,
    transformations,
    axesMirrored,
    legendRepositioned,
  };
}

export function mirrorTable(
  input: z.infer<typeof TableMirrorInputSchema>
): TableMirrorResult {
  const validated = TableMirrorInputSchema.parse(input);
  logger.info('mirrorTable called', {
    headerCount: validated.table.headers.length,
    rowCount: validated.table.rows.length,
  });

  const table = JSON.parse(JSON.stringify(validated.table));
  const transformations: string[] = [];

  // Reverse column order (headers and each row)
  table.headers = [...table.headers].reverse();
  transformations.push('Table headers reversed for RTL reading order');

  const reversedRows: Array<Array<string | number | null>> = [];
  for (const row of table.rows) {
    reversedRows.push([...row].reverse());
  }
  table.rows = reversedRows;
  transformations.push('Table row cells reversed for RTL reading order');

  // Mirror alignment
  let alignmentMirrored = false;
  if (table.alignment && table.alignment.length > 0) {
    const mirroredAlignment: Array<'left' | 'center' | 'right'> = [];
    for (const align of [...table.alignment].reverse()) {
      if (align === 'left') {
        mirroredAlignment.push('right');
      } else if (align === 'right') {
        mirroredAlignment.push('left');
      } else {
        mirroredAlignment.push(align);
      }
    }

    // Preserve numeric column alignment if requested
    if (validated.preserveNumericAlignment) {
      for (let colIdx = 0; colIdx < table.headers.length; colIdx++) {
        const isNumericColumn = table.rows.length > 0 &&
          table.rows.every((row: Array<string | number | null>) =>
            row[colIdx] === null || typeof row[colIdx] === 'number' ||
            (typeof row[colIdx] === 'string' && /^[\d٠-٩٬٫.,\s-]+$/.test(row[colIdx] as string))
          );

        if (isNumericColumn) {
          // Keep numeric columns left-aligned in RTL (they display LTR)
          mirroredAlignment[colIdx] = 'left';
        }
      }
      transformations.push('Numeric column alignment preserved');
    }

    table.alignment = mirroredAlignment;
    alignmentMirrored = true;
    transformations.push('Column alignment mirrored for RTL');
  }

  // Mirror layout
  if (table.layout) {
    table.layout = mirrorLayoutProperties(table.layout);
    transformations.push('Table layout properties mirrored');
  }

  table.direction = 'rtl';
  transformations.push('Table direction set to RTL');

  logger.info('Table mirrored', {
    columns: table.headers.length,
    rows: table.rows.length,
    alignmentMirrored,
    transformationCount: transformations.length,
  });

  return {
    table,
    transformations,
    columnsReversed: true,
    alignmentMirrored,
  };
}

export function mirrorUIElements(
  input: z.infer<typeof UIElementsMirrorInputSchema>
): UIElementsMirrorResult {
  const validated = UIElementsMirrorInputSchema.parse(input);
  logger.info('mirrorUIElements called', {
    elementCount: validated.elements.length,
    globalDirection: validated.globalDirection,
  });

  const mirroredElements: Array<Record<string, unknown>> = [];
  const transformations: string[] = [];
  let totalMirrored = 0;
  let iconsMirrored = 0;

  for (const element of validated.elements) {
    const mirrored: Record<string, unknown> = { ...element };

    // Mirror position
    if (element.position) {
      if (element.position === 'left') {
        mirrored['position'] = 'right';
        transformations.push(`${element.type}${element.id ? ` #${element.id}` : ''}: position left -> right`);
      } else if (element.position === 'right') {
        mirrored['position'] = 'left';
        transformations.push(`${element.type}${element.id ? ` #${element.id}` : ''}: position right -> left`);
      }
      totalMirrored++;
    }

    // Reverse list/menu/tab items order for RTL
    if (element.items && element.items.length > 0) {
      if (['breadcrumb', 'pagination', 'tabs', 'toolbar'].includes(element.type)) {
        mirrored['items'] = [...element.items].reverse();
        transformations.push(`${element.type}: items order reversed for RTL`);
      }
      // Regular lists and menus keep semantic order but change visual direction
    }

    // Handle icon mirroring
    if (element.icon) {
      const iconName = element.icon.name.toLowerCase();
      const shouldMirror = element.icon.mirrorable !== false &&
        (MIRRORABLE_ICONS.has(iconName) || iconName.includes('arrow') || iconName.includes('chevron'));
      const shouldNotMirror = NON_MIRRORABLE_ICONS.has(iconName);

      if (shouldMirror && !shouldNotMirror) {
        const mirroredIconName = mirrorIconName(element.icon.name);
        const mirroredIcon: Record<string, unknown> = {
          ...element.icon,
          name: mirroredIconName,
          mirrored: true,
        };

        // Swap icon position
        if (element.icon.position === 'left' || element.icon.position === 'start') {
          mirroredIcon['position'] = 'right';
        } else if (element.icon.position === 'right' || element.icon.position === 'end') {
          mirroredIcon['position'] = 'left';
        }

        mirrored['icon'] = mirroredIcon;
        iconsMirrored++;
        transformations.push(`${element.type} icon "${element.icon.name}" -> "${mirroredIconName}"`);
      } else {
        // Non-mirrorable icon: only swap position, not the icon itself
        if (element.icon.position) {
          const iconCopy: Record<string, unknown> = { ...element.icon };
          if (element.icon.position === 'left' || element.icon.position === 'start') {
            iconCopy['position'] = 'right';
          } else if (element.icon.position === 'right' || element.icon.position === 'end') {
            iconCopy['position'] = 'left';
          }
          mirrored['icon'] = iconCopy;
          transformations.push(`${element.type} icon "${element.icon.name}": position swapped, icon not mirrored`);
        }
      }
    }

    // Mirror layout properties
    if (element.layout) {
      mirrored['layout'] = mirrorLayoutProperties(element.layout);
      totalMirrored++;
    }

    // Set direction
    mirrored['direction'] = validated.globalDirection;

    // Element-specific transformations
    switch (element.type) {
      case 'sidebar':
        if (element.position === 'left') {
          mirrored['position'] = 'right';
          transformations.push('Sidebar moved from left to right for RTL');
        } else if (element.position === 'right') {
          mirrored['position'] = 'left';
        }
        break;

      case 'navbar':
        // Reverse navbar item order
        if (element.items) {
          mirrored['items'] = [...element.items].reverse();
          transformations.push('Navbar items reversed for RTL');
        }
        break;

      case 'dropdown':
        // Dropdown opens from opposite side
        mirrored['openDirection'] = element.position === 'right' ? 'left' : 'right';
        transformations.push('Dropdown open direction mirrored');
        break;

      default:
        break;
    }

    mirroredElements.push(mirrored);
  }

  logger.info('UI elements mirrored', {
    totalMirrored,
    iconsMirrored,
    transformationCount: transformations.length,
  });

  return {
    elements: mirroredElements,
    transformations,
    totalMirrored,
    iconsMirrored,
  };
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function mirrorIconName(iconName: string): string {
  const swaps: Record<string, string> = {
    'arrow-left': 'arrow-right',
    'arrow-right': 'arrow-left',
    'chevron-left': 'chevron-right',
    'chevron-right': 'chevron-left',
    'caret-left': 'caret-right',
    'caret-right': 'caret-left',
    'align-left': 'align-right',
    'align-right': 'align-left',
    'text-left': 'text-right',
    'text-right': 'text-left',
    'indent': 'outdent',
    'outdent': 'indent',
    'undo': 'redo',
    'redo': 'undo',
    'reply': 'forward',
    'forward': 'reply',
    'skip-back': 'skip-forward',
    'skip-forward': 'skip-back',
    'rewind': 'fast-forward',
    'fast-forward': 'rewind',
    'panel-left': 'panel-right',
    'panel-right': 'panel-left',
    'sidebar-left': 'sidebar-right',
    'sidebar-right': 'sidebar-left',
  };

  return swaps[iconName.toLowerCase()] || iconName;
}

function mirrorLayoutProperties(layout: Record<string, unknown>): Record<string, unknown> {
  const mirrored: Record<string, unknown> = {};
  const swapMap: Record<string, string> = {
    'left': 'right',
    'right': 'left',
    'margin-left': 'margin-right',
    'margin-right': 'margin-left',
    'padding-left': 'padding-right',
    'padding-right': 'padding-left',
    'border-left': 'border-right',
    'border-right': 'border-left',
    'marginLeft': 'marginRight',
    'marginRight': 'marginLeft',
    'paddingLeft': 'paddingRight',
    'paddingRight': 'paddingLeft',
    'borderLeft': 'borderRight',
    'borderRight': 'borderLeft',
    'border-top-left-radius': 'border-top-right-radius',
    'border-top-right-radius': 'border-top-left-radius',
    'border-bottom-left-radius': 'border-bottom-right-radius',
    'border-bottom-right-radius': 'border-bottom-left-radius',
  };

  for (const [key, value] of Object.entries(layout)) {
    const swappedKey = swapMap[key] || key;

    if (key === 'text-align' || key === 'textAlign') {
      if (value === 'left') mirrored[swappedKey] = 'right';
      else if (value === 'right') mirrored[swappedKey] = 'left';
      else mirrored[swappedKey] = value;
    } else if (key === 'float' || key === 'clear') {
      if (value === 'left') mirrored[key] = 'right';
      else if (value === 'right') mirrored[key] = 'left';
      else mirrored[key] = value;
    } else if (key === 'transform' && typeof value === 'string') {
      mirrored[key] = value.replace(
        /translateX\(([^)]+)\)/,
        (_match: string, val: string) => {
          const numVal = parseFloat(val);
          if (!isNaN(numVal)) {
            return `translateX(${-numVal}${val.replace(String(numVal), '')})`;
          }
          return _match;
        }
      );
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      mirrored[swappedKey] = mirrorLayoutProperties(value as Record<string, unknown>);
    } else {
      mirrored[swappedKey] = value;
    }
  }

  mirrored['direction'] = 'rtl';
  return mirrored;
}

function preserveSpacingRatios(layout: Record<string, unknown>): void {
  const spacingKeys = [
    'margin-left', 'margin-right', 'marginLeft', 'marginRight',
    'padding-left', 'padding-right', 'paddingLeft', 'paddingRight',
  ];

  const leftKeys = spacingKeys.filter(k => k.includes('left') || k.includes('Left'));
  const rightKeys = spacingKeys.filter(k => k.includes('right') || k.includes('Right'));

  for (let i = 0; i < leftKeys.length; i++) {
    const leftKey = leftKeys[i];
    const rightKey = rightKeys[i];
    const leftVal = layout[leftKey];
    const rightVal = layout[rightKey];

    if (leftVal !== undefined && rightVal !== undefined) {
      // Values are already swapped by mirrorLayoutProperties, just verify ratio
      const leftNum = typeof leftVal === 'number' ? leftVal : parseFloat(String(leftVal));
      const rightNum = typeof rightVal === 'number' ? rightVal : parseFloat(String(rightVal));

      if (!isNaN(leftNum) && !isNaN(rightNum) && (leftNum + rightNum) > 0) {
        const totalSpace = leftNum + rightNum;
        const leftRatio = leftNum / totalSpace;
        const rightRatio = rightNum / totalSpace;
        // Ratios are preserved through the swap -- no rounding needed
        layout[leftKey] = totalSpace * rightRatio;
        layout[rightKey] = totalSpace * leftRatio;
      }
    }
  }
}
