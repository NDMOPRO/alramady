import { logger } from '../../utils/logger.js';

interface LayoutElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  styles?: Record<string, unknown>;
  content?: unknown;
  children?: LayoutElement[];
}

interface DesignSuggestion {
  id: string;
  category: 'alignment' | 'spacing' | 'color' | 'typography' | 'layout' | 'hierarchy';
  suggestion: string;
  confidence: number;
  preview: Partial<LayoutElement>;
  impact: 'low' | 'medium' | 'high';
  applied: boolean;
}

interface NarrativeStructure {
  title: string;
  sections: NarrativeSection[];
  flow: 'linear' | 'branching' | 'circular';
  estimatedDuration: number;
}

interface NarrativeSection {
  id: string;
  heading: string;
  keyMessage: string;
  dataPoints: string[];
  visualizationType: string;
  order: number;
}

interface AnimationConfig {
  elementId: string;
  type: 'fadeIn' | 'slideIn' | 'scaleUp' | 'typewriter' | 'wipe' | 'bounce' | 'none';
  direction?: 'left' | 'right' | 'top' | 'bottom';
  duration: number;
  delay: number;
  easing: string;
  staggerChildren?: number;
}

interface DataInsight {
  field: string;
  insight: string;
  importance: number;
}

export class AICoDesigner {
  suggestImprovement(layout: LayoutElement[]): DesignSuggestion[] {
    if (!layout || layout.length === 0) return [];

    const suggestions: DesignSuggestion[] = [];
    let sugId = 0;

    // Alignment analysis
    const alignmentIssues = this.detectAlignmentIssues(layout);
    for (const issue of alignmentIssues) {
      suggestions.push({
        id: `sug_${++sugId}`,
        category: 'alignment',
        suggestion: issue.message,
        confidence: issue.confidence,
        preview: issue.fix,
        impact: 'medium',
        applied: false,
      });
    }

    // Spacing analysis
    const spacingIssues = this.detectSpacingIssues(layout);
    for (const issue of spacingIssues) {
      suggestions.push({
        id: `sug_${++sugId}`,
        category: 'spacing',
        suggestion: issue.message,
        confidence: issue.confidence,
        preview: issue.fix,
        impact: 'medium',
        applied: false,
      });
    }

    // Visual hierarchy analysis
    const hierarchyIssues = this.analyzeHierarchy(layout);
    for (const issue of hierarchyIssues) {
      suggestions.push({
        id: `sug_${++sugId}`,
        category: 'hierarchy',
        suggestion: issue.message,
        confidence: issue.confidence,
        preview: issue.fix,
        impact: issue.impact,
        applied: false,
      });
    }

    // Layout balance analysis
    const balanceIssue = this.analyzeBalance(layout);
    if (balanceIssue) {
      suggestions.push({
        id: `sug_${++sugId}`,
        category: 'layout',
        suggestion: balanceIssue.message,
        confidence: balanceIssue.confidence,
        preview: balanceIssue.fix,
        impact: 'high',
        applied: false,
      });
    }

    logger.info('AICoDesigner suggestions generated', { count: suggestions.length, elementCount: layout.length });
    return suggestions;
  }

  suggestNarrative(data: Record<string, unknown>[]): NarrativeStructure {
    if (!data || data.length === 0) {
      return { title: 'Data Overview', sections: [], flow: 'linear', estimatedDuration: 0 };
    }

    const fields = Object.keys(data[0]);
    const numericFields = fields.filter(f => typeof data[0][f] === 'number');
    const categoricalFields = fields.filter(f => typeof data[0][f] === 'string');
    const insights = this.extractInsights(data, numericFields, categoricalFields);

    const sections: NarrativeSection[] = [];
    let order = 0;

    // Opening: overview
    sections.push({
      id: `section_${++order}`,
      heading: 'Overview',
      keyMessage: `Dataset contains ${data.length} records across ${fields.length} dimensions`,
      dataPoints: [`${data.length} records`, `${numericFields.length} metrics`, `${categoricalFields.length} categories`],
      visualizationType: 'summary-card',
      order,
    });

    // Key metrics
    for (const insight of insights.slice(0, 3)) {
      const vizType = this.suggestVisualization(insight, data);
      sections.push({
        id: `section_${++order}`,
        heading: insight.field,
        keyMessage: insight.insight,
        dataPoints: [insight.insight],
        visualizationType: vizType,
        order,
      });
    }

    // Comparison section if multiple categories exist
    if (categoricalFields.length > 0 && numericFields.length > 0) {
      sections.push({
        id: `section_${++order}`,
        heading: 'Comparative Analysis',
        keyMessage: `Comparing ${numericFields[0]} across ${categoricalFields[0]} categories`,
        dataPoints: [`Grouped by ${categoricalFields[0]}`, `Measuring ${numericFields[0]}`],
        visualizationType: 'bar',
        order,
      });
    }

    // Conclusion
    sections.push({
      id: `section_${++order}`,
      heading: 'Key Takeaways',
      keyMessage: insights.length > 0 ? insights[0].insight : 'Further analysis recommended',
      dataPoints: insights.map(i => i.insight),
      visualizationType: 'bullet-list',
      order,
    });

    const estimatedDuration = sections.length * 30; // ~30 seconds per section

    logger.info('AICoDesigner narrative suggested', { sections: sections.length, flow: 'linear' });
    return { title: 'Data Story', sections, flow: 'linear', estimatedDuration };
  }

