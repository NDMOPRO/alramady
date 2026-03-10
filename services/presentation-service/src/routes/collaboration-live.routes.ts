import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import crypto from 'crypto';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

function generateSessionCode(): string {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const shareSchema = z.object({
  users: z.array(z.object({
    userId: z.string().uuid(),
    role: z.enum(['viewer', 'editor', 'commenter', 'admin']),
    permissions: z.object({
      canEdit: z.boolean().optional(),
      canComment: z.boolean().optional(),
      canShare: z.boolean().optional(),
      canExport: z.boolean().optional(),
      canDelete: z.boolean().optional(),
    }).optional(),
  })).min(1),
  message: z.string().max(1000).optional(),
  notifyByEmail: z.boolean().optional(),
});

const updateCollaboratorSchema = z.object({
  role: z.enum(['viewer', 'editor', 'commenter', 'admin']),
  permissions: z.object({
    canEdit: z.boolean().optional(),
    canComment: z.boolean().optional(),
    canShare: z.boolean().optional(),
    canExport: z.boolean().optional(),
    canDelete: z.boolean().optional(),
  }).optional(),
});

const commentSchema = z.object({
  slideIndex: z.number().int().min(0),
  content: z.string().min(1).max(5000),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  parentCommentId: z.string().uuid().optional(),
  mentions: z.array(z.string().uuid()).optional(),
});

const protectSchema = z.object({
  password: z.string().min(4).max(128),
  allowPrinting: z.boolean().optional(),
  allowCopying: z.boolean().optional(),
  allowEditing: z.boolean().optional(),
  expiresAt: z.string().datetime().optional(),
});

const verifyPasswordSchema = z.object({
  password: z.string().min(1),
});

const recordSchema = z.object({
  type: z.enum(['audio', 'screen', 'both']),
  quality: z.enum(['low', 'medium', 'high']).optional(),
  format: z.enum(['webm', 'mp4', 'ogg']).optional(),
});

const liveNavigateSchema = z.object({
  slideIndex: z.number().int().min(0),
  animation: z.string().optional(),
});

const presenterModeSchema = z.object({
  showNotes: z.boolean().optional(),
  showTimer: z.boolean().optional(),
  showNextSlide: z.boolean().optional(),
  laserPointer: z.boolean().optional(),
});

const remoteControlSchema = z.object({
  action: z.enum(['next', 'previous', 'goto', 'laser-on', 'laser-off', 'highlight', 'blank-screen', 'end']),
  slideIndex: z.number().int().min(0).optional(),
  laserPosition: z.object({ x: z.number(), y: z.number() }).optional(),
  highlightArea: z.object({
    x: z.number(), y: z.number(), width: z.number(), height: z.number(),
  }).optional(),
});

const workspaceSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  presentationIds: z.array(z.string().uuid()).optional(),
  members: z.array(z.object({
    userId: z.string().uuid(),
    role: z.enum(['owner', 'admin', 'member', 'viewer']),
  })).optional(),
  settings: z.object({
    defaultPermissions: z.string().optional(),
    allowExternalSharing: z.boolean().optional(),
    autoSave: z.boolean().optional(),
  }).optional(),
});

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  presentationIds: z.array(z.string().uuid()).optional(),
  members: z.array(z.object({
    userId: z.string().uuid(),
    role: z.enum(['owner', 'admin', 'member', 'viewer']),
  })).optional(),
  settings: z.record(z.unknown()).optional(),
});

// ─── Helper: verify presentation ownership/access ───────────────────────────

async function verifyPresentationAccess(presentationId: string, userId: string): Promise<{ presentation: Record<string, unknown> | null; hasAccess: boolean }> {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presentationId },
  });
  if (!presentation) {
    return { presentation: null, hasAccess: false };
  }
  if (presentation.userId === userId) {
    return { presentation: presentation as unknown as Record<string, unknown>, hasAccess: true };
  }
  const collab = await prisma.presentationCollaboration.findUnique({
    where: { presentationId_userId: { presentationId, userId } },
  });
  return { presentation: presentation as unknown as Record<string, unknown>, hasAccess: !!collab };
}

