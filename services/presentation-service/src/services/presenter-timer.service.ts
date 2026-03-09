/**
 * Presenter Timer Service — Rasid Platform
 * مؤقت العرض التقديمي مع إدارة الوقت لكل شريحة
 */

import { PrismaClient } from '@prisma/client';

interface TimerConfig {
  totalDurationMinutes: number;
  perSlideDurations?: Record<number, number>;
  warningThresholdPercent: number;
  autoAdvance: boolean;
}

interface TimerState {
  sessionId: string;
  presentationId: string;
  currentSlide: number;
  totalSlides: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  slideElapsedSeconds: number;
  slideRemainingSeconds: number;
  status: 'not_started' | 'running' | 'paused' | 'overtime' | 'finished';
  warningActive: boolean;
  overtimeSeconds: number;
  paceIndicator: 'ahead' | 'on_track' | 'behind';
}

interface SlideTimingRecord {
  slideIndex: number;
  allocatedSeconds: number;
  actualSeconds: number;
  startedAt: Date;
  finishedAt?: Date;
}

export class PresenterTimerService {
  constructor(private prisma: PrismaClient) {}

  async createTimerSession(
    presentationId: string,
    totalSlides: number,
    config: TimerConfig
  ): Promise<TimerState> {
    const totalSeconds = config.totalDurationMinutes * 60;
    const defaultPerSlide = Math.floor(totalSeconds / totalSlides);

    const slideAllocations: Record<number, number> = {};
    for (let i = 0; i < totalSlides; i++) {
      slideAllocations[i] = config.perSlideDurations?.[i] ?? defaultPerSlide;
    }

    const session = await this.prisma.timerSession.create({
      data: {
        presentationId,
        totalSlides,
        totalDurationSeconds: totalSeconds,
        slideAllocations: JSON.stringify(slideAllocations),
        warningThreshold: config.warningThresholdPercent,
        autoAdvance: config.autoAdvance,
        status: 'not_started',
        currentSlide: 0,
        elapsedSeconds: 0,
        slideElapsedSeconds: 0,
        createdAt: new Date(),
      },
    });

    return {
      sessionId: session.id,
      presentationId,
      currentSlide: 0,
      totalSlides,
      elapsedSeconds: 0,
      remainingSeconds: totalSeconds,
      slideElapsedSeconds: 0,
      slideRemainingSeconds: slideAllocations[0],
      status: 'not_started',
      warningActive: false,
      overtimeSeconds: 0,
      paceIndicator: 'on_track',
    };
  }

  async startTimer(sessionId: string): Promise<TimerState> {
    await this.prisma.timerSession.update({
      where: { id: sessionId },
      data: { status: 'running', startedAt: new Date() },
    });
    return this.getTimerState(sessionId);
  }

  async pauseTimer(sessionId: string): Promise<TimerState> {
    const session = await this.prisma.timerSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    await this.prisma.timerSession.update({
      where: { id: sessionId },
      data: { status: 'paused', pausedAt: new Date() },
    });

    return this.getTimerState(sessionId);
  }

  async resumeTimer(sessionId: string): Promise<TimerState> {
    await this.prisma.timerSession.update({
      where: { id: sessionId },
      data: { status: 'running', pausedAt: null },
    });
    return this.getTimerState(sessionId);
  }

  async advanceSlide(sessionId: string): Promise<TimerState> {
    const session = await this.prisma.timerSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    const nextSlide = session.currentSlide + 1;
    if (nextSlide >= session.totalSlides) {
      await this.prisma.timerSession.update({
        where: { id: sessionId },
        data: { status: 'finished', finishedAt: new Date() },
      });
    } else {
      await this.prisma.timerSession.update({
        where: { id: sessionId },
        data: {
          currentSlide: nextSlide,
          slideElapsedSeconds: 0,
          slideStartedAt: new Date(),
        },
      });
    }

    const sessionAllocations = JSON.parse(session.slideAllocations as string) as Record<string, number>;
    await this.prisma.slideTimingLog.create({
      data: {
        timerSessionId: sessionId,
        slideIndex: session.currentSlide,
        allocatedSeconds: sessionAllocations[session.currentSlide] ?? 60,
        actualSeconds: session.slideElapsedSeconds,
        startedAt: new Date(),
      },
    });

    return this.getTimerState(sessionId);
  }

