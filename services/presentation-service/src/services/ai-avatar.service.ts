import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createLogger, format, transports } from 'winston';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const prisma = new PrismaClient();

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { service: 'ai-avatar' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

interface AvatarConfig {
  style: 'professional' | 'casual' | 'corporate' | 'arabic_traditional' | 'custom';
  gender: 'male' | 'female' | 'neutral';
  ageRange: 'young' | 'middle' | 'senior';
  attire?: string;
  backgroundColor?: string;
  pose?: 'standing' | 'sitting' | 'presenting' | 'pointing';
  expression?: 'neutral' | 'smiling' | 'serious' | 'enthusiastic';
  customDescription?: string;
}

interface AvatarResult {
  id: string;
  imageUrl: string;
  imagePath: string;
  thumbnailPath: string;
  config: AvatarConfig;
  generatedAt: string;
  fileSize: number;
}

interface AvatarAnimationFrame {
  frameIndex: number;
  expression: string;
  gesture: string;
  lookDirection: 'center' | 'left' | 'right' | 'audience';
}

export class AIAvatarService {
  private readonly outputDir: string;

  constructor() {
    this.outputDir = process.env.AVATAR_OUTPUT_DIR || '/tmp/rasid/avatars';
  }

  async generateAvatar(config: AvatarConfig, tenantId: string, userId: string): Promise<AvatarResult> {
    const avatarId = randomUUID();
    const outputDir = path.join(this.outputDir, tenantId);
    await fs.mkdir(outputDir, { recursive: true });

    logger.info('Generating AI avatar', { avatarId, style: config.style, tenantId });

    const prompt = this.buildAvatarPrompt(config);

    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'hd',
      style: 'natural',
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) throw new Error('Failed to generate avatar image');

    const imageResponse = await fetch(imageUrl);
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const imagePath = path.join(outputDir, `${avatarId}.png`);
    await fs.writeFile(imagePath, imageBuffer);

    const sharp = (await import('sharp')).default;
    const thumbnailPath = path.join(outputDir, `${avatarId}_thumb.png`);
    await sharp(imageBuffer)
      .resize(256, 256, { fit: 'cover' })
      .png()
      .toFile(thumbnailPath);

    const stat = await fs.stat(imagePath);

    // Audit log - use aiSession as a proxy since auditLog model doesn't exist in this service
    await prisma.aiSession.create({
      data: {
        id: avatarId,
        sessionType: 'avatar_generated',
        status: 'completed',
        userId,
        tenantId,
        input: JSON.stringify({ style: config.style, gender: config.gender }),
        createdAt: new Date(),
      },
    }).catch(() => { /* auditLog not available, skip */ });

    logger.info('Avatar generated', { avatarId, fileSize: stat.size });

    return {
      id: avatarId,
      imageUrl,
      imagePath,
      thumbnailPath,
      config,
      generatedAt: new Date().toISOString(),
      fileSize: stat.size,
    };
  }

  async generateAvatarVariations(
    avatarId: string,
    count: number,
    tenantId: string,
  ): Promise<AvatarResult[]> {
    const sourcePath = path.join(this.outputDir, tenantId, `${avatarId}.png`);
    const sourceBuffer = await fs.readFile(sourcePath);

    const results: AvatarResult[] = [];
    const requestCount = Math.min(count, 4);

    for (let i = 0; i < requestCount; i++) {
      const variationId = randomUUID();
      const response = await openai.images.createVariation({
        image: new File([sourceBuffer], 'avatar.png', { type: 'image/png' }),
        n: 1,
        size: '1024x1024',
      });

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) continue;

      const imgResp = await fetch(imageUrl);
      const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
      const outputPath = path.join(this.outputDir, tenantId, `${variationId}.png`);
      await fs.writeFile(outputPath, imgBuffer);

      const sharp = (await import('sharp')).default;
      const thumbPath = path.join(this.outputDir, tenantId, `${variationId}_thumb.png`);
      await sharp(imgBuffer).resize(256, 256, { fit: 'cover' }).png().toFile(thumbPath);

      const stat = await fs.stat(outputPath);

      results.push({
        id: variationId,
        imageUrl,
        imagePath: outputPath,
        thumbnailPath: thumbPath,
        config: { style: 'custom', gender: 'neutral', ageRange: 'middle' },
        generatedAt: new Date().toISOString(),
        fileSize: stat.size,
      });
    }

    return results;
  }

  async generateAnimationSequence(
    avatarId: string,
    narrationText: string,
    tenantId: string,
  ): Promise<AvatarAnimationFrame[]> {
    const prompt = `You are an animation director. Given this narration text, create a sequence of avatar animation frames.

Narration: "${narrationText}"

For each phrase/sentence, determine:
- expression: neutral, smiling, serious, enthusiastic, concerned, thoughtful
- gesture: none, pointing_right, pointing_left, hands_open, counting, nodding, emphasizing
- lookDirection: center, left, right, audience

Respond in JSON:
{ "frames": [{ "frameIndex": 0, "expression": "smiling", "gesture": "hands_open", "lookDirection": "audience" }] }`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('Empty AI response');

    const parsed: { frames: AvatarAnimationFrame[] } = JSON.parse(content);
    return parsed.frames;
  }

  async addAvatarToSlide(
    presentationId: string,
    slideIndex: number,
    avatarId: string,
    position: { x: number; y: number; width: number; height: number },
    tenantId: string,
  ): Promise<void> {
    const presentation = await prisma.presentation.findUnique({
      where: { id: presentationId },
    });

    if (!presentation) throw new Error(`Presentation ${presentationId} not found`);

    const slidesData = (presentation.slides ?? (presentation as Record<string, unknown>).data) as Array<Record<string, unknown>>;
    if (!slidesData || slideIndex >= slidesData.length) {
      throw new Error(`Slide index ${slideIndex} out of range`);
    }

    const avatarPath = path.join(this.outputDir, tenantId, `${avatarId}.png`);
    try {
      await fs.access(avatarPath);
    } catch {
      throw new Error(`Avatar ${avatarId} not found`);
    }

    const slide = slidesData[slideIndex];
    const elements = (slide.elements as Array<Record<string, unknown>>) || [];
    elements.push({
      type: 'avatar',
      avatarId,
      imagePath: avatarPath,
      position,
      zIndex: elements.length + 1,
    });
    slide.elements = elements;

    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        slides: JSON.parse(JSON.stringify(slidesData)),
        updatedAt: new Date(),
      },
    });

    logger.info('Avatar added to slide', { presentationId, slideIndex, avatarId });
  }

  async listAvatars(tenantId: string): Promise<Array<{ id: string; thumbnailPath: string; createdAt: string }>> {
    const dirPath = path.join(this.outputDir, tenantId);
    const avatars: Array<{ id: string; thumbnailPath: string; createdAt: string }> = [];

    try {
      const entries = await fs.readdir(dirPath);
      const thumbs = entries.filter((e) => e.endsWith('_thumb.png'));

      for (const thumb of thumbs) {
        const id = thumb.replace('_thumb.png', '');
        const stat = await fs.stat(path.join(dirPath, thumb));
        avatars.push({
          id,
          thumbnailPath: path.join(dirPath, thumb),
          createdAt: stat.birthtime.toISOString(),
        });
      }
    } catch { /* directory may not exist yet */ }

    return avatars.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async deleteAvatar(avatarId: string, tenantId: string): Promise<void> {
    const dirPath = path.join(this.outputDir, tenantId);
    const files = [`${avatarId}.png`, `${avatarId}_thumb.png`];
    for (const file of files) {
      try { await fs.unlink(path.join(dirPath, file)); } catch { /* ignore */ }
    }
    logger.info('Avatar deleted', { avatarId, tenantId });
  }

  private buildAvatarPrompt(config: AvatarConfig): string {
    if (config.customDescription) {
      return `Professional portrait photo for a business presentation avatar: ${config.customDescription}. Clean background, high quality, suitable for corporate use.`;
    }

    const genderDesc = config.gender === 'male' ? 'man' : config.gender === 'female' ? 'woman' : 'person';
    const ageDesc = config.ageRange === 'young' ? 'young adult' : config.ageRange === 'senior' ? 'mature' : 'middle-aged';

    let styleDesc: string;
    switch (config.style) {
      case 'professional':
        styleDesc = `wearing professional business attire, in a modern office setting`;
        break;
      case 'corporate':
        styleDesc = `wearing formal corporate suit, neutral studio background`;
        break;
      case 'arabic_traditional':
        styleDesc = `wearing traditional Saudi ${config.gender === 'female' ? 'abaya with hijab' : 'thobe with ghutra'}, professional setting`;
        break;
      case 'casual':
        styleDesc = `in smart casual attire, modern workspace background`;
        break;
      default:
        styleDesc = `professional appearance, clean background`;
    }

    const poseDesc = config.pose === 'presenting' ? 'in a presenting pose with confident stance'
      : config.pose === 'pointing' ? 'pointing to the side as if presenting data'
      : config.pose === 'sitting' ? 'seated in a professional manner'
      : 'standing with professional posture';

    const expressionDesc = config.expression === 'smiling' ? 'warm professional smile'
      : config.expression === 'serious' ? 'serious and focused expression'
      : config.expression === 'enthusiastic' ? 'enthusiastic and energetic expression'
      : 'neutral professional expression';

    const bgColor = config.backgroundColor || 'clean white';

    return `Professional portrait photo of a ${ageDesc} ${genderDesc}, ${styleDesc}, ${poseDesc}, ${expressionDesc}. ${bgColor} background. High quality, suitable for business presentation. Photorealistic, well-lit, sharp focus.`;
  }
}

export const aiAvatarService = new AIAvatarService();
