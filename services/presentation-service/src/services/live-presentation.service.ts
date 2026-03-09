import { PrismaClient } from '@prisma/client';
import { createClient, RedisClientType } from 'redis';
import { z } from 'zod';
import crypto from 'crypto';

const StartSessionInput = z.object({
  presentationId: z.string().uuid(),
  hostUserId: z.string().uuid(),
});

const JoinSessionInput = z.object({
  sessionCode: z.string().length(6),
  viewerName: z.string().min(1).max(100),
  viewerUserId: z.string().uuid().optional(),
});

const NavigateSlideInput = z.object({
  sessionId: z.string().uuid(),
  hostUserId: z.string().uuid(),
  slideIndex: z.number().int().min(0),
});

const TimerInput = z.object({
  sessionId: z.string().uuid(),
  hostUserId: z.string().uuid(),
  durationSeconds: z.number().int().min(1).max(7200).optional(),
});

type StartSessionPayload = z.infer<typeof StartSessionInput>;
type JoinSessionPayload = z.infer<typeof JoinSessionInput>;
type NavigateSlidePayload = z.infer<typeof NavigateSlideInput>;
type TimerPayload = z.infer<typeof TimerInput>;

interface SessionInfo {
  id: string;
  sessionCode: string;
  presentationId: string;
  hostUserId: string;
  currentSlideIndex: number;
  isActive: boolean;
  startedAt: Date;
  viewerCount: number;
}

interface ViewerInfo {
  id: string;
  viewerName: string;
  viewerUserId: string | null;
  joinedAt: Date;
  lastActiveAt: Date;
}

interface TimerStatus {
  isRunning: boolean;
  durationSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  startedAt: string | null;
  pausedAt: string | null;
}

export class LivePresentationService {
  private readonly prisma: PrismaClient;
  private readonly redis: RedisClientType;
  private redisConnected = false;

  constructor(prisma?: PrismaClient, redisUrl?: string) {
    this.prisma = prisma ?? new PrismaClient();
    this.redis = createClient({
      url: redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379',
    });
  }

  private async ensureRedis(): Promise<void> {
    if (!this.redisConnected) {
      await this.redis.connect();
      this.redisConnected = true;
    }
  }

  private generateSessionCode(): string {
    const bytes = crypto.randomBytes(3);
    const num = parseInt(bytes.toString('hex'), 16) % 1000000;
    return num.toString().padStart(6, '0');
  }

  async startLiveSession(input: StartSessionPayload): Promise<SessionInfo> {
    const validated = StartSessionInput.parse(input);

    const presentation = await this.prisma.presentation.findUnique({
      where: { id: validated.presentationId },
    });

    if (!presentation) {
      throw new Error(`Presentation not found: ${validated.presentationId}`);
    }

    const existingActive = await this.prisma.liveSession.findFirst({
      where: {
        presentationId: validated.presentationId,
        isActive: true,
      },
    });

    if (existingActive) {
      throw new Error(
        `An active session already exists for this presentation: ${existingActive.id}`
      );
    }

    let sessionCode: string;
    let codeExists = true;

    do {
      sessionCode = this.generateSessionCode();
      const existing = await this.prisma.liveSession.findFirst({
        where: { sessionCode, isActive: true },
      });
      codeExists = existing !== null;
    } while (codeExists);

    const session = await this.prisma.liveSession.create({
      data: {
        presentationId: validated.presentationId,
        hostUserId: validated.hostUserId,
        sessionCode,
        currentSlideIndex: 0,
        isActive: true,
        startedAt: new Date(),
      },
    });

    return {
      id: session.id,
      sessionCode: session.sessionCode,
      presentationId: session.presentationId,
      hostUserId: session.hostUserId,
      currentSlideIndex: session.currentSlideIndex,
      isActive: session.isActive,
      startedAt: session.startedAt,
      viewerCount: 0,
    };
  }