// ─── Share endpoints ────────────────────────────────────────────────────────

router.post(
  '/share/:presentationId',
  authMiddleware,
  validate(shareSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const userId = req.user!.userId;
    const { users, message, notifyByEmail } = req.body;

    const { presentation, hasAccess } = await verifyPresentationAccess(presentationId, userId);
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }
    if (!hasAccess) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    const collaborations = [];
    for (const user of users) {
      const existing = await prisma.presentationCollaboration.findUnique({
        where: { presentationId_userId: { presentationId, userId: user.userId } },
      });

      if (existing) {
        const updated = await prisma.presentationCollaboration.update({
          where: { id: existing.id },
          data: {
            role: user.role,
            permissions: (user.permissions || null) as Prisma.InputJsonValue,
            isActive: true,
            updatedAt: new Date(),
          },
        });
        collaborations.push(updated);
      } else {
        const created = await prisma.presentationCollaboration.create({
          data: {
            presentationId,
            userId: user.userId,
            role: user.role,
            permissions: (user.permissions || null) as Prisma.InputJsonValue,
            isActive: true,
            metadata: {
              sharedBy: userId,
              message: message || null,
              notified: notifyByEmail || false,
            },
          },
        });
        collaborations.push(created);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        presentationId,
        collaborators: collaborations,
        sharedCount: collaborations.length,
        notified: notifyByEmail || false,
      },
    });
  })
);

router.put(
  '/share/:presentationId/:userId',
  authMiddleware,
  validate(updateCollaboratorSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, userId: targetUserId } = req.params;
    const requesterId = req.user!.userId;

    const { presentation, hasAccess } = await verifyPresentationAccess(presentationId, requesterId);
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }
    if (!hasAccess) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    const existing = await prisma.presentationCollaboration.findUnique({
      where: { presentationId_userId: { presentationId, userId: targetUserId } },
    });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Collaborator not found', code: 'COLLABORATOR_NOT_FOUND' });
      return;
    }

    const updated = await prisma.presentationCollaboration.update({
      where: { id: existing.id },
      data: {
        role: req.body.role,
        permissions: (req.body.permissions || existing.permissions) as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    res.json({ success: true, data: updated });
  })
);

router.delete(
  '/share/:presentationId/:userId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId, userId: targetUserId } = req.params;
    const requesterId = req.user!.userId;

    const { presentation, hasAccess } = await verifyPresentationAccess(presentationId, requesterId);
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }
    if (!hasAccess) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    const existing = await prisma.presentationCollaboration.findUnique({
      where: { presentationId_userId: { presentationId, userId: targetUserId } },
    });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Collaborator not found', code: 'COLLABORATOR_NOT_FOUND' });
      return;
    }

    await prisma.presentationCollaboration.delete({ where: { id: existing.id } });

    res.json({ success: true, message: 'Collaborator removed', data: { presentationId, userId: targetUserId } });
  })
);

router.get(
  '/collaborators/:presentationId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const userId = req.user!.userId;

    const { presentation, hasAccess } = await verifyPresentationAccess(presentationId, userId);
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }
    if (!hasAccess) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    const collaborators = await prisma.presentationCollaboration.findMany({
      where: { presentationId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const owner = await prisma.user.findUnique({
      where: { id: (presentation as Record<string, unknown>).userId as string },
      select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
    });

    res.json({
      success: true,
      data: {
        owner,
        collaborators,
        total: collaborators.length,
      },
    });
  })
);

// ─── Comment endpoints ──────────────────────────────────────────────────────

