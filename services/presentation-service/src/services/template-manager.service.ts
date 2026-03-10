import { PrismaClient } from '@prisma/client';
import PptxGenJS from 'pptxgenjs';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────
interface SlideTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  layout: LayoutPreset;
  masterSlideId?: string;
  elements: TemplateElement[];
  backgroundColor: string;
  backgroundImage?: string;
  transitions: TransitionConfig;
  metadata: Record<string, unknown>;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

type LayoutPreset =
  | 'title'
  | 'title_content'
  | 'two_column'
  | 'comparison'
  | 'section_header'
  | 'blank'
  | 'content_only'
  | 'image_left'
  | 'image_right'
  | 'full_image'
  | 'three_column'
  | 'dashboard'
  | 'quote'
  | 'timeline';

interface TemplateElement {
  id: string;
  type: 'text' | 'image' | 'shape' | 'chart' | 'table' | 'placeholder' | 'icon';
  name: string;
  position: { x: number; y: number; w: number; h: number };
  style: ElementStyle;
  content?: string;
  placeholder?: string;
  locked: boolean;
  visible: boolean;
  layer: number;
}

interface ElementStyle {
  fontSize?: number;
  fontFamily?: string;
  fontColor?: string;
  fontBold?: boolean;
  fontItalic?: boolean;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  rotation?: number;
  shadow?: { color: string; blur: number; offset: { x: number; y: number } };
  padding?: { top: number; right: number; bottom: number; left: number };
}

interface TransitionConfig {
  type: 'none' | 'fade' | 'slide' | 'push' | 'wipe' | 'dissolve' | 'zoom';
  duration: number;
  direction?: 'left' | 'right' | 'up' | 'down';
}

interface MasterSlide {
  id: string;
  name: string;
  backgroundColor: string;
  backgroundGradient?: { start: string; end: string; angle: number };
  headerElements: TemplateElement[];
  footerElements: TemplateElement[];
  logoPosition?: { x: number; y: number; w: number; h: number };
  colorScheme: ColorScheme;
  fontScheme: FontScheme;
  createdAt: Date;
  updatedAt: Date;
}

interface ColorScheme {
  primary: string;
  secondary: string;
  accent1: string;
  accent2: string;
  background: string;
  text: string;
  lightText: string;
  darkText: string;
}

interface FontScheme {
  titleFont: string;
  bodyFont: string;
  captionFont: string;
  titleSizes: { large: number; medium: number; small: number };
  bodySizes: { large: number; medium: number; small: number };
}

interface TemplateFilter {
  category?: string;
  layout?: LayoutPreset;
  search?: string;
  createdBy?: string;
}