  suggestAnimation(elements: LayoutElement[]): AnimationConfig[] {
    if (!elements || elements.length === 0) return [];

    const animations: AnimationConfig[] = [];
    const sorted = [...elements].sort((a, b) => {
      // Top-to-bottom, left-to-right reading order
      if (Math.abs(a.y - b.y) > 20) return a.y - b.y;
      return a.x - b.x;
    });

    for (let i = 0; i < sorted.length; i++) {
      const el = sorted[i];
      const anim = this.chooseAnimation(el, i, sorted.length);
      animations.push({
        elementId: el.id,
        type: anim.type,
        direction: anim.direction,
        duration: anim.duration,
        delay: i * 200, // stagger by 200ms
        easing: 'ease-out',
        staggerChildren: el.children && el.children.length > 0 ? 100 : undefined,
      });
    }

    logger.info('AICoDesigner animations suggested', { elementCount: elements.length, animationCount: animations.length });
    return animations;
  }

  private detectAlignmentIssues(layout: LayoutElement[]): { message: string; confidence: number; fix: Partial<LayoutElement> }[] {
    const issues: { message: string; confidence: number; fix: Partial<LayoutElement> }[] = [];
    if (layout.length < 2) return issues;

    // Find common x positions
    const xPositions = layout.map(e => e.x);
    const xCounts = new Map<number, number>();
    for (const x of xPositions) {
      // Round to nearest 8px grid
      const snapped = Math.round(x / 8) * 8;
      xCounts.set(snapped, (xCounts.get(snapped) ?? 0) + 1);
    }

    // Find dominant alignment
    let dominantX = 0;
    let maxCount = 0;
    for (const [x, count] of xCounts) {
      if (count > maxCount) { dominantX = x; maxCount = count; }
    }

    // Elements that are slightly off the dominant alignment
    for (const el of layout) {
      const snapped = Math.round(el.x / 8) * 8;
      const diff = Math.abs(snapped - dominantX);
      if (diff > 0 && diff <= 24 && maxCount >= 2) {
        issues.push({
          message: `Element "${el.id}" is ${diff}px off from the dominant left alignment at ${dominantX}px`,
          confidence: 0.85,
          fix: { id: el.id, x: dominantX },
        });
      }
    }

    return issues;
  }

  private detectSpacingIssues(layout: LayoutElement[]): { message: string; confidence: number; fix: Partial<LayoutElement> }[] {
    const issues: { message: string; confidence: number; fix: Partial<LayoutElement> }[] = [];
    if (layout.length < 3) return issues;

    // Sort by y position
    const sorted = [...layout].sort((a, b) => a.y - b.y);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(sorted[i].y - (sorted[i - 1].y + sorted[i - 1].height));
    }

    if (gaps.length < 2) return issues;

    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    for (let i = 0; i < gaps.length; i++) {
      const deviation = Math.abs(gaps[i] - avgGap);
      if (deviation > avgGap * 0.3 && deviation > 8) {
        const targetY = sorted[i].y + sorted[i].height + avgGap;
        issues.push({
          message: `Inconsistent vertical spacing before "${sorted[i + 1].id}": ${Math.round(gaps[i])}px vs average ${Math.round(avgGap)}px`,
          confidence: 0.75,
          fix: { id: sorted[i + 1].id, y: Math.round(targetY) },
        });
      }
    }

