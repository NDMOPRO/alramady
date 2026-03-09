import { PrismaClient } from '@prisma/client';
import * as ragEngine from './rag-engine.service';

const prisma = new PrismaClient();

export const ragService = {
  createKnowledgeBase: (name: string, description: string, tenantId: string) =>
    ragEngine.createKnowledgeBase(name, description, tenantId, ''),

  ingestDocument: (knowledgeBaseId: string, text: string | Buffer, metadata?: Record<string, unknown>) =>
    ragEngine.ingestDocument(knowledgeBaseId, Buffer.from(typeof text === 'string' ? text : text), 'document.txt', ''),

  queryKnowledgeBase: (
    knowledgeBaseId: string,
    question: string,
    tenantId?: string,
    userId?: string,
    topK?: number,
  ) => ragEngine.queryKnowledgeBase(knowledgeBaseId, question, topK ?? 5, tenantId || '', userId || ''),

  listKnowledgeBases: async (tenantId: string) => {
    const bases = await prisma.knowledgeBase.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return bases;
  },

  deleteKnowledgeBase: async (knowledgeBaseId: string) => {
    await prisma.knowledgeBase.delete({ where: { id: knowledgeBaseId } });
    return { success: true, deletedId: knowledgeBaseId };
  },
};