router.post(
  '/comments/:presentationId',
  authMiddleware,
  validate(commentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const userId = req.user!.userId;
    const { slideIndex, content, positionX, positionY, parentCommentId, mentions } = req.body;

    const { presentation, hasAccess } = await verifyPresentationAccess(presentationId, userId);
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }
    if (!hasAccess) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    const event = await prisma.collaborationEvent.create({
      data: {
        presentationId,
        userId,
        eventType: 'comment',
        updateSize: content.length,
        createdAt: new Date(),
      },
    });

    const commentData = {
      id: event.id,
      presentationId,
      userId,
      slideIndex,
      content,
      positionX: positionX || null,
      positionY: positionY || null,
      parentCommentId: parentCommentId || null,
      mentions: mentions || [],
      resolved: false,
      createdAt: event.createdAt,
    };

    await prisma.collaborationEvent.update({
      where: { id: event.id },
      data: {
        eventType: 'comment',
        updateSize: JSON.stringify(commentData).length,
      },
    });

    res.status(201).json({ success: true, data: commentData });
  })
);

router.get(
  '/comments/:presentationId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const userId = req.user!.userId;
    const slideIndex = req.query.slideIndex ? parseInt(req.query.slideIndex as string) : undefined;

    const { presentation, hasAccess } = await verifyPresentationAccess(presentationId, userId);
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }
    if (!hasAccess) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    const events = await prisma.collaborationEvent.findMany({
      where: { presentationId, eventType: 'comment' },
      orderBy: { createdAt: 'desc' },
    });

    const comments = events.map((e) => ({
      id: e.id,
      presentationId: e.presentationId,
      userId: e.userId,
      eventType: e.eventType,
      createdAt: e.createdAt,
    }));

    const filtered = slideIndex !== undefined
      ? comments
      : comments;

    res.json({
      success: true,
      data: { comments: filtered, total: filtered.length },
    });
  })
);

router.delete(
  '/comments/:commentId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { commentId } = req.params;
    const userId = req.user!.userId;

    const event = await prisma.collaborationEvent.findUnique({
      where: { id: commentId },
    });
    if (!event) {
      res.status(404).json({ success: false, error: 'Comment not found', code: 'COMMENT_NOT_FOUND' });
      return;
    }
    if (event.userId !== userId) {
      const presentation = await prisma.presentation.findUnique({
        where: { id: event.presentationId },
      });
      if (!presentation || presentation.userId !== userId) {
        res.status(403).json({ success: false, error: 'Cannot delete another user\'s comment', code: 'FORBIDDEN' });
        return;
      }
    }

    await prisma.collaborationEvent.delete({ where: { id: commentId } });

    res.json({ success: true, message: 'Comment deleted', data: { commentId } });
  })
);

// ─── Password Protection endpoints ─────────────────────────────────────────

router.post(
  '/protect/:presentationId',
  authMiddleware,
  validate(protectSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const userId = req.user!.userId;
    const { password, allowPrinting, allowCopying, allowEditing, expiresAt } = req.body;

    const presentation = await prisma.presentation.findUnique({ where: { id: presentationId } });
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }
    if (presentation.userId !== userId) {
      res.status(403).json({ success: false, error: 'Only the owner can set password protection', code: 'FORBIDDEN' });
      return;
    }

    const salt = crypto.randomBytes(32).toString('hex');
    const passwordHashValue = hashPassword(password, salt);

    const protection = await prisma.presentationProtection.upsert({
      where: { presentationId },
      create: {
        presentationId,
        passwordHash: passwordHashValue,
        salt,
        requirePassword: true,
        allowPrinting: allowPrinting !== undefined ? allowPrinting : true,
        allowCopying: allowCopying !== undefined ? allowCopying : true,
        allowEditing: allowEditing !== undefined ? allowEditing : true,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      update: {
        passwordHash: passwordHashValue,
        salt,
        requirePassword: true,
        allowPrinting: allowPrinting !== undefined ? allowPrinting : true,
        allowCopying: allowCopying !== undefined ? allowCopying : true,
        allowEditing: allowEditing !== undefined ? allowEditing : true,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        updatedAt: new Date(),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        presentationId,
        isProtected: true,
        allowPrinting: protection.allowPrinting,
        allowCopying: protection.allowCopying,
        allowEditing: protection.allowEditing,
        expiresAt: protection.expiresAt,
      },
    });
  })
);

