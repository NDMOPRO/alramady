import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

interface ComparisonResult {
  match: boolean;
  diffPercentage: number;
  diffPixels: number;
  totalPixels: number;
  diffImageBuffer?: Buffer;
}

interface RegressionTestResult extends ComparisonResult {
  isNew: boolean;
}

const DEFAULT_THRESHOLD = 0.1;

export class VisualRegressionService {
  constructor(private prisma: PrismaClient) {}

  async compareImages(
    baselineBuffer: Buffer,
    currentBuffer: Buffer,
    threshold?: number
  ): Promise<ComparisonResult> {
    const pixelmatch = (await import('pixelmatch')).default;
    const { PNG } = await import('pngjs');

    const baselinePng = PNG.sync.read(baselineBuffer);
    const currentPng = PNG.sync.read(currentBuffer);

    const width = baselinePng.width;
    const height = baselinePng.height;

    if (currentPng.width !== width || currentPng.height !== height) {
      const totalPixels = Math.max(
        width * height,
        currentPng.width * currentPng.height
      );
      return {
        match: false,
        diffPercentage: 100,
        diffPixels: totalPixels,
        totalPixels,
      };
    }

    const totalPixels = width * height;
    const diffPng = new PNG({ width, height });

    const diffPixels = pixelmatch(
      baselinePng.data,
      currentPng.data,
      diffPng.data,
      width,
      height,
      { threshold: threshold ?? DEFAULT_THRESHOLD }
    );

    const diffPercentage =
      totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0;
    const match = diffPixels === 0;

    const result: ComparisonResult = {
      match,
      diffPercentage: Math.round(diffPercentage * 100) / 100,
      diffPixels,
      totalPixels,
    };

    if (!match) {
      result.diffImageBuffer = PNG.sync.write(diffPng);
    }

    return result;
  }

  async saveBaseline(componentId: string, imageBuffer: Buffer): Promise<void> {
    const hash = createHash('sha256').update(imageBuffer).digest('hex');

    await this.prisma.visualBaseline.upsert({
      where: { componentId },
      create: {
        componentId,
        imageData: imageBuffer,
        hash,
        createdAt: new Date(),
      },
      update: {
        imageData: imageBuffer,
        hash,
        updatedAt: new Date(),
      },
    });
  }

  async getBaseline(componentId: string): Promise<Buffer | null> {
    const record = await this.prisma.visualBaseline.findUnique({
      where: { componentId },
    });

    return record?.imageData ?? null;
  }

  async runRegressionTest(
    componentId: string,
    currentBuffer: Buffer,
    threshold?: number
  ): Promise<RegressionTestResult> {
    const baseline = await this.getBaseline(componentId);

    if (!baseline) {
      await this.saveBaseline(componentId, currentBuffer);
      return {
        match: true,
        diffPercentage: 0,
        diffPixels: 0,
        totalPixels: 0,
        isNew: true,
      };
    }

    const result = await this.compareImages(baseline, currentBuffer, threshold);
    return { ...result, isNew: false };
  }
}