// ─── Service ─────────────────────────────────────────────────────────
export default class TemplateManagerService {
  private prisma: PrismaClient;
  private templateCache: Map<string, SlideTemplate> = new Map();
  private masterSlideCache: Map<string, MasterSlide> = new Map();
  private layoutDefinitions: Map<LayoutPreset, TemplateElement[]> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.initializeLayoutDefinitions();
  }

  private initializeLayoutDefinitions(): void {
    this.layoutDefinitions.set('title', [
      {
        id: 'title_main',
        type: 'placeholder',
        name: 'Title',
        position: { x: 0.5, y: 1.5, w: 9, h: 1.5 },
        style: { fontSize: 44, fontBold: true, alignment: 'center', verticalAlign: 'middle', fontColor: '#FFFFFF' },
        placeholder: 'Click to add title',
        locked: false,
        visible: true,
        layer: 1,
      },
      {
        id: 'title_subtitle',
        type: 'placeholder',
        name: 'Subtitle',
        position: { x: 1, y: 3.2, w: 8, h: 0.8 },
        style: { fontSize: 20, alignment: 'center', verticalAlign: 'middle', fontColor: '#CCCCCC' },
        placeholder: 'Click to add subtitle',
        locked: false,
        visible: true,
        layer: 2,
      },
    ]);

    this.layoutDefinitions.set('title_content', [
      {
        id: 'tc_title',
        type: 'placeholder',
        name: 'Title',
        position: { x: 0.5, y: 0.3, w: 9, h: 0.8 },
        style: { fontSize: 28, fontBold: true, alignment: 'left', fontColor: '#212121' },
        placeholder: 'Click to add title',
        locked: false,
        visible: true,
        layer: 1,
      },
      {
        id: 'tc_content',
        type: 'placeholder',
        name: 'Content',
        position: { x: 0.5, y: 1.3, w: 9, h: 4 },
        style: { fontSize: 16, alignment: 'left', verticalAlign: 'top', fontColor: '#333333' },
        placeholder: 'Click to add content',
        locked: false,
        visible: true,
        layer: 2,
      },
    ]);

    this.layoutDefinitions.set('two_column', [
      {
        id: '2col_title',
        type: 'placeholder',
        name: 'Title',
        position: { x: 0.5, y: 0.3, w: 9, h: 0.8 },
        style: { fontSize: 28, fontBold: true, alignment: 'center', fontColor: '#212121' },
        placeholder: 'Click to add title',
        locked: false,
        visible: true,
        layer: 1,
      },
      {
        id: '2col_left',
        type: 'placeholder',
        name: 'Left Column',
        position: { x: 0.5, y: 1.3, w: 4.25, h: 4 },
        style: { fontSize: 14, alignment: 'left', verticalAlign: 'top', fontColor: '#333333' },
        placeholder: 'Left column content',
        locked: false,
        visible: true,
        layer: 2,
      },
      {
        id: '2col_right',
        type: 'placeholder',
        name: 'Right Column',
        position: { x: 5.25, y: 1.3, w: 4.25, h: 4 },
        style: { fontSize: 14, alignment: 'left', verticalAlign: 'top', fontColor: '#333333' },
        placeholder: 'Right column content',
        locked: false,
        visible: true,
        layer: 3,
      },
    ]);

    this.layoutDefinitions.set('comparison', [
      {
        id: 'comp_title',
        type: 'placeholder',
        name: 'Title',
        position: { x: 0.5, y: 0.3, w: 9, h: 0.6 },
        style: { fontSize: 24, fontBold: true, alignment: 'center', fontColor: '#212121' },
        placeholder: 'Comparison Title',
        locked: false,
        visible: true,
        layer: 1,
      },
      {
        id: 'comp_left_header',
        type: 'placeholder',
        name: 'Left Header',
        position: { x: 0.5, y: 1.1, w: 4.25, h: 0.5 },
        style: { fontSize: 18, fontBold: true, alignment: 'center', fontColor: '#FFFFFF', backgroundColor: '#1B5E20' },
        placeholder: 'Option A',
        locked: false,
        visible: true,
        layer: 2,
      },
      {
        id: 'comp_left_content',
        type: 'placeholder',
        name: 'Left Content',
        position: { x: 0.5, y: 1.7, w: 4.25, h: 3.5 },
        style: { fontSize: 14, alignment: 'left', verticalAlign: 'top', fontColor: '#333333', borderColor: '#1B5E20', borderWidth: 1 },
        placeholder: 'Left comparison content',
        locked: false,
        visible: true,
        layer: 3,
      },
      {
        id: 'comp_right_header',
        type: 'placeholder',
        name: 'Right Header',
        position: { x: 5.25, y: 1.1, w: 4.25, h: 0.5 },
        style: { fontSize: 18, fontBold: true, alignment: 'center', fontColor: '#FFFFFF', backgroundColor: '#0D47A1' },
        placeholder: 'Option B',
        locked: false,
        visible: true,
        layer: 4,
      },
      {
        id: 'comp_right_content',
        type: 'placeholder',
        name: 'Right Content',
        position: { x: 5.25, y: 1.7, w: 4.25, h: 3.5 },
        style: { fontSize: 14, alignment: 'left', verticalAlign: 'top', fontColor: '#333333', borderColor: '#0D47A1', borderWidth: 1 },
        placeholder: 'Right comparison content',
        locked: false,
        visible: true,
        layer: 5,
      },
    ]);

    this.layoutDefinitions.set('section_header', [
      {
        id: 'sh_number',
        type: 'placeholder',
        name: 'Section Number',
        position: { x: 0.5, y: 1.0, w: 2, h: 2 },
        style: { fontSize: 72, fontBold: true, alignment: 'center', verticalAlign: 'middle', fontColor: '#E0E0E0' },
        placeholder: '01',
        locked: false,
        visible: true,
        layer: 1,
      },
      {
        id: 'sh_title',
        type: 'placeholder',
        name: 'Section Title',
        position: { x: 3, y: 1.5, w: 6.5, h: 1.2 },
        style: { fontSize: 36, fontBold: true, alignment: 'left', verticalAlign: 'middle', fontColor: '#212121' },
        placeholder: 'Section Title',
        locked: false,
        visible: true,
        layer: 2,
      },
      {
        id: 'sh_desc',
        type: 'placeholder',
        name: 'Description',
        position: { x: 3, y: 2.8, w: 6.5, h: 0.8 },
        style: { fontSize: 16, alignment: 'left', fontColor: '#666666' },
        placeholder: 'Brief section description',
        locked: false,
        visible: true,
        layer: 3,
      },
    ]);

    this.layoutDefinitions.set('blank', []);

    this.layoutDefinitions.set('image_left', [
      {
        id: 'il_image',
        type: 'placeholder',
        name: 'Image',
        position: { x: 0.3, y: 0.3, w: 4.7, h: 4.9 },
        style: { borderRadius: 8 },
        placeholder: 'image',
        locked: false,
        visible: true,
        layer: 1,
      },
      {
        id: 'il_title',
        type: 'placeholder',
        name: 'Title',
        position: { x: 5.3, y: 0.5, w: 4.4, h: 0.8 },
        style: { fontSize: 24, fontBold: true, alignment: 'left', fontColor: '#212121' },
        placeholder: 'Title',
        locked: false,
        visible: true,
        layer: 2,
      },
      {
        id: 'il_content',
        type: 'placeholder',
        name: 'Content',
        position: { x: 5.3, y: 1.5, w: 4.4, h: 3.5 },
        style: { fontSize: 14, alignment: 'left', verticalAlign: 'top', fontColor: '#333333' },
        placeholder: 'Content goes here',
        locked: false,
        visible: true,
        layer: 3,
      },
    ]);

    this.layoutDefinitions.set('quote', [
      {
        id: 'q_mark',
        type: 'text',
        name: 'Quote Mark',
        position: { x: 0.5, y: 0.5, w: 2, h: 2 },
        style: { fontSize: 120, fontColor: '#E0E0E0', alignment: 'left' },
        content: '\u201C',
        locked: true,
        visible: true,
        layer: 1,
      },
      {
        id: 'q_text',
        type: 'placeholder',
        name: 'Quote Text',
        position: { x: 1.5, y: 1.5, w: 7, h: 2 },
        style: { fontSize: 24, fontItalic: true, alignment: 'center', verticalAlign: 'middle', fontColor: '#333333' },
        placeholder: 'Enter your quote here',
        locked: false,
        visible: true,
        layer: 2,
      },
      {
        id: 'q_author',
        type: 'placeholder',
        name: 'Author',
        position: { x: 1.5, y: 3.7, w: 7, h: 0.5 },
        style: { fontSize: 14, alignment: 'center', fontColor: '#666666', fontBold: true },
        placeholder: '- Author Name',
        locked: false,
        visible: true,
        layer: 3,
      },
    ]);
  }

  async createTemplate(
    name: string,
    layout: LayoutPreset,
    category: string,
    createdBy: string,
    customElements?: TemplateElement[],
    masterSlideId?: string,
  ): Promise<SlideTemplate> {
    const id = crypto.randomUUID();
    const layoutElements = this.layoutDefinitions.get(layout) || [];
    const elements = customElements || layoutElements.map(el => ({
      ...el,
      id: crypto.randomUUID(),
    }));

    const template: SlideTemplate = {
      id,
      name,
      description: '',
      category,
      layout,
      masterSlideId,
      elements,
      backgroundColor: '#FFFFFF',
      transitions: { type: 'none', duration: 500 },
      metadata: {},
      version: 1,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.prisma.slideTemplate.create({
      data: {
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        layout: template.layout,
        masterSlideId: template.masterSlideId,
        elements: template.elements as Prisma.InputJsonValue,
        backgroundColor: template.backgroundColor,
        transitions: template.transitions as Prisma.InputJsonValue,
        metadata: template.metadata as Prisma.InputJsonValue,
        version: template.version,
        createdBy: template.createdBy,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      },
    });

    this.templateCache.set(id, template);
    return template;
  }

  async getTemplate(templateId: string): Promise<SlideTemplate> {
    const cached = this.templateCache.get(templateId);
    if (cached) return cached;

    const record = await this.prisma.slideTemplate.findUnique({ where: { id: templateId } });
    if (!record) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const template: SlideTemplate = {
      id: record.id,
      name: record.name,
      description: record.description || '',
      category: record.category,
      layout: record.layout as LayoutPreset,
      masterSlideId: record.masterSlideId || undefined,
      elements: record.elements as unknown as TemplateElement[],
      backgroundColor: record.backgroundColor || '#ffffff',
      transitions: record.transitions as unknown as TransitionConfig,
      metadata: (record.metadata as Record<string, unknown>) || {},
      version: record.version,
      createdBy: record.createdBy,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };

    this.templateCache.set(templateId, template);
    return template;
  }

  async updateTemplate(
    templateId: string,
    updates: Partial<Omit<SlideTemplate, 'id' | 'createdBy' | 'createdAt'>>,
  ): Promise<SlideTemplate> {
    const existing = await this.getTemplate(templateId);
    const updated: SlideTemplate = {
      ...existing,
      ...updates,
      version: existing.version + 1,
      updatedAt: new Date(),
    };

    await this.prisma.slideTemplate.update({
      where: { id: templateId },
      data: {
        name: updated.name,
        description: updated.description,
        category: updated.category,
        layout: updated.layout,
        masterSlideId: updated.masterSlideId,
        elements: updated.elements as Prisma.InputJsonValue,
        backgroundColor: updated.backgroundColor,
        transitions: updated.transitions as Prisma.InputJsonValue,
        metadata: updated.metadata as Prisma.InputJsonValue,
        version: updated.version,
        updatedAt: updated.updatedAt,
      },
    });

    this.templateCache.set(templateId, updated);
    return updated;
  }

  async deleteTemplate(templateId: string): Promise<void> {
    this.templateCache.delete(templateId);
    await this.prisma.slideTemplate.delete({ where: { id: templateId } });
  }

  async listTemplates(
    filter: TemplateFilter,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{ templates: SlideTemplate[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (filter.category) where.category = filter.category;
    if (filter.layout) where.layout = filter.layout;
    if (filter.createdBy) where.createdBy = filter.createdBy;
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    const [records, total] = await Promise.all([
      this.prisma.slideTemplate.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.slideTemplate.count({ where }),
    ]);

    const templates = records.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description || '',
      category: r.category,
      layout: r.layout as LayoutPreset,
      masterSlideId: r.masterSlideId || undefined,
      elements: r.elements as unknown as TemplateElement[],
      backgroundColor: r.backgroundColor || '#ffffff',
      transitions: r.transitions as unknown as TransitionConfig,
      metadata: (r.metadata as Record<string, unknown>) || {},
      version: r.version,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return { templates, total };
  }

  async createMasterSlide(
    name: string,
    colorScheme: ColorScheme,
    fontScheme: FontScheme,
  ): Promise<MasterSlide> {
    const id = crypto.randomUUID();

    const headerElements: TemplateElement[] = [
      {
        id: crypto.randomUUID(),
        type: 'shape',
        name: 'Header Bar',
        position: { x: 0, y: 0, w: 10, h: 0.08 },
        style: { backgroundColor: colorScheme.primary },
        locked: true,
        visible: true,
        layer: 0,
      },
    ];

    const footerElements: TemplateElement[] = [
      {
        id: crypto.randomUUID(),
        type: 'text',
        name: 'Page Number',
        position: { x: 9, y: 5.2, w: 0.8, h: 0.3 },
        style: { fontSize: 9, alignment: 'right', fontColor: colorScheme.lightText },
        content: '{{pageNumber}}',
        locked: true,
        visible: true,
        layer: 0,
      },
      {
        id: crypto.randomUUID(),
        type: 'text',
        name: 'Footer Text',
        position: { x: 0.3, y: 5.2, w: 4, h: 0.3 },
        style: { fontSize: 8, alignment: 'left', fontColor: colorScheme.lightText },
        content: '{{footerText}}',
        locked: true,
        visible: true,
        layer: 0,
      },
    ];

    const masterSlide: MasterSlide = {
      id,
      name,
      backgroundColor: colorScheme.background,
      headerElements,
      footerElements,
      colorScheme,
      fontScheme,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.prisma.masterSlide.create({
      data: {
        id: masterSlide.id,
        name: masterSlide.name,
        backgroundColor: masterSlide.backgroundColor,
        headerStyle: JSON.parse(JSON.stringify(masterSlide.headerElements)),
        footerStyle: JSON.parse(JSON.stringify(masterSlide.footerElements)),
        elements: JSON.parse(JSON.stringify({ colorScheme: masterSlide.colorScheme, fontScheme: masterSlide.fontScheme })),
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: masterSlide.createdAt,
        updatedAt: masterSlide.updatedAt,
      },
    });

    this.masterSlideCache.set(id, masterSlide);
    return masterSlide;
  }

  async cloneTemplate(
    templateId: string,
    newName: string,
    newCategory?: string,
  ): Promise<SlideTemplate> {
    const source = await this.getTemplate(templateId);
    const clonedElements = source.elements.map(el => ({
      ...el,
      id: crypto.randomUUID(),
    }));

    return this.createTemplate(
      newName,
      source.layout,
      newCategory || source.category,
      source.createdBy,
      clonedElements,
      source.masterSlideId,
    );
  }

  async applyMasterSlide(templateId: string, masterSlideId: string): Promise<SlideTemplate> {
    const master = this.masterSlideCache.get(masterSlideId);
    if (!master) {
      const record = await this.prisma.masterSlide.findUnique({ where: { id: masterSlideId } });
      if (!record) throw new Error(`Master slide not found: ${masterSlideId}`);
    }

    return this.updateTemplate(templateId, { masterSlideId });
  }

  async generatePresentation(
    templateIds: string[],
    contentMap: Map<string, Record<string, string>>,
    title: string,
  ): Promise<Buffer> {
    const pptx = new PptxGenJS();
    pptx.title = title;
    pptx.author = 'Rasid Platform';

    for (const templateId of templateIds) {
      const template = await this.getTemplate(templateId);
      const slideContent = contentMap.get(templateId) || {};
      const slide = pptx.addSlide();

      slide.background = { color: template.backgroundColor.replace('#', '') };

      for (const element of template.elements.sort((a, b) => a.layer - b.layer)) {
        if (!element.visible) continue;

        const content = slideContent[element.name] || element.content || element.placeholder || '';

        if (element.type === 'text' || element.type === 'placeholder') {
          slide.addText(content, {
            x: element.position.x,
            y: element.position.y,
            w: element.position.w,
            h: element.position.h,
            fontSize: element.style.fontSize || 14,
            fontFace: element.style.fontFamily || 'Arial',
            color: (element.style.fontColor || '#333333').replace('#', ''),
            bold: element.style.fontBold || false,
            italic: element.style.fontItalic || false,
            align: element.style.alignment || 'left',
            valign: element.style.verticalAlign || 'top',
            rotate: element.style.rotation || 0,
          });
        } else if (element.type === 'shape') {
          slide.addShape(pptx.ShapeType.rect, {
            x: element.position.x,
            y: element.position.y,
            w: element.position.w,
            h: element.position.h,
            fill: { color: (element.style.backgroundColor || '#CCCCCC').replace('#', '') },
          });
        }
      }
    }

    const buffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
    return buffer;
  }

  getAvailableLayouts(): { layout: LayoutPreset; elementCount: number }[] {
    const layouts: { layout: LayoutPreset; elementCount: number }[] = [];
    for (const [layout, elements] of this.layoutDefinitions) {
      layouts.push({ layout, elementCount: elements.length });
    }
    return layouts;
  }
}
