/**
 * Resumable Upload Service — Rasid Platform
 * خدمة رفع الملفات الكبيرة بشكل مجزّأ مع استئناف
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { writeFile, readFile, mkdir, rm, readdir } from 'fs/promises';
import { join } from 'path';
import { logger } from '../utils/logger';

interface UploadSession {
  uploadId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number[];
  status: 'active' | 'completed' | 'expired';
  tenantId: string;
  createdAt: Date;
}

interface ChunkResult {
  chunkIndex: number;
  received: boolean;
  uploadedChunks: number[];
  remainingChunks: number;
}

interface UploadProgress {
  uploadId: string;
  uploadedChunks: number[];
  totalChunks: number;
  percentage: number;
  status: string;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const UPLOAD_DIR = process.env.UPLOAD_TEMP_DIR ?? '/tmp/uploads';

export class ResumableUploadService {
  constructor(private prisma: PrismaClient) {}

  async initUpload(
    fileName: string,
    fileSize: number,
    mimeType: string,
    tenantId: string
  ): Promise<UploadSession> {
    const uploadId = randomBytes(16).toString('hex');
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

    const uploadDir = join(UPLOAD_DIR, uploadId);
    await mkdir(uploadDir, { recursive: true });

    const session = await this.prisma.uploadSession.create({
      data: {
        id: uploadId,
        fileName,
        fileSize,
        mimeType,
        chunkSize: CHUNK_SIZE,
        totalChunks,
        uploadedChunks: JSON.stringify([]),
        status: 'active',
        tenantId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    logger.info('Upload session initialized', { uploadId, fileName, totalChunks, tenantId });

    return {
      uploadId: session.id,
      fileName,
      fileSize,
      mimeType,
      chunkSize: CHUNK_SIZE,
      totalChunks,
      uploadedChunks: [],
      status: 'active',
      tenantId,
      createdAt: session.createdAt,
    };
  }

  async uploadChunk(
    uploadId: string,
    chunkIndex: number,
    chunkData: Buffer
  ): Promise<ChunkResult> {
    const session = await this.prisma.uploadSession.findUnique({
      where: { id: uploadId },
    });

    if (!session) {
      throw new Error(`Upload session ${uploadId} not found`);
    }

    if (session.status !== 'active') {
      throw new Error(`Upload session ${uploadId} is ${session.status}`);
    }

    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      throw new Error(`Invalid chunk index ${chunkIndex}. Expected 0-${session.totalChunks - 1}`);
    }

    // Save chunk to temporary directory
    const chunkPath = join(UPLOAD_DIR, uploadId, `chunk_${chunkIndex}`);
    await writeFile(chunkPath, chunkData);

    // Update uploaded chunks list
    const uploadedChunks: number[] = JSON.parse(session.uploadedChunks as string);
    if (!uploadedChunks.includes(chunkIndex)) {
      uploadedChunks.push(chunkIndex);
      uploadedChunks.sort((a, b) => a - b);
    }

    await this.prisma.uploadSession.update({
      where: { id: uploadId },
      data: {
        uploadedChunks: JSON.stringify(uploadedChunks),
        updatedAt: new Date(),
      },
    });

    const remainingChunks = session.totalChunks - uploadedChunks.length;

    logger.info('Chunk uploaded', { uploadId, chunkIndex, remainingChunks });

    return {
      chunkIndex,
      received: true,
      uploadedChunks,
      remainingChunks,
    };
  }

  async finalizeUpload(uploadId: string): Promise<string> {
    const session = await this.prisma.uploadSession.findUnique({
      where: { id: uploadId },
    });

    if (!session) {
      throw new Error(`Upload session ${uploadId} not found`);
    }

    const uploadedChunks: number[] = JSON.parse(session.uploadedChunks as string);
    if (uploadedChunks.length !== session.totalChunks) {
      const missing = [];
      for (let i = 0; i < session.totalChunks; i++) {
        if (!uploadedChunks.includes(i)) missing.push(i);
      }
      throw new Error(`Missing chunks: ${missing.join(', ')}`);
    }

    // Merge all chunks into final file
    const chunks: Buffer[] = [];
    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = join(UPLOAD_DIR, uploadId, `chunk_${i}`);
      const chunkData = await readFile(chunkPath);
      chunks.push(chunkData);
    }

    const finalBuffer = Buffer.concat(chunks);

    // Store the final file (for now, write to local uploads directory)
    const finalDir = join(UPLOAD_DIR, 'completed');
    await mkdir(finalDir, { recursive: true });
    const finalPath = join(finalDir, `${uploadId}_${session.fileName}`);
    await writeFile(finalPath, finalBuffer);

    // Clean up temporary chunks
    const uploadDir = join(UPLOAD_DIR, uploadId);
    await rm(uploadDir, { recursive: true, force: true });

    // Update session status
    await this.prisma.uploadSession.update({
      where: { id: uploadId },
      data: {
        status: 'completed',
        filePath: finalPath,
        updatedAt: new Date(),
      },
    });

    logger.info('Upload finalized', { uploadId, fileName: session.fileName, size: finalBuffer.length });

    return finalPath;
  }

  async getUploadProgress(uploadId: string): Promise<UploadProgress> {
    const session = await this.prisma.uploadSession.findUnique({
      where: { id: uploadId },
    });

    if (!session) {
      throw new Error(`Upload session ${uploadId} not found`);
    }

    const uploadedChunks: number[] = JSON.parse(session.uploadedChunks as string);
    const percentage = session.totalChunks > 0
      ? Math.round((uploadedChunks.length / session.totalChunks) * 100)
      : 0;

    return {
      uploadId,
      uploadedChunks,
      totalChunks: session.totalChunks,
      percentage,
      status: session.status,
    };
  }

  async resumeUpload(uploadId: string): Promise<UploadSession> {
    const session = await this.prisma.uploadSession.findUnique({
      where: { id: uploadId },
    });

    if (!session) {
      throw new Error(`Upload session ${uploadId} not found`);
    }

    if (session.status !== 'active') {
      throw new Error(`Upload session ${uploadId} cannot be resumed (status: ${session.status})`);
    }

    const uploadedChunks: number[] = JSON.parse(session.uploadedChunks as string);

    return {
      uploadId: session.id,
      fileName: session.fileName,
      fileSize: session.fileSize,
      mimeType: session.mimeType,
      chunkSize: session.chunkSize,
      totalChunks: session.totalChunks,
      uploadedChunks,
      status: 'active',
      tenantId: session.tenantId,
      createdAt: session.createdAt,
    };
  }

  async cleanupExpiredSessions(maxAgeHours: number = 24): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    const expired = await this.prisma.uploadSession.findMany({
      where: { status: 'active', createdAt: { lt: cutoff } },
    });

    for (const session of expired) {
      const uploadDir = join(UPLOAD_DIR, session.id);
      await rm(uploadDir, { recursive: true, force: true }).catch(() => {});

      await this.prisma.uploadSession.update({
        where: { id: session.id },
        data: { status: 'expired', updatedAt: new Date() },
      });
    }

    logger.info(`Cleaned up ${expired.length} expired upload sessions`);
    return expired.length;
  }
}
