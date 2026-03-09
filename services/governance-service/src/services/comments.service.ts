import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { z } from 'zod';
import { Queue } from 'bullmq';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const notificationQueue = new Queue('governance-notifications', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
});

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const CreateCommentSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1, 'User ID is required'),
  resourceType: z.enum(['dashboard', 'report', 'dataset', 'presentation', 'file', 'cell', 'chart', 'kpi']),
  resourceId: z.string().min(1, 'Resource ID is required'),
  content: z.string().min(1, 'Comment content is required').max(5000, 'Comment cannot exceed 5000 characters'),
  parentId: z.string().optional(),
  mentions: z.array(z.string()).default([]),
  attachments: z.array(z.object({
    name: z.string().min(1),
    url: z.string().url(),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().positive(),
  })).default([]),
  visibility: z.enum(['public', 'internal', 'private']).default('public'),
});

const UpdateCommentSchema = z.object({
  commentId: z.string().min(1),
  userId: z.string().min(1),
  content: z.string().min(1).max(5000),
});

const CreateDiscussionSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1, 'User ID is required'),
  resourceType: z.enum(['dashboard', 'report', 'dataset', 'presentation', 'file']),
  resourceId: z.string().min(1),
  title: z.string().min(1, 'Discussion title is required').max(200),
  description: z.string().max(2000).default(''),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  assignees: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

const ResolveDiscussionSchema = z.object({
  discussionId: z.string().min(1),
  userId: z.string().min(1),
  resolution: z.string().min(1, 'Resolution note is required').max(2000),
});

const ListCommentsSchema = z.object({
  tenantId: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(50),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  includeReplies: z.boolean().default(true),
});

// ─── Service ────────────────────────────────────────────────────────────────

export class CommentsService {
  private readonly CACHE_TTL = 120;

