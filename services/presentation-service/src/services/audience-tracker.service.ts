import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const TrackSlideViewInput = z.object({
  sessionId: z.string().uuid(),
  viewerId: z.string().uuid(),
  slideIndex: z.number().int().min(0),
  presentationId: z.string().uuid(),
  durationMs: z.number().int().min(0).optional(),
});

const SlideAnalyticsInput = z.object({
  presentationId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
});

const ViewerJourneyInput = z.object({
  sessionId: z.string().uuid(),
  viewerId: z.string().uuid(),
});

type TrackSlideViewPayload = z.infer<typeof TrackSlideViewInput>;
type SlideAnalyticsPayload = z.infer<typeof SlideAnalyticsInput>;
type ViewerJourneyPayload = z.infer<typeof ViewerJourneyInput>;

interface SlideViewRecord {
  id: string;
  sessionId: string;
  viewerId: string;
  slideIndex: number;
  viewedAt: Date;
  durationMs: number | null;
}

interface SlideAnalyticsResult {
  slideIndex: number;
  totalViews: number;
  uniqueViewers: number;
  averageDurationMs: number | null;
  minDurationMs: number | null;
  maxDurationMs: number | null;
  dropOffCount: number;
}

interface ViewerJourneyStep {
  slideIndex: number;
  viewedAt: Date;
  durationMs: number | null;
  isReturn: boolean;
}

interface ViewerJourneyResult {
  viewerId: string;
  sessionId: string;
  totalSlidesViewed: number;
  uniqueSlidesViewed: number;
  totalTimeMs: number;
  steps: ViewerJourneyStep[];
  completionRate: number;
}

export class AudienceTrackerService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  async trackSlideView(input: TrackSlideViewPayload): Promise<SlideViewRecord> {
    const validated = TrackSlideViewInput.parse(input);

    const session = await this.prisma.liveSession.findUnique({
      where: { id: validated.sessionId },
    });

    if (!session) {
      throw new Error(`Session not found: ${validated.sessionId}`);
    }

    const viewer = await this.prisma.sessionViewer.findUnique({
      where: { id: validated.viewerId },
    });

    if (!viewer || viewer.sessionId !== validated.sessionId) {
      throw new Error(`Viewer ${validated.viewerId} not found in session ${validated.sessionId}`);
    }

    const slideView = await this.prisma.slideView.create({
      data: {
        sessionId: validated.sessionId,
        viewerId: validated.viewerId,
        slideIndex: validated.slideIndex,
        presentationId: validated.presentationId,
        viewedAt: new Date(),
        durationMs: validated.durationMs ?? null,
      },
    });

    await this.prisma.sessionViewer.update({
      where: { id: validated.viewerId },
      data: { lastActiveAt: new Date() },
    });