  async joinSession(input: JoinSessionPayload): Promise<{
    sessionId: string;
    viewerId: string;
    currentSlideIndex: number;
    presentationId: string;
  }> {
    const validated = JoinSessionInput.parse(input);

    const session = await this.prisma.liveSession.findFirst({
      where: {
        sessionCode: validated.sessionCode,
        isActive: true,
      },
    });

    if (!session) {
      throw new Error(`No active session found with code: ${validated.sessionCode}`);
    }

    const viewer = await this.prisma.sessionViewer.create({
      data: {
        sessionId: session.id,
        viewerName: validated.viewerName,
        viewerUserId: validated.viewerUserId ?? null,
        joinedAt: new Date(),
        lastActiveAt: new Date(),
      },
    });

    return {
      sessionId: session.id,
      viewerId: viewer.id,
      currentSlideIndex: session.currentSlideIndex,
      presentationId: session.presentationId,
    };
  }

  async navigateSlide(input: NavigateSlidePayload): Promise<{
    sessionId: string;
    slideIndex: number;
    navigatedAt: Date;
  }> {
    const validated = NavigateSlideInput.parse(input);

    const session = await this.prisma.liveSession.findUnique({
      where: { id: validated.sessionId },
    });

    if (!session) {
      throw new Error(`Session not found: ${validated.sessionId}`);
    }

    if (!session.isActive) {
      throw new Error('Session is no longer active');
    }

    if (session.hostUserId !== validated.hostUserId) {
      throw new Error('Only the host can navigate slides');
    }

    const updated = await this.prisma.liveSession.update({
      where: { id: validated.sessionId },
      data: { currentSlideIndex: validated.slideIndex },
    });

    return {
      sessionId: updated.id,
      slideIndex: updated.currentSlideIndex,
      navigatedAt: new Date(),
    };
  }

  async getSessionViewers(sessionId: string): Promise<ViewerInfo[]> {
    const validatedId = z.string().uuid().parse(sessionId);

    const session = await this.prisma.liveSession.findUnique({
      where: { id: validatedId },
    });

    if (!session) {
      throw new Error(`Session not found: ${validatedId}`);
    }

    const viewers = await this.prisma.sessionViewer.findMany({
      where: { sessionId: validatedId },
      orderBy: { joinedAt: 'asc' },
    });

    return viewers.map((v) => ({
      id: v.id,
      viewerName: v.viewerName,
      viewerUserId: v.viewerUserId,
      joinedAt: v.joinedAt,
      lastActiveAt: v.lastActiveAt,
    }));
  }

  async endSession(sessionId: string, hostUserId: string): Promise<{
    sessionId: string;
    endedAt: Date;
    totalViewers: number;
    durationMinutes: number;
  }> {
    const validatedSessionId = z.string().uuid().parse(sessionId);
    const validatedHostId = z.string().uuid().parse(hostUserId);

    const session = await this.prisma.liveSession.findUnique({
      where: { id: validatedSessionId },
    });

    if (!session) {
      throw new Error(`Session not found: ${validatedSessionId}`);
    }

    if (session.hostUserId !== validatedHostId) {
      throw new Error('Only the host can end the session');
    }

    if (!session.isActive) {
      throw new Error('Session is already ended');
    }

    const endedAt = new Date();

    await this.prisma.liveSession.update({
      where: { id: validatedSessionId },
      data: {
        isActive: false,
        endedAt,
      },
    });

    const viewerCount = await this.prisma.sessionViewer.count({
      where: { sessionId: validatedSessionId },
    });

    const durationMs = endedAt.getTime() - session.startedAt.getTime();
    const durationMinutes = Math.round(durationMs / 60000);

    await this.ensureRedis();
    const timerKey = `session:${validatedSessionId}:timer`;
    await this.redis.del(timerKey);

    return {
      sessionId: validatedSessionId,
      endedAt,
      totalViewers: viewerCount,
      durationMinutes,
    };
  }