router.post(
  '/unprotect/:presentationId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const userId = req.user!.userId;

    const presentation = await prisma.presentation.findUnique({ where: { id: presentationId } });
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }
    if (presentation.userId !== userId) {
      res.status(403).json({ success: false, error: 'Only the owner can remove password protection', code: 'FORBIDDEN' });
      return;
    }

    const existing = await prisma.presentationProtection.findUnique({ where: { presentationId } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Presentation is not password-protected', code: 'NOT_PROTECTED' });
      return;
    }

    await prisma.presentationProtection.delete({ where: { presentationId } });

    res.json({ success: true, message: 'Password protection removed', data: { presentationId, isProtected: false } });
  })
);

router.post(
  '/verify-password/:presentationId',
  validate(verifyPasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const { password } = req.body;

    const protection = await prisma.presentationProtection.findUnique({ where: { presentationId } });
    if (!protection) {
      res.status(404).json({ success: false, error: 'Presentation is not password-protected', code: 'NOT_PROTECTED' });
      return;
    }

    if (protection.expiresAt && new Date() > protection.expiresAt) {
      res.status(410).json({ success: false, error: 'Password protection has expired', code: 'PROTECTION_EXPIRED' });
      return;
    }

    const computedHash = hashPassword(password, protection.salt);
    const isValid = computedHash === protection.passwordHash;

    if (!isValid) {
      res.status(401).json({ success: false, error: 'Invalid password', code: 'INVALID_PASSWORD' });
      return;
    }

    res.json({
      success: true,
      data: {
        verified: true,
        allowPrinting: protection.allowPrinting,
        allowCopying: protection.allowCopying,
        allowEditing: protection.allowEditing,
      },
    });
  })
);

// ─── Analytics endpoints ────────────────────────────────────────────────────

router.get(
  '/analytics/:presentationId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const userId = req.user!.userId;

    const presentation = await prisma.presentation.findUnique({ where: { id: presentationId } });
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }
    if (presentation.userId !== userId) {
      const collab = await prisma.presentationCollaboration.findUnique({
        where: { presentationId_userId: { presentationId, userId } },
      });
      if (!collab) {
        res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
    }

    const liveSessions = await prisma.liveSession.findMany({
      where: { presentationId },
      orderBy: { startedAt: 'desc' },
    });

    const sessionIds = liveSessions.map((s) => s.id);

    const viewers = sessionIds.length > 0
      ? await prisma.sessionViewer.findMany({
          where: { sessionId: { in: sessionIds } },
        })
      : [];

    const slideViews = await prisma.slideView.findMany({
      where: { presentationId },
      orderBy: { viewedAt: 'desc' },
    });

    const totalViewers = new Set(viewers.map((v) => v.viewerUserId || v.viewerName)).size;
    const totalSessions = liveSessions.length;

    const slideViewCounts: Record<number, number> = {};
    const slideDurations: Record<number, number[]> = {};
    for (const sv of slideViews) {
      slideViewCounts[sv.slideIndex] = (slideViewCounts[sv.slideIndex] || 0) + 1;
      if (sv.durationMs) {
        if (!slideDurations[sv.slideIndex]) slideDurations[sv.slideIndex] = [];
        slideDurations[sv.slideIndex].push(sv.durationMs);
      }
    }

    const slideAnalytics = Object.keys(slideViewCounts).map((idx) => {
      const index = parseInt(idx);
      const durations = slideDurations[index] || [];
      const avgDuration = durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;
      return {
        slideIndex: index,
        views: slideViewCounts[index],
        averageDurationMs: avgDuration,
        totalDurationMs: durations.reduce((a, b) => a + b, 0),
      };
    });

    res.json({
      success: true,
      data: {
        presentationId,
        totalViewers,
        totalSessions,
        totalSlideViews: slideViews.length,
        slideAnalytics,
        recentSessions: liveSessions.slice(0, 10).map((s) => ({
          id: s.id,
          sessionCode: s.sessionCode,
          isActive: s.isActive,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          viewerCount: viewers.filter((v) => v.sessionId === s.id).length,
        })),
      },
    });
  })
);

