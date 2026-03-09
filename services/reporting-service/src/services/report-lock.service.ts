import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const LockSectionInput = z.object({
  reportId: z.string().uuid(),
  sectionId: z.string().uuid(),
  lockedBy: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

const UnlockSectionInput = z.object({
  reportId: z.string().uuid(),
  sectionId: z.string().uuid(),
  unlockedBy: z.string().uuid(),
});

const LockEntireReportInput = z.object({
  reportId: z.string().uuid(),
  lockedBy: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

const ValidateEditInput = z.object({
  reportId: z.string().uuid(),
  sectionId: z.string().uuid(),
  userId: z.string().uuid(),
});

type LockSectionPayload = z.infer<typeof LockSectionInput>;
type UnlockSectionPayload = z.infer<typeof UnlockSectionInput>;
type LockEntireReportPayload = z.infer<typeof LockEntireReportInput>;
type ValidateEditPayload = z.infer<typeof ValidateEditInput>;

interface LockResult {
  sectionId: string;
  isLocked: boolean;
  lockedBy: string | null;
  lockedAt: Date | null;
  reason: string | null;
}

interface EditValidation {
  canEdit: boolean;
  reason: string;
  lockedBy: string | null;
  lockedAt: Date | null;
}

export class ReportLockService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  async lockSection(input: LockSectionPayload): Promise<LockResult> {
    const validated = LockSectionInput.parse(input);

    const section = await this.prisma.reportSection.findFirst({
      where: {
        id: validated.sectionId,
        reportId: validated.reportId,
      },
    });

    if (!section) {
      throw new Error(
        `Section ${validated.sectionId} not found in report ${validated.reportId}`
      );
    }

    if (section.isLocked && section.lockedBy !== validated.lockedBy) {
      throw new Error(
        `Section is already locked by user ${section.lockedBy}. Cannot override another user's lock.`
      );
    }

    const updated = await this.prisma.reportSection.update({
      where: { id: validated.sectionId },
      data: {
        isLocked: true,
        lockedBy: validated.lockedBy,
        lockedAt: new Date(),
        lockReason: validated.reason ?? null,
      },
    });

    await this.prisma.reportAuditLog.create({
      data: {
        reportId: validated.reportId,
        sectionId: validated.sectionId,
        action: 'LOCK_SECTION',
        performedBy: validated.lockedBy,
        details: JSON.stringify({
          reason: validated.reason ?? null,
        }),
      },
    });

    return {
      sectionId: updated.id,
      isLocked: updated.isLocked,
      lockedBy: updated.lockedBy,
      lockedAt: updated.lockedAt,
      reason: updated.lockReason,
    };
  }

  async unlockSection(input: UnlockSectionPayload): Promise<LockResult> {
    const validated = UnlockSectionInput.parse(input);

    const section = await this.prisma.reportSection.findFirst({
      where: {
        id: validated.sectionId,
        reportId: validated.reportId,
      },
    });

    if (!section) {
      throw new Error(
        `Section ${validated.sectionId} not found in report ${validated.reportId}`
      );
    }

    if (!section.isLocked) {
      return {
        sectionId: section.id,
        isLocked: false,
        lockedBy: null,
        lockedAt: null,
        reason: null,
      };
    }

    const isOwner = section.lockedBy === validated.unlockedBy;
    if (!isOwner) {
      const user = await this.prisma.user.findUnique({
        where: { id: validated.unlockedBy },
        select: { role: true },
      });

      if (!user || user.role !== 'ADMIN') {
        throw new Error(
          `Only the lock owner or an admin can unlock this section. Locked by: ${section.lockedBy}`
        );
      }
    }

    const updated = await this.prisma.reportSection.update({
      where: { id: validated.sectionId },
      data: {
        isLocked: false,
        lockedBy: null,
        lockedAt: null,
        lockReason: null,
      },
    });

    await this.prisma.reportAuditLog.create({
      data: {
        reportId: validated.reportId,
        sectionId: validated.sectionId,
        action: 'UNLOCK_SECTION',
        performedBy: validated.unlockedBy,
        details: JSON.stringify({
          previousLockedBy: section.lockedBy,
          overriddenByAdmin: !isOwner,
        }),
      },
    });

    return {
      sectionId: updated.id,
      isLocked: updated.isLocked,
      lockedBy: updated.lockedBy,
      lockedAt: updated.lockedAt,
      reason: updated.lockReason,
    };
  }

  async lockEntireReport(input: LockEntireReportPayload): Promise<{
    reportId: string;
    lockedSections: LockResult[];
  }> {
    const validated = LockEntireReportInput.parse(input);

    const sections = await this.prisma.reportSection.findMany({
      where: { reportId: validated.reportId },
      orderBy: { order: 'asc' },
    });

    if (sections.length === 0) {
      throw new Error(`No sections found for report ${validated.reportId}`);
    }

    const conflicting = sections.filter(
      (s) => s.isLocked && s.lockedBy !== validated.lockedBy
    );

    if (conflicting.length > 0) {
      const owners = [...new Set(conflicting.map((s) => s.lockedBy))].join(', ');
      throw new Error(
        `Cannot lock entire report. ${conflicting.length} section(s) are locked by other users: ${owners}`
      );
    }

    const now = new Date();

    await this.prisma.reportSection.updateMany({
      where: { reportId: validated.reportId },
      data: {
        isLocked: true,
        lockedBy: validated.lockedBy,
        lockedAt: now,
        lockReason: validated.reason ?? null,
      },
    });

    await this.prisma.reportAuditLog.create({
      data: {
        reportId: validated.reportId,
        sectionId: null,
        action: 'LOCK_ENTIRE_REPORT',
        performedBy: validated.lockedBy,
        details: JSON.stringify({
          sectionCount: sections.length,
          reason: validated.reason ?? null,
        }),
      },
    });

    const updatedSections = await this.prisma.reportSection.findMany({
      where: { reportId: validated.reportId },
      orderBy: { order: 'asc' },
    });

    return {
      reportId: validated.reportId,
      lockedSections: updatedSections.map((s) => ({
        sectionId: s.id,
        isLocked: s.isLocked,
        lockedBy: s.lockedBy,
        lockedAt: s.lockedAt,
        reason: s.lockReason,
      })),
    };
  }

  async unlockEntireReport(input: { reportId: string; unlockedBy: string }): Promise<{
    reportId: string;
    unlockedCount: number;
  }> {
    const validated = z
      .object({
        reportId: z.string().uuid(),
        unlockedBy: z.string().uuid(),
      })
      .parse(input);

    const user = await this.prisma.user.findUnique({
      where: { id: validated.unlockedBy },
      select: { role: true },
    });

    const sections = await this.prisma.reportSection.findMany({
      where: { reportId: validated.reportId, isLocked: true },
    });

    const otherLocks = sections.filter((s) => s.lockedBy !== validated.unlockedBy);
    if (otherLocks.length > 0 && (!user || user.role !== 'ADMIN')) {
      throw new Error(
        `Cannot unlock entire report. ${otherLocks.length} section(s) are locked by other users and you are not an admin.`
      );
    }

    const result = await this.prisma.reportSection.updateMany({
      where: { reportId: validated.reportId },
      data: {
        isLocked: false,
        lockedBy: null,
        lockedAt: null,
        lockReason: null,
      },
    });

    await this.prisma.reportAuditLog.create({
      data: {
        reportId: validated.reportId,
        sectionId: null,
        action: 'UNLOCK_ENTIRE_REPORT',
        performedBy: validated.unlockedBy,
        details: JSON.stringify({
          unlockedCount: result.count,
        }),
      },
    });

    return {
      reportId: validated.reportId,
      unlockedCount: result.count,
    };
  }

  async validateEdit(input: ValidateEditPayload): Promise<EditValidation> {
    const validated = ValidateEditInput.parse(input);

    const section = await this.prisma.reportSection.findFirst({
      where: {
        id: validated.sectionId,
        reportId: validated.reportId,
      },
    });

    if (!section) {
      return {
        canEdit: false,
        reason: `Section ${validated.sectionId} not found in report ${validated.reportId}`,
        lockedBy: null,
        lockedAt: null,
      };
    }

    if (!section.isLocked) {
      return {
        canEdit: true,
        reason: 'Section is not locked',
        lockedBy: null,
        lockedAt: null,
      };
    }

    if (section.lockedBy === validated.userId) {
      return {
        canEdit: true,
        reason: 'Section is locked by the requesting user',
        lockedBy: section.lockedBy,
        lockedAt: section.lockedAt,
      };
    }

    return {
      canEdit: false,
      reason: `Section is locked by another user since ${section.lockedAt?.toISOString() ?? 'unknown'}`,
      lockedBy: section.lockedBy,
      lockedAt: section.lockedAt,
    };
  }

  async getReportLockStatus(reportId: string): Promise<{
    reportId: string;
    sections: LockResult[];
    isFullyLocked: boolean;
    isPartiallyLocked: boolean;
  }> {
    const validatedId = z.string().uuid().parse(reportId);

    const sections = await this.prisma.reportSection.findMany({
      where: { reportId: validatedId },
      orderBy: { order: 'asc' },
    });

    if (sections.length === 0) {
      throw new Error(`No sections found for report ${validatedId}`);
    }

    const lockResults: LockResult[] = sections.map((s) => ({
      sectionId: s.id,
      isLocked: s.isLocked,
      lockedBy: s.lockedBy,
      lockedAt: s.lockedAt,
      reason: s.lockReason,
    }));

    const lockedCount = sections.filter((s) => s.isLocked).length;

    return {
      reportId: validatedId,
      sections: lockResults,
      isFullyLocked: lockedCount === sections.length,
      isPartiallyLocked: lockedCount > 0 && lockedCount < sections.length,
    };
  }
}