  async startTimer(input: TimerPayload): Promise<TimerStatus> {
    const validated = TimerInput.parse(input);

    const session = await this.prisma.liveSession.findUnique({
      where: { id: validated.sessionId },
    });

    if (!session || !session.isActive) {
      throw new Error('Active session not found');
    }

    if (session.hostUserId !== validated.hostUserId) {
      throw new Error('Only the host can control the timer');
    }

    await this.ensureRedis();

    const timerKey = `session:${validated.sessionId}:timer`;
    const now = new Date().toISOString();
    const duration = validated.durationSeconds ?? 300;

    const timerData = {
      isRunning: 'true',
      durationSeconds: duration.toString(),
      elapsedBeforePause: '0',
      startedAt: now,
      pausedAt: '',
    };

    await this.redis.hSet(timerKey, timerData);
    await this.redis.expire(timerKey, duration + 3600);

    return {
      isRunning: true,
      durationSeconds: duration,
      elapsedSeconds: 0,
      remainingSeconds: duration,
      startedAt: now,
      pausedAt: null,
    };
  }

  async pauseTimer(input: Omit<TimerPayload, 'durationSeconds'>): Promise<TimerStatus> {
    const validated = z
      .object({
        sessionId: z.string().uuid(),
        hostUserId: z.string().uuid(),
      })
      .parse(input);

    const session = await this.prisma.liveSession.findUnique({
      where: { id: validated.sessionId },
    });

    if (!session || !session.isActive) {
      throw new Error('Active session not found');
    }

    if (session.hostUserId !== validated.hostUserId) {
      throw new Error('Only the host can control the timer');
    }

    await this.ensureRedis();

    const timerKey = `session:${validated.sessionId}:timer`;
    const timerData = await this.redis.hGetAll(timerKey);

    if (!timerData.startedAt) {
      throw new Error('No timer is currently running for this session');
    }

    if (timerData.isRunning !== 'true') {
      throw new Error('Timer is already paused');
    }

    const now = new Date();
    const startedAt = new Date(timerData.startedAt);
    const elapsedBeforePause = parseInt(timerData.elapsedBeforePause || '0', 10);
    const currentElapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000) + elapsedBeforePause;
    const duration = parseInt(timerData.durationSeconds, 10);

    await this.redis.hSet(timerKey, {
      isRunning: 'false',
      elapsedBeforePause: currentElapsed.toString(),
      pausedAt: now.toISOString(),
    });

    return {
      isRunning: false,
      durationSeconds: duration,
      elapsedSeconds: currentElapsed,
      remainingSeconds: Math.max(0, duration - currentElapsed),
      startedAt: timerData.startedAt,
      pausedAt: now.toISOString(),
    };
  }

  async getTimerStatus(sessionId: string): Promise<TimerStatus> {
    const validatedId = z.string().uuid().parse(sessionId);

    await this.ensureRedis();

    const timerKey = `session:${validatedId}:timer`;
    const timerData = await this.redis.hGetAll(timerKey);

    if (!timerData.startedAt) {
      return {
        isRunning: false,
        durationSeconds: 0,
        elapsedSeconds: 0,
        remainingSeconds: 0,
        startedAt: null,
        pausedAt: null,
      };
    }

    const isRunning = timerData.isRunning === 'true';
    const duration = parseInt(timerData.durationSeconds, 10);
    const elapsedBeforePause = parseInt(timerData.elapsedBeforePause || '0', 10);

    let elapsedSeconds: number;

    if (isRunning) {
      const startedAt = new Date(timerData.startedAt);
      const now = new Date();
      elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000) + elapsedBeforePause;
    } else {
      elapsedSeconds = elapsedBeforePause;
    }

    elapsedSeconds = Math.min(elapsedSeconds, duration);

    return {
      isRunning,
      durationSeconds: duration,
      elapsedSeconds,
      remainingSeconds: Math.max(0, duration - elapsedSeconds),
      startedAt: timerData.startedAt,
      pausedAt: timerData.pausedAt || null,
    };
  }

  async disconnect(): Promise<void> {
    if (this.redisConnected) {
      await this.redis.disconnect();
      this.redisConnected = false;
    }
  }
}