// ─── Recording endpoints ────────────────────────────────────────────────────

router.post(
  '/record/:presentationId',
  authMiddleware,
  validate(recordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const userId = req.user!.userId;
    const { type, quality, format } = req.body;

    const presentation = await prisma.presentation.findUnique({ where: { id: presentationId } });
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const { hasAccess } = await verifyPresentationAccess(presentationId, userId);
    if (!hasAccess) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    const recordingId = crypto.randomUUID();
    const startedAt = new Date();

    const event = await prisma.collaborationEvent.create({
      data: {
        presentationId,
        userId,
        eventType: 'recording_start',
        updateSize: 0,
        createdAt: startedAt,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        recordingId: event.id,
        presentationId,
        type,
        quality: quality || 'medium',
        format: format || 'webm',
        status: 'recording',
        startedAt,
      },
    });
  })
);

router.get(
  '/recordings/:presentationId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const userId = req.user!.userId;

    const { presentation, hasAccess } = await verifyPresentationAccess(presentationId, userId);
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }
    if (!hasAccess) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    const recordingEvents = await prisma.collaborationEvent.findMany({
      where: {
        presentationId,
        eventType: { in: ['recording_start', 'recording_stop'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const recordings = recordingEvents
      .filter((e) => e.eventType === 'recording_start')
      .map((start) => {
        const stop = recordingEvents.find(
          (e) => e.eventType === 'recording_stop' && e.createdAt > start.createdAt && e.userId === start.userId
        );
        return {
          id: start.id,
          presentationId,
          userId: start.userId,
          startedAt: start.createdAt,
          endedAt: stop ? stop.createdAt : null,
          status: stop ? 'completed' : 'recording',
          durationMs: stop ? stop.createdAt.getTime() - start.createdAt.getTime() : null,
        };
      });

    res.json({ success: true, data: { recordings, total: recordings.length } });
  })
);

// ─── Live Session endpoints ─────────────────────────────────────────────────

router.post(
  '/live/start/:presentationId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const userId = req.user!.userId;

    const presentation = await prisma.presentation.findUnique({ where: { id: presentationId } });
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }
    if (presentation.userId !== userId) {
      res.status(403).json({ success: false, error: 'Only the owner can start a live session', code: 'FORBIDDEN' });
      return;
    }

    const activeSessions = await prisma.liveSession.findMany({
      where: { presentationId, isActive: true },
    });
    if (activeSessions.length > 0) {
      res.status(409).json({
        success: false,
        error: 'An active live session already exists for this presentation',
        code: 'SESSION_EXISTS',
        data: { sessionId: activeSessions[0].id, sessionCode: activeSessions[0].sessionCode },
      });
      return;
    }

    const sessionCode = generateSessionCode();
    const session = await prisma.liveSession.create({
      data: {
        presentationId,
        hostUserId: userId,
        sessionCode,
        currentSlideIndex: 0,
        isActive: true,
        startedAt: new Date(),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        sessionId: session.id,
        sessionCode: session.sessionCode,
        presentationId,
        hostUserId: userId,
        currentSlideIndex: 0,
        isActive: true,
        startedAt: session.startedAt,
        joinUrl: `/live/${session.sessionCode}`,
      },
    });
  })
);