    return issues;
  }

  private analyzeHierarchy(layout: LayoutElement[]): { message: string; confidence: number; fix: Partial<LayoutElement>; impact: 'low' | 'medium' | 'high' }[] {
    const issues: { message: string; confidence: number; fix: Partial<LayoutElement>; impact: 'low' | 'medium' | 'high' }[] = [];

    const headings = layout.filter(e => e.type === 'heading' || e.type === 'title');
    const bodies = layout.filter(e => e.type === 'text' || e.type === 'paragraph');

    // Check if headings are visually larger than body text
    for (const heading of headings) {
      const headingSize = (heading.styles?.fontSize as number) ?? heading.height;
      for (const body of bodies) {
        const bodySize = (body.styles?.fontSize as number) ?? body.height;
        if (headingSize <= bodySize) {
          issues.push({
            message: `Heading "${heading.id}" is not visually larger than body text "${body.id}" — breaks visual hierarchy`,
            confidence: 0.9,
            fix: { id: heading.id, styles: { fontSize: bodySize * 1.5 } },
            impact: 'high',
          });
        }
      }
    }

    return issues;
  }

  private analyzeBalance(layout: LayoutElement[]): { message: string; confidence: number; fix: Partial<LayoutElement> } | null {
    if (layout.length < 2) return null;

    // Calculate visual weight center
    let totalWeight = 0;
    let weightedX = 0;
    let maxRight = 0;

    for (const el of layout) {
      const area = el.width * el.height;
      totalWeight += area;
      weightedX += (el.x + el.width / 2) * area;
      maxRight = Math.max(maxRight, el.x + el.width);
    }

    const centerOfWeight = weightedX / totalWeight;
    const layoutCenter = maxRight / 2;
    const imbalance = Math.abs(centerOfWeight - layoutCenter) / layoutCenter;

    if (imbalance > 0.2) {
      const direction = centerOfWeight > layoutCenter ? 'right' : 'left';
      return {
        message: `Layout is visually heavy on the ${direction} side (${Math.round(imbalance * 100)}% off-center)`,
        confidence: 0.7,
        fix: { id: layout[0].id }, // generic reference
      };
    }

    return null;
  }

  private extractInsights(data: Record<string, unknown>[], numericFields: string[], categoricalFields: string[]): DataInsight[] {
    const insights: DataInsight[] = [];

    for (const field of numericFields) {
      const values = data.map(r => Number(r[field])).filter(v => !isNaN(v));
      if (values.length === 0) continue;

      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min;

      insights.push({
        field,
        insight: `${field}: avg=${avg.toFixed(1)}, range=${min.toFixed(1)}-${max.toFixed(1)}`,
        importance: range / (avg || 1),
      });
    }

    // Sort by importance
    insights.sort((a, b) => b.importance - a.importance);
    return insights;
  }

  private suggestVisualization(insight: DataInsight, data: Record<string, unknown>[]): string {
    // Heuristic based on data characteristics
    const uniqueValues = new Set(data.map(r => r[insight.field])).size;
    const ratio = uniqueValues / data.length;

    if (ratio > 0.8) return 'line';
    if (ratio < 0.1) return 'pie';
    if (data.length > 100) return 'scatter';
    return 'bar';
  }

  private chooseAnimation(element: LayoutElement, index: number, total: number): {
    type: AnimationConfig['type'];
    direction?: AnimationConfig['direction'];
    duration: number;
  } {
    // Titles and headings get fade-in
    if (element.type === 'heading' || element.type === 'title') {
      return { type: 'fadeIn', duration: 600 };
    }

    // First element gets slide from left
    if (index === 0) {
      return { type: 'slideIn', direction: 'left', duration: 500 };
    }

    // Charts/images get scale-up
    if (element.type === 'chart' || element.type === 'image' || element.type === 'visualization') {
      return { type: 'scaleUp', duration: 700 };
    }

    // Text blocks get typewriter for short content, fadeIn for long
    if (element.type === 'text' || element.type === 'paragraph') {
      return { type: 'fadeIn', duration: 400 };
    }

    // Alternate slide directions for visual interest
    const direction = index % 2 === 0 ? 'left' : 'right';
    return { type: 'slideIn', direction, duration: 500 };
  }
}
