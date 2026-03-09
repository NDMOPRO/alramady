import { logger } from '../../utils/logger.js';

interface DesignTokens {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    error: string;
    warning: string;
    success: string;
    [key: string]: string;
  };
  fonts: {
    heading: string;
    body: string;
    mono: string;
    sizes: {
      xs: number;
      sm: number;
      md: number;
      lg: number;
      xl: number;
      xxl: number;
    };
    weights: {
      light: number;
      regular: number;
      medium: number;
      bold: number;
    };
  };
  spacing: {
    unit: number;
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  borderRadius: {
    none: number;
    sm: number;
    md: number;
    lg: number;
    full: number;
  };
  shadows: {
    none: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
}

interface Theme {
  id: string;
  name: string;
  tokens: DesignTokens;
  componentStyles: Map<string, ComponentStyle>;
  createdAt: number;
}

interface ComponentStyle {
  componentType: string;
  styles: Record<string, unknown>;
  variants: Record<string, Record<string, unknown>>;
  inheritsFrom?: string;
}

interface ThemedElement {
  id: string;
  type: string;
  variant?: string;
  styles: Record<string, unknown>;
  children?: ThemedElement[];
}

interface GridConfig {
  columns: number;
  rows: number;
  gutter: number;
  margin: number;
  columnWidth: number;
  rowHeight: number;
}

export class DesignSystemCore {
  private themes: Map<string, Theme> = new Map();
  private componentRegistry: Map<string, ComponentStyle> = new Map();

  createTokenTheme(tokens: DesignTokens, options?: { name?: string; id?: string }): Theme {
    const id = options?.id ?? `theme_${Date.now()}`;
    const name = options?.name ?? 'Custom Theme';

    // Generate default component styles from tokens
    const componentStyles = new Map<string, ComponentStyle>();

    componentStyles.set('button', {
      componentType: 'button',
      styles: {
        backgroundColor: tokens.colors.primary,
        color: '#ffffff',
        fontFamily: tokens.fonts.body,
        fontSize: tokens.fonts.sizes.md,
        fontWeight: tokens.fonts.weights.medium,
        padding: `${tokens.spacing.sm}px ${tokens.spacing.md}px`,
        borderRadius: `${tokens.borderRadius.md}px`,
        border: 'none',
        boxShadow: tokens.shadows.sm,
        cursor: 'pointer',
      },
      variants: {
        secondary: { backgroundColor: tokens.colors.secondary },
        outline: { backgroundColor: 'transparent', border: `2px solid ${tokens.colors.primary}`, color: tokens.colors.primary },
        ghost: { backgroundColor: 'transparent', boxShadow: tokens.shadows.none, color: tokens.colors.primary },
        danger: { backgroundColor: tokens.colors.error },
      },
    });

    componentStyles.set('card', {
      componentType: 'card',
      styles: {
        backgroundColor: tokens.colors.surface,
        borderRadius: `${tokens.borderRadius.lg}px`,
        boxShadow: tokens.shadows.md,
        padding: `${tokens.spacing.lg}px`,
      },
      variants: {
        flat: { boxShadow: tokens.shadows.none, border: `1px solid ${tokens.colors.textSecondary}` },
        elevated: { boxShadow: tokens.shadows.xl },
      },
    });

    componentStyles.set('heading', {
      componentType: 'heading',
      styles: {
        fontFamily: tokens.fonts.heading,
        fontWeight: tokens.fonts.weights.bold,
        color: tokens.colors.text,
        marginBottom: `${tokens.spacing.sm}px`,
      },
      variants: {
        h1: { fontSize: `${tokens.fonts.sizes.xxl}px` },
        h2: { fontSize: `${tokens.fonts.sizes.xl}px` },
        h3: { fontSize: `${tokens.fonts.sizes.lg}px` },
        h4: { fontSize: `${tokens.fonts.sizes.md}px` },
        subtitle: { fontSize: `${tokens.fonts.sizes.md}px`, fontWeight: tokens.fonts.weights.regular, color: tokens.colors.textSecondary },
      },
    });

    componentStyles.set('text', {
      componentType: 'text',
      styles: {
        fontFamily: tokens.fonts.body,
        fontSize: `${tokens.fonts.sizes.md}px`,
        fontWeight: tokens.fonts.weights.regular,
        color: tokens.colors.text,
        lineHeight: 1.6,
      },
      variants: {
        small: { fontSize: `${tokens.fonts.sizes.sm}px` },
        large: { fontSize: `${tokens.fonts.sizes.lg}px` },
        muted: { color: tokens.colors.textSecondary },
        code: { fontFamily: tokens.fonts.mono, fontSize: `${tokens.fonts.sizes.sm}px`, backgroundColor: tokens.colors.surface },
      },
    });

    componentStyles.set('input', {
      componentType: 'input',
      styles: {
        fontFamily: tokens.fonts.body,
        fontSize: `${tokens.fonts.sizes.md}px`,
        padding: `${tokens.spacing.sm}px ${tokens.spacing.md}px`,
        borderRadius: `${tokens.borderRadius.md}px`,
        border: `1px solid ${tokens.colors.textSecondary}`,
        backgroundColor: tokens.colors.background,
        color: tokens.colors.text,
      },
      variants: {
        error: { borderColor: tokens.colors.error },
        success: { borderColor: tokens.colors.success },
      },
    });

    const theme: Theme = { id, name, tokens, componentStyles, createdAt: Date.now() };
    this.themes.set(id, theme);

    logger.info('DesignSystemCore theme created', { id, name, componentCount: componentStyles.size });
    return theme;
  }

  applyTheme(elements: ThemedElement[], theme: Theme): ThemedElement[] {
    return elements.map(el => this.applyThemeToElement(el, theme));
  }

  registerComponent(componentType: string, style: ComponentStyle): void {
    this.componentRegistry.set(componentType, style);
    // Also add to all existing themes
    for (const theme of this.themes.values()) {
      if (!theme.componentStyles.has(componentType)) {
        theme.componentStyles.set(componentType, style);
      }
    }
    logger.debug('DesignSystemCore component registered', { componentType });
  }

  createModularGrid(containerWidth: number, containerHeight: number, options?: {
    columns?: number;
    rows?: number;
    gutter?: number;
    margin?: number;
  }): GridConfig {
    const columns = options?.columns ?? 12;
    const gutter = options?.gutter ?? 16;
    const margin = options?.margin ?? 24;

    const availableWidth = containerWidth - 2 * margin - (columns - 1) * gutter;
    const columnWidth = availableWidth / columns;

    const rows = options?.rows ?? Math.max(1, Math.floor(containerHeight / columnWidth));
    const rowHeight = (containerHeight - 2 * margin - (rows - 1) * gutter) / rows;

    return { columns, rows, gutter, margin, columnWidth, rowHeight };
  }

  getGridPosition(grid: GridConfig, col: number, row: number, spanCols: number, spanRows: number): {
    x: number; y: number; width: number; height: number;
  } {
    const x = grid.margin + (col - 1) * (grid.columnWidth + grid.gutter);
    const y = grid.margin + (row - 1) * (grid.rowHeight + grid.gutter);
    const width = spanCols * grid.columnWidth + (spanCols - 1) * grid.gutter;
    const height = spanRows * grid.rowHeight + (spanRows - 1) * grid.gutter;
    return { x, y, width, height };
  }

  getTheme(themeId: string): Theme | null {
    return this.themes.get(themeId) ?? null;
  }

  deriveTheme(baseThemeId: string, overrides: Partial<DesignTokens>, options?: { name?: string; id?: string }): Theme {
    const baseTheme = this.themes.get(baseThemeId);
    if (!baseTheme) throw new Error(`Base theme "${baseThemeId}" not found`);

    const mergedTokens: DesignTokens = {
      colors: { ...baseTheme.tokens.colors, ...(overrides.colors ?? {}) },
      fonts: {
        ...baseTheme.tokens.fonts,
        ...(overrides.fonts ?? {}),
        sizes: { ...baseTheme.tokens.fonts.sizes, ...(overrides.fonts?.sizes ?? {}) },
        weights: { ...baseTheme.tokens.fonts.weights, ...(overrides.fonts?.weights ?? {}) },
      },
      spacing: { ...baseTheme.tokens.spacing, ...(overrides.spacing ?? {}) },
      borderRadius: { ...baseTheme.tokens.borderRadius, ...(overrides.borderRadius ?? {}) },
      shadows: { ...baseTheme.tokens.shadows, ...(overrides.shadows ?? {}) },
    };

    return this.createTokenTheme(mergedTokens, options);
  }

  private applyThemeToElement(element: ThemedElement, theme: Theme): ThemedElement {
    const componentStyle = theme.componentStyles.get(element.type);
    let resolvedStyles: Record<string, unknown> = {};

    if (componentStyle) {
      // Resolve inheritance chain
      resolvedStyles = this.resolveInheritance(componentStyle, theme);

      // Apply variant
      if (element.variant && componentStyle.variants[element.variant]) {
        resolvedStyles = { ...resolvedStyles, ...componentStyle.variants[element.variant] };
      }
    }

    // Element's own styles override theme styles
    const finalStyles = { ...resolvedStyles, ...element.styles };

    // Recursively theme children
    const themedChildren = element.children
      ? element.children.map(child => this.applyThemeToElement(child, theme))
      : undefined;

    return { ...element, styles: finalStyles, children: themedChildren };
  }

  private resolveInheritance(style: ComponentStyle, theme: Theme): Record<string, unknown> {
    let base: Record<string, unknown> = {};

    if (style.inheritsFrom) {
      const parentStyle = theme.componentStyles.get(style.inheritsFrom);
      if (parentStyle) {
        base = this.resolveInheritance(parentStyle, theme);
      }
    }

    return { ...base, ...style.styles };
  }
}