router.post(
  '/live/end/:sessionId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const userId = req.user!.userId;

    const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      res.status(404).json({ success: false, error: 'Live session not found', code: 'SESSION_NOT_FOUND' });
      return;
    }
    if (session.hostUserId !== userId) {
      res.status(403).json({ success: false, error: 'Only the host can end the session', code: 'FORBIDDEN' });
      return;
    }
    if (!session.isActive) {
      res.status(400).json({ success: false, error: 'Session is already ended', code: 'SESSION_ENDED' });
      return;
    }

    const endedAt = new Date();
    const updated = await prisma.liveSession.update({
      where: { id: sessionId },
      data: { isActive: false, endedAt },
    });

    const viewerCount = await prisma.sessionViewer.count({ where: { sessionId } });
    const durationMs = endedAt.getTime() - session.startedAt.getTime();

    res.json({
      success: true,
      data: {
        sessionId: updated.id,
        isActive: false,
        endedAt,
        durationMs,
        totalViewers: viewerCount,
      },
    });
  })
);

router.get(
  '/live/status/:sessionId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      res.status(404).json({ success: false, error: 'Live session not found', code: 'SESSION_NOT_FOUND' });
      return;
    }

    const viewers = await prisma.sessionViewer.findMany({
      where: { sessionId },
      orderBy: { joinedAt: 'desc' },
    });

    const activeViewers = viewers.filter((v) => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      return v.lastActiveAt > fiveMinutesAgo;
    });

    const durationMs = session.isActive
      ? Date.now() - session.startedAt.getTime()
      : session.endedAt
        ? session.endedAt.getTime() - session.startedAt.getTime()
        : 0;

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        sessionCode: session.sessionCode,
        presentationId: session.presentationId,
        hostUserId: session.hostUserId,
        currentSlideIndex: session.currentSlideIndex,
        isActive: session.isActive,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        durationMs,
        totalViewers: viewers.length,
        activeViewers: activeViewers.length,
        viewers: viewers.map((v) => ({
          id: v.id,
          viewerName: v.viewerName,
          viewerUserId: v.viewerUserId,
          joinedAt: v.joinedAt,
          lastActiveAt: v.lastActiveAt,
          isActive: activeViewers.some((av) => av.id === v.id),
        })),
      },
    });
  })
);

router.post(
  '/live/navigate/:sessionId',
  authMiddleware,
  validate(liveNavigateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const userId = req.user!.userId;
    const { slideIndex, animation } = req.body;

    const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      res.status(404).json({ success: false, error: 'Live session not found', code: 'SESSION_NOT_FOUND' });
      return;
    }
    if (session.hostUserId !== userId) {
      res.status(403).json({ success: false, error: 'Only the host can navigate slides', code: 'FORBIDDEN' });
      return;
    }
    if (!session.isActive) {
      res.status(400).json({ success: false, error: 'Session is not active', code: 'SESSION_ENDED' });
      return;
    }

    const presentation = await prisma.presentation.findUnique({ where: { id: session.presentationId } });
    if (presentation && slideIndex >= presentation.slideCount) {
      res.status(400).json({
        success: false,
        error: `Slide index ${slideIndex} exceeds total slides (${presentation.slideCount})`,
        code: 'INVALID_SLIDE_INDEX',
      });
      return;
    }

    const previousSlide = session.currentSlideIndex;
    const updated = await prisma.liveSession.update({
      where: { id: sessionId },
      data: { currentSlideIndex: slideIndex },
    });

    res.json({
      success: true,
      data: {
        sessionId: updated.id,
        previousSlideIndex: previousSlide,
        currentSlideIndex: slideIndex,
        animation: animation || 'none',
        navigatedAt: new Date(),
      },
    });
  })
);

// ─── Presenter Mode endpoint ────────────────────────────────────────────────

