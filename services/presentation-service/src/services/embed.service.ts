import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { z } from 'zod';

const GenerateEmbedInput = z.object({
  presentationId: z.string().uuid(),
  createdBy: z.string().uuid(),
  expiresInHours: z.number().int().min(1).max(8760).optional(),
  allowedDomains: z.array(z.string().min(1).max(253)).optional(),
  maxViews: z.number().int().min(1).optional(),
  showControls: z.boolean().default(true),
  autoPlay: z.boolean().default(false),
  startSlide: z.number().int().min(0).default(0),
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
});

const GetEmbedInput = z.object({
  token: z.string().min(32).max(128),
  refererDomain: z.string().optional(),
});

type GenerateEmbedPayload = z.infer<typeof GenerateEmbedInput>;
type GetEmbedPayload = z.infer<typeof GetEmbedInput>;

interface EmbedCodeResult {
  token: string;
  embedCode: string;
  directUrl: string;
  expiresAt: Date | null;
  createdAt: Date;
}

interface EmbedPresentationResult {
  presentationId: string;
  title: string;
  slideCount: number;
  showControls: boolean;
  autoPlay: boolean;
  startSlide: number;
  theme: string;
}

export class EmbedService {
  private readonly prisma: PrismaClient;
  private readonly baseUrl: string;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
    this.baseUrl = process.env.RASID_BASE_URL ?? 'https://app.rasid.sa';
  }

  async generateEmbedCode(input: GenerateEmbedPayload): Promise<EmbedCodeResult> {
    const validated = GenerateEmbedInput.parse(input);

    const presentation = await this.prisma.presentation.findUnique({
      where: { id: validated.presentationId },
      select: { id: true, name: true, title: true, slideCount: true },
    });

    if (!presentation) {
      throw new Error(`Presentation not found: ${validated.presentationId}`);
    }

    const token = crypto.randomBytes(48).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const expiresAt = validated.expiresInHours
      ? new Date(Date.now() + validated.expiresInHours * 3600_000)
      : null;

    await this.prisma.embedToken.create({
      data: {
        token: tokenHash,
        presentationId: validated.presentationId,
        createdBy: validated.createdBy,
        expiresAt,
        allowedDomains: validated.allowedDomains ?? [],
        maxViews: validated.maxViews ?? null,
        currentViews: 0,
        showControls: validated.showControls,
        autoPlay: validated.autoPlay,
        startSlide: validated.startSlide,
        theme: validated.theme,
        isRevoked: false,
      },
    });

    const embedUrl = `${this.baseUrl}/embed/${token}`;

    const iframeAttributes = [
      `src="${embedUrl}"`,
      'width="100%"',
      'height="600"',
      'frameborder="0"',
      'allowfullscreen',
      `title="${this.escapeHtml(presentation.title || presentation.name)}"`,
      'loading="lazy"',
      'allow="fullscreen"',
      'style="border: none; border-radius: 8px;"',
    ];

    const embedCode = `<iframe ${iframeAttributes.join(' ')}></iframe>`;

    return {
      token,
      embedCode,
      directUrl: embedUrl,
      expiresAt,
      createdAt: new Date(),
    };
  }

  async getEmbedPresentation(input: GetEmbedPayload): Promise<EmbedPresentationResult> {
    const validated = GetEmbedInput.parse(input);

    const tokenHash = crypto
      .createHash('sha256')
      .update(validated.token)
      .digest('hex');

    const embedToken = await this.prisma.embedToken.findUnique({
      where: { token: tokenHash },
    });

    if (!embedToken) {
      throw new Error('Invalid or expired embed token');
    }

    if (embedToken.isRevoked) {
      throw new Error('This embed link has been revoked');
    }

    if (embedToken.expiresAt && embedToken.expiresAt < new Date()) {
      throw new Error('This embed link has expired');
    }

    if (
      embedToken.maxViews !== null &&
      embedToken.currentViews >= embedToken.maxViews
    ) {
      throw new Error('This embed link has reached its maximum view count');
    }

    if (
      validated.refererDomain &&
      embedToken.allowedDomains.length > 0
    ) {
      const isAllowed = embedToken.allowedDomains.some(
        (domain: string) =>
          validated.refererDomain === domain ||
          validated.refererDomain?.endsWith(`.${domain}`)
      );

      if (!isAllowed) {
        throw new Error(
          `Domain "${validated.refererDomain}" is not allowed to embed this presentation`
        );
      }
    }

    const presentation = await this.prisma.presentation.findUnique({
      where: { id: embedToken.presentationId },
      select: { id: true, name: true, title: true, slideCount: true },
    });

    if (!presentation) {
      throw new Error('Presentation not found for this embed token');
    }

    await this.prisma.embedToken.update({
      where: { token: tokenHash },
      data: { currentViews: { increment: 1 } },
    });

    return {
      presentationId: presentation.id,
      title: presentation.title || presentation.name,
      slideCount: presentation.slideCount,
      showControls: embedToken.showControls,
      autoPlay: embedToken.autoPlay,
      startSlide: embedToken.startSlide,
      theme: embedToken.theme,
    };
  }

  async revokeEmbedToken(token: string, revokedBy: string): Promise<{ revoked: boolean }> {
    const validatedToken = z.string().min(32).max(128).parse(token);
    const validatedUser = z.string().uuid().parse(revokedBy);

    const tokenHash = crypto
      .createHash('sha256')
      .update(validatedToken)
      .digest('hex');

    const embedToken = await this.prisma.embedToken.findUnique({
      where: { token: tokenHash },
    });

    if (!embedToken) {
      throw new Error('Embed token not found');
    }

    if (embedToken.createdBy !== validatedUser) {
      const user = await this.prisma.user.findUnique({
        where: { id: validatedUser },
        select: { role: true },
      });

      if (!user || user.role !== 'ADMIN') {
        throw new Error('Only the token creator or an admin can revoke embed tokens');
      }
    }

    await this.prisma.embedToken.update({
      where: { token: tokenHash },
      data: { isRevoked: true },
    });

    return { revoked: true };
  }

  async listEmbedTokens(presentationId: string): Promise<
    Array<{
      tokenPrefix: string;
      createdBy: string;
      createdAt: Date;
      expiresAt: Date | null;
      currentViews: number;
      maxViews: number | null;
      isRevoked: boolean;
      isExpired: boolean;
    }>
  > {
    const validatedId = z.string().uuid().parse(presentationId);

    const tokens = await this.prisma.embedToken.findMany({
      where: { presentationId: validatedId },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();

    return tokens.map((t) => ({
      tokenPrefix: t.token.slice(0, 12) + '...',
      createdBy: t.createdBy,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
      currentViews: t.currentViews,
      maxViews: t.maxViews,
      isRevoked: t.isRevoked,
      isExpired: t.expiresAt !== null && t.expiresAt < now,
    }));
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }
}