  /**
   * Create a comment on any resource.
   */
  async createComment(input: z.infer<typeof CreateCommentSchema>): Promise<Record<string, unknown>> {
    const validated = CreateCommentSchema.parse(input);

    const user = await prisma.user.findUnique({
      where: { id: validated.userId },
      select: { id: true, name: true, email: true, tenantId: true, role: true },
    });
    if (!user || user.tenantId !== validated.tenantId) {
      throw new Error('User not found in this tenant');
    }

    if (validated.parentId) {
      const parentComment = await this.getCommentById(validated.parentId);
      if (!parentComment) {
        throw new Error(`Parent comment '${validated.parentId}' not found`);
      }
      if (parentComment.resourceId !== validated.resourceId) {
        throw new Error('Parent comment belongs to a different resource');
      }
    }

    const commentId = crypto.randomUUID();

    const commentData = {
      id: commentId,
      tenantId: validated.tenantId,
      userId: validated.userId,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      resourceType: validated.resourceType,
      resourceId: validated.resourceId,
      content: validated.content,
      contentHtml: this.processContent(validated.content),
      parentId: validated.parentId || null,
      mentions: validated.mentions,
      attachments: validated.attachments,
      visibility: validated.visibility,
      reactions: {},
      editHistory: [],
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await prisma.auditLog.create({
      data: {
        tenantId: validated.tenantId,
        userId: validated.userId,
        action: validated.parentId ? 'comment.reply_created' : 'comment.created',
        entityType: 'comment',
        entityId: commentId,
        detailsJson: commentData as Record<string, unknown>,
      },
    });

    await redis.set(
      `comment:${commentId}`,
      JSON.stringify(commentData),
      'EX',
      86400,
    );

    await this.invalidateCommentCache(validated.tenantId, validated.resourceType, validated.resourceId);

    if (validated.mentions.length > 0) {
      for (const mentionedUserId of validated.mentions) {
        await notificationQueue.add('comment-mention', {
          tenantId: validated.tenantId,
          commentId,
          mentionedUserId,
          authorName: user.name,
          resourceType: validated.resourceType,
          resourceId: validated.resourceId,
          snippet: validated.content.slice(0, 200),
        });
      }
    }

    if (validated.parentId) {
      const parentComment = await this.getCommentById(validated.parentId);
      if (parentComment && parentComment.userId !== validated.userId) {
        await notificationQueue.add('comment-reply', {
          tenantId: validated.tenantId,
          commentId,
          parentCommentId: validated.parentId,
          parentAuthorId: parentComment.userId,
          replyAuthorName: user.name,
          resourceType: validated.resourceType,
          resourceId: validated.resourceId,
          snippet: validated.content.slice(0, 200),
        });
      }
    }

    logger.info('Comment created', {
      commentId,
      tenantId: validated.tenantId,
      resourceType: validated.resourceType,
      resourceId: validated.resourceId,
      isReply: !!validated.parentId,
      mentionCount: validated.mentions.length,
    });

    return {
      id: commentId,
      userId: validated.userId,
      userName: user.name,
      resourceType: validated.resourceType,
      resourceId: validated.resourceId,
      content: validated.content,
      parentId: validated.parentId || null,
      mentions: validated.mentions,
      attachments: validated.attachments,
      visibility: validated.visibility,
      createdAt: commentData.createdAt,
    };
  }

  /**
   * Update an existing comment.
   */
  async updateComment(input: z.infer<typeof UpdateCommentSchema>): Promise<Record<string, unknown>> {
    const validated = UpdateCommentSchema.parse(input);

    const comment = await this.getCommentById(validated.commentId);
    if (!comment) {
      throw new Error(`Comment '${validated.commentId}' not found`);
    }

    if (comment.userId !== validated.userId) {
      throw new Error('Only the comment author can edit this comment');
    }

    if (comment.status !== 'ACTIVE') {
      throw new Error('Cannot edit a deleted comment');
    }

    const editHistory = (comment.editHistory as Array<Record<string, unknown>>) || [];
    editHistory.push({
      previousContent: comment.content,
      editedAt: new Date().toISOString(),
    });

    const updatedComment = {
      ...comment,
      content: validated.content,
      contentHtml: this.processContent(validated.content),
      editHistory,
      updatedAt: new Date().toISOString(),
    };

    await redis.set(
      `comment:${validated.commentId}`,
      JSON.stringify(updatedComment),
      'EX',
      86400,
    );

    await prisma.auditLog.create({
      data: {
        tenantId: comment.tenantId as string,
        userId: validated.userId,
        action: 'comment.updated',
        entityType: 'comment',
        entityId: validated.commentId,
        detailsJson: updatedComment as Record<string, unknown>,
      },
    });

    await this.invalidateCommentCache(
      comment.tenantId as string,
      comment.resourceType as string,
      comment.resourceId as string,
    );

    logger.info('Comment updated', {
      commentId: validated.commentId,
      editCount: editHistory.length,
    });

    return {
      id: validated.commentId,
      content: validated.content,
      editCount: editHistory.length,
      updatedAt: updatedComment.updatedAt,
      message: 'Comment updated successfully',
    };
  }

  /**
   * Delete (soft-delete) a comment.
   */
  async deleteComment(commentId: string, userId: string): Promise<Record<string, unknown>> {
    z.string().min(1).parse(commentId);
    z.string().min(1).parse(userId);

    const comment = await this.getCommentById(commentId);
    if (!comment) {
      throw new Error(`Comment '${commentId}' not found`);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (comment.userId !== userId && user?.role !== 'admin' && user?.role !== 'superadmin') {
      throw new Error('Only the comment author or an admin can delete this comment');
    }

    const deletedComment = {
      ...comment,
      status: 'deleted',
      content: '[Comment deleted]',
      contentHtml: '<em>[Comment deleted]</em>',
      deletedAt: new Date().toISOString(),
      deletedBy: userId,
    };

    await redis.set(`comment:${commentId}`, JSON.stringify(deletedComment), 'EX', 86400);

    await prisma.auditLog.create({
      data: {
        tenantId: comment.tenantId as string,
        userId,
        action: 'comment.deleted',
        entityType: 'comment',
        entityId: commentId,
        detailsJson: {
          commentId,
          originalAuthor: comment.userId as string,
          deletedBy: userId,
          deletedAt: new Date().toISOString(),
        } as Record<string, unknown>,
      },
    });

    await this.invalidateCommentCache(
      comment.tenantId as string,
      comment.resourceType as string,
      comment.resourceId as string,
    );

    logger.info('Comment deleted', { commentId, deletedBy: userId });

    return {
      id: commentId,
      status: 'deleted',
      deletedBy: userId,
      message: 'Comment deleted successfully',
    };
  }

  /**
   * Add a reaction to a comment (like, thumbs-up, etc.).
   */
  async addReaction(commentId: string, userId: string, reaction: string): Promise<Record<string, unknown>> {
    z.string().min(1).parse(commentId);
    z.string().min(1).parse(userId);
    z.string().min(1).max(20).parse(reaction);

    const validReactions = ['like', 'love', 'thumbsup', 'thumbsdown', 'laugh', 'confused', 'celebrate', 'rocket'];
    if (!validReactions.includes(reaction)) {
      throw new Error(`Invalid reaction. Must be one of: ${validReactions.join(', ')}`);
    }

    const comment = await this.getCommentById(commentId);
    if (!comment) {
      throw new Error(`Comment '${commentId}' not found`);
    }

    const reactions = (comment.reactions || {}) as Record<string, string[]>;
    if (!reactions[reaction]) {
      reactions[reaction] = [];
    }

    if (reactions[reaction].includes(userId)) {
      reactions[reaction] = reactions[reaction].filter((id: string) => id !== userId);
    } else {
      reactions[reaction].push(userId);
    }

    const updatedComment = { ...comment, reactions };
    await redis.set(`comment:${commentId}`, JSON.stringify(updatedComment), 'EX', 86400);

    await prisma.auditLog.create({
      data: {
        tenantId: comment.tenantId as string,
        userId,
        action: 'comment.reaction',
        entityType: 'comment',
        entityId: commentId,
        detailsJson: { reaction, userId, commentId },
      },
    });

    logger.info('Reaction toggled', { commentId, userId, reaction });

    const reactionSummary: Record<string, number> = {};
    for (const [key, users] of Object.entries(reactions)) {
      if ((users as string[]).length > 0) {
        reactionSummary[key] = (users as string[]).length;
      }
    }

    return {
      commentId,
      reactions: reactionSummary,
      message: 'Reaction updated',
    };
  }

  /**
   * List comments for a resource.
   */
  async listComments(input: z.infer<typeof ListCommentsSchema>): Promise<Record<string, unknown>> {
    const validated = ListCommentsSchema.parse(input);

    const cacheKey = `comments:${validated.tenantId}:${validated.resourceType}:${validated.resourceId}:${validated.page}:${validated.limit}:${validated.sortOrder}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const allComments = await this.getAllResourceComments(
      validated.tenantId,
      validated.resourceType,
      validated.resourceId,
    );

    const topLevelComments = allComments.filter(c => !c.parentId && c.status === 'ACTIVE');

    topLevelComments.sort((a, b) => {
      const aTime = new Date(a.createdAt as string).getTime();
      const bTime = new Date(b.createdAt as string).getTime();
      return validated.sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
    });

    const total = topLevelComments.length;
    const start = (validated.page - 1) * validated.limit;
    const pageComments = topLevelComments.slice(start, start + validated.limit);

    const commentsWithReplies = pageComments.map(comment => {
      const reactionSummary: Record<string, number> = {};
      const reactions = (comment.reactions || {}) as Record<string, string[]>;
      for (const [key, users] of Object.entries(reactions)) {
        if ((users as string[]).length > 0) {
          reactionSummary[key] = (users as string[]).length;
        }
      }

      const result: Record<string, unknown> = {
        id: comment.id,
        userId: comment.userId,
        userName: comment.userName,
        content: comment.content,
        visibility: comment.visibility,
        reactions: reactionSummary,
        attachments: comment.attachments,
        editCount: ((comment.editHistory as unknown[]) || []).length,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      };

      if (validated.includeReplies) {
        const replies = allComments
          .filter(c => c.parentId === comment.id && c.status === 'ACTIVE')
          .sort((a, b) => new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime())
          .map(reply => ({
            id: reply.id,
            userId: reply.userId,
            userName: reply.userName,
            content: reply.content,
            createdAt: reply.createdAt,
            updatedAt: reply.updatedAt,
          }));
        result.replies = replies;
        result.replyCount = replies.length;
      }

      return result;
    });

    const totalPages = Math.ceil(total / validated.limit);

    const response = {
      comments: commentsWithReplies,
      pagination: {
        page: validated.page,
        limit: validated.limit,
        total,
        totalPages,
        hasNext: validated.page < totalPages,
        hasPrevious: validated.page > 1,
      },
    };

    await redis.set(cacheKey, JSON.stringify(response), 'EX', this.CACHE_TTL);

    return response;
  }

  /**
   * Create a structured discussion thread on a resource.
   */
  async createDiscussion(input: z.infer<typeof CreateDiscussionSchema>): Promise<Record<string, unknown>> {
    const validated = CreateDiscussionSchema.parse(input);

    const user = await prisma.user.findUnique({
      where: { id: validated.userId },
      select: { id: true, name: true, email: true, tenantId: true },
    });
    if (!user || user.tenantId !== validated.tenantId) {
      throw new Error('User not found in this tenant');
    }

    const discussionId = crypto.randomUUID();

    const discussionData = {
      id: discussionId,
      tenantId: validated.tenantId,
      userId: validated.userId,
      userName: user.name,
      resourceType: validated.resourceType,
      resourceId: validated.resourceId,
      title: validated.title,
      description: validated.description,
      priority: validated.priority,
      assignees: validated.assignees,
      tags: validated.tags,
      status: 'open',
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await prisma.auditLog.create({
      data: {
        tenantId: validated.tenantId,
        userId: validated.userId,
        action: 'discussion.created',
        entityType: 'discussion',
        entityId: discussionId,
        detailsJson: discussionData,
      },
    });

    await redis.set(
      `discussion:${discussionId}`,
      JSON.stringify(discussionData),
      'EX',
      86400,
    );

    if (validated.assignees.length > 0) {
      for (const assigneeId of validated.assignees) {
        await notificationQueue.add('discussion-assigned', {
          tenantId: validated.tenantId,
          discussionId,
          assigneeId,
          authorName: user.name,
          title: validated.title,
          resourceType: validated.resourceType,
          resourceId: validated.resourceId,
          priority: validated.priority,
        });
      }
    }

    logger.info('Discussion created', {
      discussionId,
      tenantId: validated.tenantId,
      resourceType: validated.resourceType,
      resourceId: validated.resourceId,
      priority: validated.priority,
      assigneeCount: validated.assignees.length,
    });

    return {
      id: discussionId,
      title: validated.title,
      description: validated.description,
      priority: validated.priority,
      status: 'open',
      resourceType: validated.resourceType,
      resourceId: validated.resourceId,
      assignees: validated.assignees,
      tags: validated.tags,
      author: { id: user.id, name: user.name },
      createdAt: discussionData.createdAt,
    };
  }

  /**
   * Resolve a discussion thread.
   */
  async resolveDiscussion(input: z.infer<typeof ResolveDiscussionSchema>): Promise<Record<string, unknown>> {
    const validated = ResolveDiscussionSchema.parse(input);

    const discussion = await this.getDiscussionById(validated.discussionId);
    if (!discussion) {
      throw new Error(`Discussion '${validated.discussionId}' not found`);
    }

    if (discussion.status === 'resolved') {
      throw new Error('Discussion is already resolved');
    }

    const updatedDiscussion = {
      ...discussion,
      status: 'resolved',
      resolution: validated.resolution,
      resolvedBy: validated.userId,
      resolvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await redis.set(
      `discussion:${validated.discussionId}`,
      JSON.stringify(updatedDiscussion),
      'EX',
      86400,
    );

    await prisma.auditLog.create({
      data: {
        tenantId: discussion.tenantId as string,
        userId: validated.userId,
        action: 'discussion.resolved',
        entityType: 'discussion',
        entityId: validated.discussionId,
        detailsJson: {
          discussionId: validated.discussionId,
          title: discussion.title as string,
          resolution: validated.resolution,
          resolvedBy: validated.userId,
          resolvedAt: updatedDiscussion.resolvedAt,
        } as Record<string, unknown>,
      },
    });

    const assignees = (discussion.assignees as string[]) || [];
    const authorId = discussion.userId as string;
    const notifyIds = [...new Set([...assignees, authorId])].filter(id => id !== validated.userId);

    for (const notifyId of notifyIds) {
      await notificationQueue.add('discussion-resolved', {
        tenantId: discussion.tenantId,
        discussionId: validated.discussionId,
        title: discussion.title,
        resolvedByUserId: validated.userId,
        notifyUserId: notifyId,
        resolution: validated.resolution,
      });
    }

    logger.info('Discussion resolved', {
      discussionId: validated.discussionId,
      resolvedBy: validated.userId,
    });

    return {
      id: validated.discussionId,
      title: discussion.title,
      status: 'resolved',
      resolution: validated.resolution,
      resolvedBy: validated.userId,
      resolvedAt: updatedDiscussion.resolvedAt,
      message: 'Discussion resolved successfully',
    };
  }

  /**
   * List discussions for a resource.
   */
  async listDiscussions(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    statusFilter?: 'open' | 'resolved' | 'all',
  ): Promise<Array<Record<string, unknown>>> {
    z.string().min(1).parse(tenantId);
    z.string().min(1).parse(resourceType);
    z.string().min(1).parse(resourceId);

    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        entityType: 'discussion',
        action: { startsWith: 'discussion.' },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const discussionMap = new Map<string, Record<string, unknown>>();

    for (const log of logs) {
      const details = log.detailsJson as Record<string, unknown>;
      const dId = (details.id || details.discussionId || log.entityId) as string;

      if (
        details.resourceType === resourceType &&
        details.resourceId === resourceId
      ) {
        if (!discussionMap.has(dId)) {
          const cached = await redis.get(`discussion:${dId}`);
          if (cached) {
            discussionMap.set(dId, JSON.parse(cached));
          } else {
            discussionMap.set(dId, details);
          }
        }
      }
    }

    let discussions = Array.from(discussionMap.values());

    if (statusFilter && statusFilter !== 'all') {
      discussions = discussions.filter(d => d.status === statusFilter);
    }

    discussions.sort((a, b) => {
      const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const aPriority = priorityOrder[(a.priority as string) || 'medium'] ?? 2;
      const bPriority = priorityOrder[(b.priority as string) || 'medium'] ?? 2;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime();
    });

    return discussions.map(d => ({
      id: d.id,
      title: d.title,
      description: d.description,
      priority: d.priority,
      status: d.status,
      author: { id: d.userId, name: d.userName },
      assignees: d.assignees,
      tags: d.tags,
      commentCount: d.commentCount || 0,
      resolution: d.resolution || null,
      resolvedBy: d.resolvedBy || null,
      resolvedAt: d.resolvedAt || null,
      createdAt: d.createdAt,
    }));
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async invalidateCommentCache(tenantId: string, resourceType: string, resourceId: string): Promise<void> {
    const pattern = `comments:${tenantId}:${resourceType}:${resourceId}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  private async getCommentById(commentId: string): Promise<Record<string, unknown> | null> {
    const cached = await redis.get(`comment:${commentId}`);
    if (cached) return JSON.parse(cached);

    const logs = await prisma.auditLog.findMany({
      where: {
        entityId: commentId,
        entityType: 'comment',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (logs.length === 0) return null;
    const details = logs[0].detailsJson as Record<string, unknown>;
    await redis.set(`comment:${commentId}`, JSON.stringify(details), 'EX', 86400);
    return details;
  }

  private async getDiscussionById(discussionId: string): Promise<Record<string, unknown> | null> {
    const cached = await redis.get(`discussion:${discussionId}`);
    if (cached) return JSON.parse(cached);

    const logs = await prisma.auditLog.findMany({
      where: {
        entityId: discussionId,
        entityType: 'discussion',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (logs.length === 0) return null;
    return logs[0].detailsJson as Record<string, unknown>;
  }

  private async getAllResourceComments(
    tenantId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        entityType: 'comment',
        action: { startsWith: 'comment.' },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const commentMap = new Map<string, Record<string, unknown>>();

    for (const log of logs) {
      const details = log.detailsJson as Record<string, unknown>;
      const cId = (details.id || log.entityId) as string;

      if (
        details.resourceType === resourceType &&
        details.resourceId === resourceId &&
        !commentMap.has(cId)
      ) {
        const cached = await redis.get(`comment:${cId}`);
        if (cached) {
          commentMap.set(cId, JSON.parse(cached));
        } else {
          commentMap.set(cId, details);
        }
      }
    }

    return Array.from(commentMap.values());
  }

  private processContent(content: string): string {
    let html = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    html = html.replace(/@(\w+)/g, '<span class="mention" data-user="$1">@$1</span>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br />');

    return html;
  }
}

export const commentsService = new CommentsService();