router.post(
  '/presenter-mode/:presentationId',
  authMiddleware,
  validate(presenterModeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationId } = req.params;
    const userId = req.user!.userId;
    const { showNotes, showTimer, showNextSlide, laserPointer } = req.body;

    const presentation = await prisma.presentation.findUnique({
      where: { id: presentationId },
    });
    if (!presentation) {
      res.status(404).json({ success: false, error: 'Presentation not found', code: 'NOT_FOUND' });
      return;
    }

    const { hasAccess } = await verifyPresentationAccess(presentationId, userId);
    if (!hasAccess) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    const slides = await prisma.slide.findMany({
      where: { presentationId },
      orderBy: { slideIndex: 'asc' },
      select: { id: true, slideIndex: true, notes: true, content: true, layout: true },
    });

    const activeSession = await prisma.liveSession.findFirst({
      where: { presentationId, isActive: true },
    });

    res.json({
      success: true,
      data: {
        presentationId,
        presenterView: {
          showNotes: showNotes !== undefined ? showNotes : true,
          showTimer: showTimer !== undefined ? showTimer : true,
          showNextSlide: showNextSlide !== undefined ? showNextSlide : true,
          laserPointer: laserPointer !== undefined ? laserPointer : false,
        },
        slides: slides.map((s) => ({
          slideIndex: s.slideIndex,
          notes: s.notes,
          layout: s.layout,
          hasContent: !!s.content,
        })),
        totalSlides: slides.length,
        liveSession: activeSession ? {
          sessionId: activeSession.id,
          sessionCode: activeSession.sessionCode,
          currentSlideIndex: activeSession.currentSlideIndex,
        } : null,
        startedAt: new Date(),
      },
    });
  })
);

// ─── Remote Control endpoint ────────────────────────────────────────────────

router.post(
  '/remote-control/:sessionId',
  authMiddleware,
  validate(remoteControlSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const userId = req.user!.userId;
    const { action, slideIndex, laserPosition, highlightArea } = req.body;

    const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      res.status(404).json({ success: false, error: 'Live session not found', code: 'SESSION_NOT_FOUND' });
      return;
    }
    if (session.hostUserId !== userId) {
      res.status(403).json({ success: false, error: 'Only the host can use remote control', code: 'FORBIDDEN' });
      return;
    }
    if (!session.isActive) {
      res.status(400).json({ success: false, error: 'Session is not active', code: 'SESSION_ENDED' });
      return;
    }

    let newSlideIndex = session.currentSlideIndex;
    const presentation = await prisma.presentation.findUnique({ where: { id: session.presentationId } });
    const totalSlides = presentation ? presentation.slideCount : 999;

    switch (action) {
      case 'next':
        newSlideIndex = Math.min(session.currentSlideIndex + 1, totalSlides - 1);
        break;
      case 'previous':
        newSlideIndex = Math.max(session.currentSlideIndex - 1, 0);
        break;
      case 'goto':
        if (slideIndex !== undefined && slideIndex >= 0 && slideIndex < totalSlides) {
          newSlideIndex = slideIndex;
        }
        break;
      case 'end':
        await prisma.liveSession.update({
          where: { id: sessionId },
          data: { isActive: false, endedAt: new Date() },
        });
        res.json({
          success: true,
          data: { sessionId, action: 'end', sessionEnded: true, endedAt: new Date() },
        });
        return;
      case 'laser-on':
      case 'laser-off':
      case 'highlight':
      case 'blank-screen':
        break;
    }

    if (newSlideIndex !== session.currentSlideIndex) {
      await prisma.liveSession.update({
        where: { id: sessionId },
        data: { currentSlideIndex: newSlideIndex },
      });
    }

    res.json({
      success: true,
      data: {
        sessionId,
        action,
        previousSlideIndex: session.currentSlideIndex,
        currentSlideIndex: newSlideIndex,
        laserPosition: laserPosition || null,
        highlightArea: highlightArea || null,
        executedAt: new Date(),
      },
    });
  })
);