  async previousSlide(sessionId: string): Promise<TimerState> {
    const session = await this.prisma.timerSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    if (session.currentSlide > 0) {
      await this.prisma.timerSession.update({
        where: { id: sessionId },
        data: {
          currentSlide: session.currentSlide - 1,
          slideElapsedSeconds: 0,
          slideStartedAt: new Date(),
        },
      });
    }

    return this.getTimerState(sessionId);
  }

  async updateElapsedTime(sessionId: string, elapsedSeconds: number, slideElapsedSeconds: number): Promise<TimerState> {
    await this.prisma.timerSession.update({
      where: { id: sessionId },
      data: { elapsedSeconds, slideElapsedSeconds },
    });
    return this.getTimerState(sessionId);
  }

  async getTimerState(sessionId: string): Promise<TimerState> {
    const session = await this.prisma.timerSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    const allocations = JSON.parse(session.slideAllocations as string) as Record<string, number>;
    const slideAllocation = allocations[session.currentSlide] ?? 60;
    const remainingSeconds = Math.max(0, session.totalDurationSeconds - session.elapsedSeconds);
    const slideRemainingSeconds = Math.max(0, slideAllocation - session.slideElapsedSeconds);
    const overtimeSeconds = Math.max(0, session.elapsedSeconds - session.totalDurationSeconds);

    const warningThresholdSeconds = session.totalDurationSeconds * (session.warningThreshold / 100);
    const warningActive = remainingSeconds <= warningThresholdSeconds && remainingSeconds > 0;

    const expectedProgress = session.elapsedSeconds / session.totalDurationSeconds;
    const actualProgress = session.currentSlide / session.totalSlides;
    let paceIndicator: 'ahead' | 'on_track' | 'behind' = 'on_track';
    if (actualProgress > expectedProgress + 0.1) paceIndicator = 'ahead';
    else if (actualProgress < expectedProgress - 0.1) paceIndicator = 'behind';

    let status = session.status as TimerState['status'];
    if (overtimeSeconds > 0 && status === 'running') status = 'overtime';

    return {
      sessionId,
      presentationId: session.presentationId,
      currentSlide: session.currentSlide,
      totalSlides: session.totalSlides,
      elapsedSeconds: session.elapsedSeconds,
      remainingSeconds,
      slideElapsedSeconds: session.slideElapsedSeconds,
      slideRemainingSeconds,
      status,
      warningActive,
      overtimeSeconds,
      paceIndicator,
    };
  }

  async getSlideTimings(sessionId: string): Promise<SlideTimingRecord[]> {
    const session = await this.prisma.timerSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    const allocations = JSON.parse(session.slideAllocations as string) as Record<string, number>;
    const logs = await this.prisma.slideTimingLog.findMany({
      where: { timerSessionId: sessionId },
      orderBy: { slideIndex: 'asc' },
    });

    return logs.map(log => ({
      slideIndex: log.slideIndex,
      allocatedSeconds: allocations[log.slideIndex] ?? 60,
      actualSeconds: log.actualSeconds,
      startedAt: log.startedAt,
      finishedAt: log.finishedAt ?? undefined,
    }));
  }

  async endSession(sessionId: string): Promise<{ totalTime: number; slideTimings: SlideTimingRecord[] }> {
    await this.prisma.timerSession.update({
      where: { id: sessionId },
      data: { status: 'finished', finishedAt: new Date() },
    });

    const session = await this.prisma.timerSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    const timings = await this.getSlideTimings(sessionId);

    return {
      totalTime: session.elapsedSeconds,
      slideTimings: timings,
    };
  }
}