    return {
      id: slideView.id,
      sessionId: slideView.sessionId,
      viewerId: slideView.viewerId,
      slideIndex: slideView.slideIndex,
      viewedAt: slideView.viewedAt,
      durationMs: slideView.durationMs,
    };
  }

  async updateViewDuration(slideViewId: string, durationMs: number): Promise<SlideViewRecord> {
    const validatedId = z.string().uuid().parse(slideViewId);
    const validatedDuration = z.number().int().min(0).parse(durationMs);

    const updated = await this.prisma.slideView.update({
      where: { id: validatedId },
      data: { durationMs: validatedDuration },
    });

    return {
      id: updated.id,
      sessionId: updated.sessionId,
      viewerId: updated.viewerId,
      slideIndex: updated.slideIndex,
      viewedAt: updated.viewedAt,
      durationMs: updated.durationMs,
    };
  }

  async getSlideAnalytics(input: SlideAnalyticsPayload): Promise<SlideAnalyticsResult[]> {
    const validated = SlideAnalyticsInput.parse(input);

    const whereClause: Record<string, string> = {
      presentationId: validated.presentationId,
    };

    if (validated.sessionId) {
      whereClause.sessionId = validated.sessionId;
    }

    const slideViews = await this.prisma.slideView.findMany({
      where: whereClause,
      orderBy: { slideIndex: 'asc' },
    });

    if (slideViews.length === 0) {
      return [];
    }

    const grouped = new Map<
      number,
      Array<{ viewerId: string; durationMs: number | null }>
    >();

    for (const view of slideViews) {
      const existing = grouped.get(view.slideIndex) ?? [];
      existing.push({ viewerId: view.viewerId, durationMs: view.durationMs });
      grouped.set(view.slideIndex, existing);
    }

    const maxSlide = Math.max(...grouped.keys());

    const allViewerIds = new Set(slideViews.map((v) => v.viewerId));
    const totalViewers = allViewerIds.size;

    const results: SlideAnalyticsResult[] = [];

    for (let i = 0; i <= maxSlide; i++) {
      const views = grouped.get(i) ?? [];
      const uniqueViewerIds = new Set(views.map((v) => v.viewerId));
      const durations = views
        .map((v) => v.durationMs)
        .filter((d): d is number => d !== null);

      const nextSlideViews = grouped.get(i + 1) ?? [];
      const nextSlideViewerIds = new Set(nextSlideViews.map((v) => v.viewerId));
      const dropOffCount = [...uniqueViewerIds].filter(
        (vid) => !nextSlideViewerIds.has(vid)
      ).length;

      results.push({
        slideIndex: i,
        totalViews: views.length,
        uniqueViewers: uniqueViewerIds.size,
        averageDurationMs:
          durations.length > 0
            ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
            : null,
        minDurationMs: durations.length > 0 ? Math.min(...durations) : null,
        maxDurationMs: durations.length > 0 ? Math.max(...durations) : null,
        dropOffCount: i < maxSlide ? dropOffCount : 0,
      });
    }

    return results;
  }

  async getViewerJourney(input: ViewerJourneyPayload): Promise<ViewerJourneyResult> {
    const validated = ViewerJourneyInput.parse(input);

    const viewer = await this.prisma.sessionViewer.findUnique({
      where: { id: validated.viewerId },
    });

    if (!viewer || viewer.sessionId !== validated.sessionId) {
      throw new Error(
        `Viewer ${validated.viewerId} not found in session ${validated.sessionId}`
      );
    }

    const views = await this.prisma.slideView.findMany({
      where: {
        sessionId: validated.sessionId,
        viewerId: validated.viewerId,
      },
      orderBy: { viewedAt: 'asc' },
    });

    if (views.length === 0) {
      return {
        viewerId: validated.viewerId,
        sessionId: validated.sessionId,
        totalSlidesViewed: 0,
        uniqueSlidesViewed: 0,
        totalTimeMs: 0,
        steps: [],
        completionRate: 0,
      };
    }

    const session = await this.prisma.liveSession.findUnique({
      where: { id: validated.sessionId },
      include: {
        presentation: {
          select: { slideCount: true },
        },
      },
    });

    const totalSlides = session?.presentation?.slideCount ?? 0;
    const seenSlides = new Set<number>();
    const steps: ViewerJourneyStep[] = [];

    for (const view of views) {
      const isReturn = seenSlides.has(view.slideIndex);
      seenSlides.add(view.slideIndex);

      steps.push({
        slideIndex: view.slideIndex,
        viewedAt: view.viewedAt,
        durationMs: view.durationMs,
        isReturn,
      });
    }

    const totalTimeMs = views
      .map((v) => v.durationMs ?? 0)
      .reduce((a, b) => a + b, 0);

    const completionRate =
      totalSlides > 0 ? Math.round((seenSlides.size / totalSlides) * 100) / 100 : 0;

    return {
      viewerId: validated.viewerId,
      sessionId: validated.sessionId,
      totalSlidesViewed: views.length,
      uniqueSlidesViewed: seenSlides.size,
      totalTimeMs,
      steps,
      completionRate,
    };
  }

  async getSessionSummary(sessionId: string): Promise<{
    sessionId: string;
    totalViewers: number;
    totalSlideViews: number;
    averageCompletionRate: number;
    slideAnalytics: SlideAnalyticsResult[];
  }> {
    const validatedId = z.string().uuid().parse(sessionId);

    const session = await this.prisma.liveSession.findUnique({
      where: { id: validatedId },
      include: {
        presentation: { select: { id: true, slideCount: true } },
      },
    });

    if (!session) {
      throw new Error(`Session not found: ${validatedId}`);
    }

    const viewers = await this.prisma.sessionViewer.findMany({
      where: { sessionId: validatedId },
    });

    const slideAnalytics = await this.getSlideAnalytics({
      presentationId: session.presentationId,
      sessionId: validatedId,
    });

    const totalSlideViews = slideAnalytics.reduce((sum, s) => sum + s.totalViews, 0);

    let completionSum = 0;
    for (const viewer of viewers) {
      const journey = await this.getViewerJourney({
        sessionId: validatedId,
        viewerId: viewer.id,
      });
      completionSum += journey.completionRate;
    }

    const averageCompletionRate =
      viewers.length > 0
        ? Math.round((completionSum / viewers.length) * 100) / 100
        : 0;

    return {
      sessionId: validatedId,
      totalViewers: viewers.length,
      totalSlideViews,
      averageCompletionRate,
      slideAnalytics,
    };
  }
}
