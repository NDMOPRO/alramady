import { Client as MinioClient } from 'minio';
import sharp from 'sharp';
import * as mimeTypes from 'mime-types';
import { PrismaClient, LibraryAssetType } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const minio = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'rasid_minio',
  secretKey: process.env.MINIO_SECRET_KEY || 'rasid_minio_secret',
});

const BUCKET = process.env.MINIO_BUCKET || 'rasid-files';

export class AssetService {

  async ensureBucket() {
    const exists = await minio.bucketExists(BUCKET);
    if (!exists) {
      await minio.makeBucket(BUCKET);
      logger.info('Created MinIO bucket', { bucket: BUCKET });
    }
  }

  async uploadAsset(file: Buffer, filename: string, tenantId: string, userId: string, metadata?: Record<string, string>) {
    await this.ensureBucket();

    const mimeType = mimeTypes.lookup(filename) || 'application/octet-stream';
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const assetType = this.detectAssetType(ext);
    const objectKey = `${tenantId}/${Date.now()}-${filename}`;

    await minio.putObject(BUCKET, objectKey, file, file.length, {
      'Content-Type': mimeType,
      ...metadata,
    });

    let thumbnailPath: string | null = null;
    if (['image', 'font', 'icon'].includes(assetType) && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'tiff'].includes(ext)) {
      try {
        const thumbnail = await sharp(file)
          .resize(200, 200, { fit: 'cover', withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer();

        const thumbKey = `${tenantId}/thumbnails/${Date.now()}-thumb-${filename.replace(/\.[^.]+$/, '.jpg')}`;
        await minio.putObject(BUCKET, thumbKey, thumbnail, thumbnail.length, { 'Content-Type': 'image/jpeg' });
        thumbnailPath = thumbKey;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.warn('Thumbnail generation failed', { filename, error: message });
      }
    }

    const asset = await prisma.libraryAsset.create({
      data: {
        tenantId,
        name: filename,
        type: assetType as LibraryAssetType,
        filePath: objectKey,
        fileSize: BigInt(file.length),
        mimeType,
        createdBy: userId,
      },
    });

    return {
      id: asset.id,
      name: asset.name,
      assetType,
      mimeType,
      sizeBytes: file.length,
      filePath: objectKey,
      thumbnailPath,
    };
  }

  async getAsset(assetId: string, tenantId: string) {
    const asset = await prisma.libraryAsset.findFirst({ where: { id: assetId, tenantId } });
    if (!asset) throw new Error('Asset not found');

    let signedUrl: string | null = null;
    if (asset.filePath) {
      try {
        signedUrl = await minio.presignedGetObject(BUCKET, asset.filePath, 3600);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.warn('Failed to generate signed URL', { assetId, error: message });
      }
    }

    return {
      id: asset.id,
      name: asset.name,
      assetType: asset.type,
      mimeType: asset.mimeType,
      sizeBytes: Number(asset.fileSize),
      signedUrl,
      createdAt: asset.createdAt,
    };
  }

  async listAssets(tenantId: string, options: { page?: number; limit?: number; search?: string; assetType?: string }) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };
    if (options.assetType) where.assetType = options.assetType;
    if (options.search) where.name = { contains: options.search, mode: 'insensitive' };

    const [assets, total] = await Promise.all([
      prisma.libraryAsset.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.libraryAsset.count({ where }),
    ]);

    return {
      data: assets.map((a: Record<string, unknown>) => ({ ...a, sizeBytes: Number(a.fileSize as bigint) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async deleteAsset(assetId: string, tenantId: string) {
    const asset = await prisma.libraryAsset.findFirst({ where: { id: assetId, tenantId } });
    if (!asset) throw new Error('Asset not found');

    if (asset.filePath) {
      try { await minio.removeObject(BUCKET, asset.filePath); } catch (e) { logger.warn('Failed to delete from MinIO', { assetId }); }
    }

    await prisma.libraryAsset.delete({ where: { id: assetId } });
    return { deleted: true, id: assetId };
  }

  async createFolder(name: string, parentId: string | null, tenantId: string) {
    const folder = await prisma.folder.create({
      data: { tenantId, name, parentId },
    });
    return folder;
  }

  async getFolderTree(tenantId: string) {
    const folders = await prisma.folder.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });

    const buildTree = (parentId: string | null): Array<{ id: string; name: string; children: unknown[] }> => {
      return folders
        .filter((f: { parentId: string | null; id: string; name: string }) => f.parentId === parentId)
        .map((f: { parentId: string | null; id: string; name: string }) => ({ id: f.id, name: f.name, children: buildTree(f.id) }));
    };

    return buildTree(null);
  }

  private detectAssetType(ext: string): string {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'tiff', 'bmp', 'ico'];
    const videoExts = ['mp4', 'webm', 'avi', 'mov', 'mkv'];
    const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac'];
    const fontExts = ['ttf', 'otf', 'woff', 'woff2', 'eot'];
    const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'];

    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    if (fontExts.includes(ext)) return 'font';
    if (docExts.includes(ext)) return 'document';
    if (ext === 'svg') return 'icon';
    return 'document';
  }
}

export const assetService = new AssetService();
