/**
 * TV Mode / Kiosk Mode Service — Rasid Platform
 * وضع العرض على الشاشات الكبيرة
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

interface TVModeConfig {
  refreshInterval: number;
  autoRotate: boolean;
  rotationInterval: number;
  dashboardIds?: string[];
}

interface TVSession {
  id: string;
  shareToken: string;
  dashboardId: string;
  config: TVModeConfig;
  shareUrl: string;
  createdAt: Date;
}

interface TVDashboard {
  dashboardId: string;
  name: string;
  widgets: Record<string, unknown>[];
  config: TVModeConfig;
}

export class TVModeService {
  constructor(private prisma: PrismaClient) {}

  async enableTVMode(dashboardId: string, config: TVModeConfig): Promise<TVSession> {
    const shareToken = randomBytes(32).toString('hex');
    const session = await this.prisma.tvSession.create({
      data: {
        dashboardId,
        shareToken,
        config: JSON.stringify(config),
        status: 'active',
        createdAt: new Date(),
      },
    });

    return {
      id: session.id,
      shareToken,
      dashboardId,
      config,
      shareUrl: `/tv/${shareToken}`,
      createdAt: session.createdAt,
    };
  }

  async getTVDashboard(shareToken: string): Promise<TVDashboard> {
    const session = await this.prisma.tvSession.findFirst({
      where: { shareToken, status: 'active' },
    });
    if (!session) throw new Error('TV session not found or expired');

    const dashboard = await this.prisma.dashboard.findUnique({
      where: { id: session.dashboardId },
      include: { widgets: true },
    });
    if (!dashboard) throw new Error('Dashboard not found');

    const config: TVModeConfig = typeof session.config === 'string' ? JSON.parse(session.config) : session.config as TVModeConfig;

    return {
      dashboardId: dashboard.id,
      name: dashboard.name,
      widgets: dashboard.widgets.map((w: Record<string, unknown>) => ({
        id: w.id,
        type: w.type,
        title: w.title,
        config: w.config,
        data: w.data,
        position: w.position,
      })),
      config,
    };
  }

  async updateTVConfig(sessionId: string, config: Partial<TVModeConfig>): Promise<void> {
    const session = await this.prisma.tvSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error('TV session not found');

    const currentConfig: TVModeConfig = typeof session.config === 'string' ? JSON.parse(session.config) : session.config as TVModeConfig;
    const updatedConfig = { ...currentConfig, ...config };

    await this.prisma.tvSession.update({
      where: { id: sessionId },
      data: { config: JSON.stringify(updatedConfig), updatedAt: new Date() },
    });
  }
}