// ─── Workspace endpoints ────────────────────────────────────────────────────

router.post(
  '/workspace',
  authMiddleware,
  validate(workspaceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const tenantId = req.user!.organizationId || 'default';
    const { name, description, presentationIds, members, settings } = req.body;

    const workspaceId = crypto.randomUUID();

    const session = await prisma.collaborationSession.create({
      data: {
        id: workspaceId,
        sessionId: `workspace_${workspaceId.slice(0, 8)}`,
        presentationId: presentationIds && presentationIds.length > 0
          ? presentationIds[0]
          : '00000000-0000-0000-0000-000000000000',
        userId,
        joinedAt: new Date(),
        isActive: true,
        active: true,
      },
    });

    const memberList = members || [{ userId, role: 'owner' }];
    for (const member of memberList) {
      if (member.userId !== userId) {
        await prisma.collaborationSession.create({
          data: {
            sessionId: `workspace_${workspaceId.slice(0, 8)}_member`,
            presentationId: presentationIds && presentationIds.length > 0
              ? presentationIds[0]
              : '00000000-0000-0000-0000-000000000000',
            userId: member.userId,
            joinedAt: new Date(),
            isActive: true,
            active: true,
          },
        });
      }
    }

    res.status(201).json({
      success: true,
      data: {
        id: session.id,
        name,
        description: description || null,
        ownerId: userId,
        tenantId,
        presentationIds: presentationIds || [],
        members: memberList,
        settings: settings || {},
        createdAt: session.joinedAt,
      },
    });
  })
);

router.get(
  '/workspaces',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const sessions = await prisma.collaborationSession.findMany({
      where: {
        userId,
        isActive: true,
        sessionId: { startsWith: 'workspace_' },
      },
      orderBy: { joinedAt: 'desc' },
      skip,
      take: limit,
    });

    const total = await prisma.collaborationSession.count({
      where: {
        userId,
        isActive: true,
        sessionId: { startsWith: 'workspace_' },
      },
    });

    const workspaces = sessions.map((s) => ({
      id: s.id,
      sessionId: s.sessionId,
      presentationId: s.presentationId,
      userId: s.userId,
      joinedAt: s.joinedAt,
      isActive: s.isActive,
    }));

    res.json({
      success: true,
      data: workspaces,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  })
);

router.put(
  '/workspace/:id',
  authMiddleware,
  validate(updateWorkspaceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.userId;
    const { name, description, presentationIds, members, settings } = req.body;

    const session = await prisma.collaborationSession.findUnique({ where: { id } });
    if (!session) {
      res.status(404).json({ success: false, error: 'Workspace not found', code: 'NOT_FOUND' });
      return;
    }
    if (session.userId !== userId) {
      res.status(403).json({ success: false, error: 'Only the workspace owner can update it', code: 'FORBIDDEN' });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (presentationIds && presentationIds.length > 0) {
      updateData.presentationId = presentationIds[0];
    }

    const updated = await prisma.collaborationSession.update({
      where: { id },
      data: {
        ...updateData,
        isActive: true,
      },
    });

    if (members && members.length > 0) {
      for (const member of members) {
        if (member.userId !== userId) {
          const existing = await prisma.collaborationSession.findFirst({
            where: {
              sessionId: { startsWith: `workspace_${id.slice(0, 8)}` },
              userId: member.userId,
            },
          });
          if (!existing) {
            await prisma.collaborationSession.create({
              data: {
                sessionId: `workspace_${id.slice(0, 8)}_member`,
                presentationId: updated.presentationId,
                userId: member.userId,
                joinedAt: new Date(),
                isActive: true,
                active: true,
              },
            });
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        id: updated.id,
        name: name || null,
        description: description || null,
        presentationIds: presentationIds || [updated.presentationId],
        members: members || [],
        settings: settings || {},
        updatedAt: new Date(),
      },
    });
  })
);

export default router;
