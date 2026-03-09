import { prisma } from '../utils/prisma';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';

const CACHE_PREFIX = 'governance:teamwork';
const CACHE_TTL = 300;

export interface ListParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  organizationId?: string;
  type?: string;
}

export async function list(params: ListParams) {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc', search, organizationId, type } = params;
  const skip = (page - 1) * limit;

  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(params)}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (organizationId) where.organizationId = organizationId;
  if (type) where.type = type;

  const [data, total] = await Promise.all([
    prisma.team.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.team.count({ where }),
  ]);

  const result = {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };

  await cacheSet(cacheKey, result, CACHE_TTL);
  return result;
}

export async function getById(id: string) {
  const cacheKey = `${CACHE_PREFIX}:${id}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const record = await prisma.team.findUnique({ where: { id } });
  if (!record) throw new NotFoundError('Team', id);

  await cacheSet(cacheKey, record, CACHE_TTL);
  return record;
}

export async function create(data: Record<string, unknown>) {
  const record = await prisma.team.create({
    data: {
      name: String(data.name ?? ''),
      description: (data.description as string | undefined) ?? null,
      organizationId: (data.organizationId as string | undefined) ?? null,
      config: {
        type: data.type ?? 'project',
        maxMembers: data.maxMembers ?? null,
        settings: data.settings ?? {},
        metadata: data.metadata ?? {},
        leaderId: data.leaderId ?? null,
      },
      status: 'active',
    },
  });
  logger.info('Team created', { id: record.id, name: record.name });
  await cacheDel(`${CACHE_PREFIX}:list:*`);
  return record;
}

export async function update(id: string, data: Record<string, unknown>) {
  const current = await prisma.team.findUnique({ where: { id } });
  if (!current) throw new NotFoundError('Team', id);

  const currentConfig =
    current.config && typeof current.config === 'object' && !Array.isArray(current.config)
      ? current.config as Record<string, unknown>
      : {};
  const record = await prisma.team.update({
    where: { id },
    data: {
      name: data.name ? String(data.name) : undefined,
      description: data.description === undefined ? undefined : (data.description as string | null),
      organizationId: data.organizationId === undefined ? undefined : (data.organizationId as string | null),
      config:
        data.type !== undefined ||
        data.maxMembers !== undefined ||
        data.settings !== undefined ||
        data.metadata !== undefined ||
        data.leaderId !== undefined
          ? {
              ...currentConfig,
              ...(data.type !== undefined ? { type: data.type } : {}),
              ...(data.maxMembers !== undefined ? { maxMembers: data.maxMembers } : {}),
              ...(data.settings !== undefined ? { settings: data.settings } : {}),
              ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
              ...(data.leaderId !== undefined ? { leaderId: data.leaderId } : {}),
            }
          : undefined,
      status: data.isActive === undefined ? undefined : (data.isActive ? 'active' : 'inactive'),
      updatedAt: new Date(),
    },
  });
  logger.info('Team updated', { id });
  await cacheDel(`${CACHE_PREFIX}:*`);
  return record;
}

export async function remove(id: string) {
  await prisma.team.delete({ where: { id } });
  logger.info('Team deleted', { id });
  await cacheDel(`${CACHE_PREFIX}:*`);
  return { success: true };
}

export async function addMember(teamId: string, userId: string, role: string = 'member') {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw new NotFoundError('Team', teamId);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User', userId);

  const existing = await prisma.teamMember.findFirst({
    where: { teamId, userId },
  });
  if (existing) {
    throw new Error(`User '${userId}' is already a member of team '${teamId}'`);
  }

  const membership = await prisma.teamMember.create({
    data: { teamId, userId, role },
  });

  logger.info('Team member added', { teamId, userId, role });
  await cacheDel(`${CACHE_PREFIX}:*`);

  return {
    id: membership.id,
    teamId,
    userId,
    role,
    teamName: team.name,
    userName: user.name,
    addedAt: membership.createdAt,
  };
}

export async function removeMember(teamId: string, userId: string) {
  const membership = await prisma.teamMember.findFirst({
    where: { teamId, userId },
  });
  if (!membership) {
    throw new Error(`User '${userId}' is not a member of team '${teamId}'`);
  }

  await prisma.teamMember.delete({ where: { id: membership.id } });
  logger.info('Team member removed', { teamId, userId });
  await cacheDel(`${CACHE_PREFIX}:*`);

  return { success: true, teamId, userId, message: 'Member removed from team' };
}

export async function getMembers(teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw new NotFoundError('Team', teamId);

  const members = await prisma.teamMember.findMany({
    where: { teamId },
    include: {
      user: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  });

  return {
    teamId,
    teamName: team.name,
    members: members.map(m => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      systemRole: m.user.role,
      teamRole: m.role,
      joinedAt: m.createdAt,
    })),
    totalMembers: members.length,
  };
}

export async function shareWithTeam(
  teamId: string,
  resourceType: string,
  resourceId: string,
  permission: string,
  sharedBy: string,
) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw new NotFoundError('Team', teamId);

  const validPermissions = ['view', 'edit', 'admin'];
  if (!validPermissions.includes(permission)) {
    throw new Error(`Invalid permission '${permission}'. Must be one of: ${validPermissions.join(', ')}`);
  }

  const validResourceTypes = ['dashboard', 'report', 'dataset', 'presentation', 'file'];
  if (!validResourceTypes.includes(resourceType)) {
    throw new Error(`Invalid resource type '${resourceType}'`);
  }

  const members = await prisma.teamMember.findMany({
    where: { teamId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const shareId = `team_share_${teamId}_${resourceType}_${resourceId}`;

  await prisma.auditLog.create({
    data: {
      tenantId: team.organizationId || 'system',
      userId: sharedBy,
      action: 'teamwork.resource_shared_with_team',
      entityType: resourceType,
      entityId: resourceId,
      detailsJson: {
        shareId,
        teamId,
        teamName: team.name,
        resourceType,
        resourceId,
        permission,
        sharedBy,
        memberCount: members.length,
        memberIds: members.map(m => m.user.id),
        sharedAt: new Date().toISOString(),
      },
    },
  });

  logger.info('Resource shared with team', {
    teamId,
    teamName: team.name,
    resourceType,
    resourceId,
    permission,
    memberCount: members.length,
  });

  await cacheDel(`${CACHE_PREFIX}:*`);

  return {
    shareId,
    teamId,
    teamName: team.name,
    resourceType,
    resourceId,
    permission,
    sharedWith: members.map(m => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
    })),
    totalMembers: members.length,
    sharedAt: new Date().toISOString(),
  };
}
