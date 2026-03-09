import QRCode from 'qrcode';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const QRCodeOptionsSchema = z.object({
  data: z.string().min(1).max(4296),
  width: z.number().int().min(50).max(2000).default(300),
  margin: z.number().int().min(0).max(20).default(4),
  color: z
    .object({
      dark: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      light: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    })
    .default({ dark: '#000000', light: '#ffffff' }),
  errorCorrectionLevel: z.enum(['L', 'M', 'Q', 'H']).default('M'),
});

const AddQRToSlideSchema = QRCodeOptionsSchema.extend({
  x: z.number().min(0),
  y: z.number().min(0),
});

interface QRCodeOptions {
  data: string;
  width?: number;
  margin?: number;
  color?: { dark: string; light: string };
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

interface SlideQRElement {
  id: string;
  presentationId: string;
  slideIndex: number;
  qrDataUrl: string;
  x: number;
  y: number;
  width: number;
  createdAt: Date;
}

export class QRCodeService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  async generateQRCode(options: QRCodeOptions): Promise<Buffer> {
    const validated = QRCodeOptionsSchema.parse(options);

    const buffer = await QRCode.toBuffer(validated.data, {
      width: validated.width,
      margin: validated.margin,
      color: {
        dark: validated.color.dark,
        light: validated.color.light,
      },
      errorCorrectionLevel: validated.errorCorrectionLevel,
      type: 'png',
    });

    return buffer;
  }

  async generateQRCodeDataURL(options: QRCodeOptions): Promise<string> {
    const validated = QRCodeOptionsSchema.parse(options);

    const dataUrl = await QRCode.toDataURL(validated.data, {
      width: validated.width,
      margin: validated.margin,
      color: {
        dark: validated.color.dark,
        light: validated.color.light,
      },
      errorCorrectionLevel: validated.errorCorrectionLevel,
    });

    return dataUrl;
  }

  async addQRToSlide(
    presentationId: string,
    slideIndex: number,
    options: QRCodeOptions & { x: number; y: number }
  ): Promise<SlideQRElement> {
    const validatedPresentationId = z.string().uuid().parse(presentationId);
    const validatedSlideIndex = z.number().int().min(0).parse(slideIndex);
    const validatedOptions = AddQRToSlideSchema.parse(options);

    const presentation = await this.prisma.presentation.findUnique({
      where: { id: validatedPresentationId },
      select: { id: true, slideCount: true },
    });

    if (!presentation) {
      throw new Error(`Presentation not found: ${validatedPresentationId}`);
    }

    if (validatedSlideIndex >= presentation.slideCount) {
      throw new Error(
        `Slide index ${validatedSlideIndex} out of range. Presentation has ${presentation.slideCount} slides.`
      );
    }

    const slide = await this.prisma.slide.findFirst({
      where: {
        presentationId: validatedPresentationId,
        order: validatedSlideIndex,
      },
    });

    if (!slide) {
      throw new Error(
        `Slide not found at index ${validatedSlideIndex} in presentation ${validatedPresentationId}`
      );
    }

    const qrDataUrl = await this.generateQRCodeDataURL({
      data: validatedOptions.data,
      width: validatedOptions.width,
      margin: validatedOptions.margin,
      color: validatedOptions.color,
      errorCorrectionLevel: validatedOptions.errorCorrectionLevel,
    });

    const existingContent = (slide.content as Record<string, unknown>) ?? {};
    const existingElements = Array.isArray(existingContent.elements)
      ? (existingContent.elements as Array<Record<string, unknown>>)
      : [];

    const qrElement = {
      type: 'qrcode',
      data: validatedOptions.data,
      dataUrl: qrDataUrl,
      x: validatedOptions.x,
      y: validatedOptions.y,
      width: validatedOptions.width,
      errorCorrectionLevel: validatedOptions.errorCorrectionLevel,
      color: validatedOptions.color,
    };

    const updatedElements = [...existingElements, qrElement];

    const updatedSlide = await this.prisma.slide.update({
      where: { id: slide.id },
      data: {
        content: JSON.parse(JSON.stringify({
          ...existingContent,
          elements: updatedElements,
        })),
      },
    });

    return {
      id: updatedSlide.id,
      presentationId: validatedPresentationId,
      slideIndex: validatedSlideIndex,
      qrDataUrl,
      x: validatedOptions.x,
      y: validatedOptions.y,
      width: validatedOptions.width,
      createdAt: new Date(),
    };
  }

  async removeQRFromSlide(
    presentationId: string,
    slideIndex: number,
    elementIndex: number
  ): Promise<{ removed: boolean }> {
    const validatedPresentationId = z.string().uuid().parse(presentationId);
    const validatedSlideIndex = z.number().int().min(0).parse(slideIndex);
    const validatedElementIndex = z.number().int().min(0).parse(elementIndex);

    const slide = await this.prisma.slide.findFirst({
      where: {
        presentationId: validatedPresentationId,
        order: validatedSlideIndex,
      },
    });

    if (!slide) {
      throw new Error(
        `Slide not found at index ${validatedSlideIndex} in presentation ${validatedPresentationId}`
      );
    }

    const existingContent = (slide.content as Record<string, unknown>) ?? {};
    const existingElements = Array.isArray(existingContent.elements)
      ? (existingContent.elements as Array<Record<string, unknown>>)
      : [];

    const qrElements = existingElements.filter((el) => el.type === 'qrcode');

    if (validatedElementIndex >= qrElements.length) {
      throw new Error(
        `QR element index ${validatedElementIndex} out of range. Found ${qrElements.length} QR elements.`
      );
    }

    let qrCount = 0;
    const updatedElements = existingElements.filter((el) => {
      if (el.type === 'qrcode') {
        const shouldRemove = qrCount === validatedElementIndex;
        qrCount++;
        return !shouldRemove;
      }
      return true;
    });

    await this.prisma.slide.update({
      where: { id: slide.id },
      data: {
        content: JSON.parse(JSON.stringify({
          ...existingContent,
          elements: updatedElements,
        })),
      },
    });

    return { removed: true };
  }
}
