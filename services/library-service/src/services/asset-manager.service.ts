import { Client as MinioClient } from 'minio';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import mime from 'mime-types';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import path from 'path';
import winston from 'winston';

const prisma = new PrismaClient();

const minioClient = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

const BUCKET_NAME = process.env.MINIO_BUCKET || 'rasid-library';
const THUMBNAIL_BUCKET = process.env.MINIO_THUMBNAIL_BUCKET || 'rasid-thumbnails';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'asset-manager' },
  transports: [new winston.transports.Console()],
});

function normalizeUploadedFilename(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) {
    return 'unnamed-file';
  }

  if (!/[ØÙÃÐÑ]/.test(trimmed)) {
    return trimmed;
  }

  try {
    const decoded = Buffer.from(trimmed, 'latin1').toString('utf8').trim();
    return decoded || trimmed;
  } catch {
    return trimmed;
  }
}

async function ensureBucketExists(bucketName: string): Promise<void> {
  const exists = await minioClient.bucketExists(bucketName);
  if (!exists) {
    await minioClient.makeBucket(bucketName, 'us-east-1');
    logger.info(`Bucket created: ${bucketName}`);
  }
}

export async function uploadAsset(
  file: Buffer,
  filename: string,
  metadata: { description?: string; tags?: string[] },
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  await ensureBucketExists(BUCKET_NAME);
  await ensureBucketExists(THUMBNAIL_BUCKET);

  const normalizedFilename = normalizeUploadedFilename(filename);

  const detectedType = await fileTypeFromBuffer(file);
  const extension = detectedType
    ? detectedType.ext
    : path.extname(normalizedFilename).replace('.', '') || 'bin';
  const mimeType = detectedType
    ? detectedType.mime
    : (mime.lookup(normalizedFilename) || 'application/octet-stream');

  const uniqueId = crypto.randomUUID();
  const timestamp = Date.now();
  const storageKey = `${tenantId}/${timestamp}-${uniqueId}.${extension}`;

  const fileSize = file.length;
  const checksum = crypto.createHash('sha256').update(file).digest('hex');

  const metaHeaders: Record<string, string> = {
    'Content-Type': mimeType as string,
    'X-Amz-Meta-Tenant': tenantId,
    'X-Amz-Meta-User': userId,
    'X-Amz-Meta-Original-Name': encodeURIComponent(normalizedFilename),
    'X-Amz-Meta-Checksum': checksum,
  };

  await minioClient.putObject(
    BUCKET_NAME,
    storageKey,
    file,
    fileSize,
    metaHeaders
  );

  logger.info(`File uploaded to MinIO: ${storageKey}`, {
    size: fileSize,
    mimeType,
    tenantId,
  });

  let thumbnailKey: string | null = null;
  const isImage = (mimeType as string).startsWith('image/');

  if (isImage) {
    try {
      const thumbnailBuffer = await generateThumbnail(file, 200);
      thumbnailKey = `${tenantId}/thumb-${timestamp}-${uniqueId}.png`;

      await minioClient.putObject(
        THUMBNAIL_BUCKET,
        thumbnailKey,
        thumbnailBuffer,
        thumbnailBuffer.length,
        { 'Content-Type': 'image/png' }
      );

      logger.info(`Thumbnail generated and uploaded: ${thumbnailKey}`);
    } catch (thumbError) {
      logger.warn('Thumbnail generation failed, continuing without thumbnail', {
        error: (thumbError as Error).message,
      });
    }
  }

  const assetRecord = await prisma.libraryAsset.create({
    data: {
      id: uniqueId,
      name: normalizedFilename,
      description: metadata.description || null,
      tags: metadata.tags || [],
      tenantId: tenantId,
      userId: userId,
      storageKey: storageKey,
      thumbnailKey: thumbnailKey,
      mimeType: mimeType as string,
      extension: extension,
      fileSize: fileSize,
      checksum: checksum,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  logger.info(`Asset record created in database: ${assetRecord.id}`, {
    filename,
    normalizedFilename,
    tenantId,
    userId,
  });

  return {
    id: assetRecord.id,
    name: assetRecord.name,
    description: assetRecord.description,
    tags: assetRecord.tags,
    mimeType: assetRecord.mimeType,
    extension: assetRecord.extension,
    fileSize: typeof assetRecord.fileSize === 'bigint' ? Number(assetRecord.fileSize) : assetRecord.fileSize,
    checksum: assetRecord.checksum,
    hasThumbnail: thumbnailKey !== null,
    createdAt: assetRecord.createdAt,
  };
}

export async function getAsset(assetId: string): Promise<Record<string, unknown>> {
  const asset = await prisma.libraryAsset.findUnique({
    where: { id: assetId },
  });

  if (!asset) {
    throw new Error(`Asset not found with id: ${assetId}`);
  }

  if (asset.deletedAt) {
    throw new Error(`Asset has been deleted: ${assetId}`);
  }

  const downloadUrl = await minioClient.presignedGetObject(
    BUCKET_NAME,
    asset.storageKey!,
    3600
  );

  let thumbnailUrl: string | null = null;
  if (asset.thumbnailKey) {
    thumbnailUrl = await minioClient.presignedGetObject(
      THUMBNAIL_BUCKET,
      asset.thumbnailKey,
      3600
    );
  }

  logger.info(`Asset retrieved with presigned URL: ${assetId}`, {
    storageKey: asset.storageKey,
    expiresIn: '1 hour',
  });

  return {
    id: asset.id,
    name: asset.name,
    description: asset.description,
    tags: asset.tags,
    mimeType: asset.mimeType,
    extension: asset.extension,
    fileSize:
      typeof asset.fileSize === 'bigint'
        ? Number(asset.fileSize)
        : asset.fileSize,
    checksum: asset.checksum,
    folderId: asset.folderId,
    downloadUrl: downloadUrl,
    thumbnailUrl: thumbnailUrl,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    tenantId: asset.tenantId,
    userId: asset.userId,
  };
}

export async function downloadAssetFile(
  assetId: string,
  tenantId: string
): Promise<{
  stream: NodeJS.ReadableStream;
  name: string;
  mimeType: string;
  fileSize: number;
}> {
  const asset = await prisma.libraryAsset.findFirst({
    where: {
      id: assetId,
      tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      mimeType: true,
      fileSize: true,
      storageKey: true,
    },
  });

  if (!asset || !asset.storageKey) {
    throw new Error(`Asset not found with id: ${assetId}`);
  }

  const stream = await minioClient.getObject(BUCKET_NAME, asset.storageKey);

  return {
    stream,
    name: asset.name,
    mimeType: asset.mimeType,
    fileSize:
      typeof asset.fileSize === 'bigint'
        ? Number(asset.fileSize)
        : asset.fileSize,
  };
}

export async function deleteAsset(
  assetId: string,
  userId: string
): Promise<Record<string, unknown>> {
  const asset = await prisma.libraryAsset.findUnique({
    where: { id: assetId },
  });

  if (!asset) {
    throw new Error(`Asset not found with id: ${assetId}`);
  }

  if (asset.deletedAt) {
    throw new Error(`Asset already deleted: ${assetId}`);
  }

  const updatedAsset = await prisma.libraryAsset.update({
    where: { id: assetId },
    data: {
      deletedAt: new Date(),
      deletedBy: userId,
      updatedAt: new Date(),
    },
  });

  try {
    await minioClient.removeObject(BUCKET_NAME, asset.storageKey!);
    logger.info(`Removed object from MinIO: ${asset.storageKey}`);

    if (asset.thumbnailKey) {
      await minioClient.removeObject(THUMBNAIL_BUCKET, asset.thumbnailKey);
      logger.info(`Removed thumbnail from MinIO: ${asset.thumbnailKey}`);
    }
  } catch (removeError) {
    logger.error('Failed to remove object from MinIO storage', {
      error: (removeError as Error).message,
      storageKey: asset.storageKey,
    });
  }

  logger.info(`Asset soft-deleted: ${assetId}`, { deletedBy: userId });

  return {
    id: updatedAsset.id,
    name: updatedAsset.name,
    deletedAt: updatedAsset.deletedAt,
    deletedBy: updatedAsset.deletedBy,
    message: 'Asset successfully deleted',
  };
}

export async function listAssets(
  tenantId: string,
  filters: { type?: string; search?: string; folderId?: string },
  pagination: { page: number; limit: number }
): Promise<Record<string, unknown>> {
  const page = Math.max(1, pagination.page);
  const limit = Math.min(100, Math.max(1, pagination.limit));
  const skip = (page - 1) * limit;

  const whereClause: Record<string, unknown> = {
    tenantId: tenantId,
    deletedAt: null,
  };

  if (filters.type) {
    whereClause.mimeType = {
      startsWith: filters.type,
    };
  }

  if (filters.folderId) {
    whereClause.folderId = filters.folderId;
  }

  if (filters.search) {
    whereClause.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const [assets, totalCount] = await Promise.all([
    prisma.libraryAsset.findMany({
      where: whereClause,
      skip: skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        tags: true,
        mimeType: true,
        extension: true,
        fileSize: true,
        folderId: true,
        thumbnailKey: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.libraryAsset.count({ where: whereClause }),
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  logger.info(`Listed assets for tenant ${tenantId}`, {
    page,
    limit,
    totalCount,
    filtersApplied: Object.keys(filters).filter(
      (k) => filters[k as keyof typeof filters] !== undefined
    ),
  });

  // Convert BigInt fields to Number for JSON serialization
  const serializedAssets = assets.map((a) => ({
    ...a,
    fileSize: typeof a.fileSize === 'bigint' ? Number(a.fileSize) : a.fileSize,
  }));

  return {
    data: serializedAssets,
    pagination: {
      page: page,
      limit: limit,
      totalCount: totalCount,
      totalPages: totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export async function searchAssets(
  query: string,
  tenantId: string
): Promise<Record<string, unknown>> {
  if (!query || query.trim().length === 0) {
    throw new Error('Search query cannot be empty');
  }

  const sanitizedQuery = query.trim().toLowerCase();

  const assets = await prisma.libraryAsset.findMany({
    where: {
      tenantId: tenantId,
      deletedAt: null,
      OR: [
        { name: { contains: sanitizedQuery, mode: 'insensitive' } },
        { description: { contains: sanitizedQuery, mode: 'insensitive' } },
        { tags: { array_contains: [sanitizedQuery] } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      description: true,
      tags: true,
      mimeType: true,
      extension: true,
      fileSize: true,
      folderId: true,
      thumbnailKey: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const scoredResults = assets.map((asset: Record<string, unknown>) => {
    let relevanceScore = 0;
    const nameLower = (String(asset.name || '')).toLowerCase();
    const descLower = (String(asset.description || '')).toLowerCase();

    if (nameLower === sanitizedQuery) {
      relevanceScore += 100;
    } else if (nameLower.startsWith(sanitizedQuery)) {
      relevanceScore += 75;
    } else if (nameLower.includes(sanitizedQuery)) {
      relevanceScore += 50;
    }

    if (descLower.includes(sanitizedQuery)) {
      relevanceScore += 25;
    }

    if (asset.tags && Array.isArray(asset.tags)) {
      const tagMatch = (asset.tags as string[]).some(
        (tag: string) => tag.toLowerCase() === sanitizedQuery
      );
      if (tagMatch) {
        relevanceScore += 60;
      }
    }

    return { ...asset, relevanceScore };
  });

  scoredResults.sort((a: Record<string, unknown>, b: Record<string, unknown>) => (b.relevanceScore as number) - (a.relevanceScore as number));

  logger.info(`Search completed for query: "${query}"`, {
    tenantId,
    resultsFound: scoredResults.length,
  });

  return {
    query: query,
    results: scoredResults,
    totalResults: scoredResults.length,
  };
}

export async function generateThumbnail(
  file: Buffer,
  size: number
): Promise<Buffer> {
  const targetSize = Math.min(Math.max(size, 32), 1024);

  const imageMetadata = await sharp(file).metadata();

  logger.info('Generating thumbnail', {
    originalWidth: imageMetadata.width,
    originalHeight: imageMetadata.height,
    originalFormat: imageMetadata.format,
    targetSize: targetSize,
  });

  const thumbnailBuffer = await sharp(file)
    .resize(targetSize, targetSize, {
      fit: 'cover',
      position: 'centre',
      withoutEnlargement: false,
    })
    .png({
      quality: 80,
      compressionLevel: 6,
      progressive: false,
    })
    .toBuffer();

  const thumbMeta = await sharp(thumbnailBuffer).metadata();

  logger.info('Thumbnail generated successfully', {
    thumbnailWidth: thumbMeta.width,
    thumbnailHeight: thumbMeta.height,
    thumbnailSize: thumbnailBuffer.length,
    format: 'png',
  });

  return thumbnailBuffer;
}

export async function moveAsset(
  assetId: string,
  folderId: string
): Promise<Record<string, unknown>> {
  const asset = await prisma.libraryAsset.findUnique({
    where: { id: assetId },
  });

  if (!asset) {
    throw new Error(`Asset not found with id: ${assetId}`);
  }

  if (asset.deletedAt) {
    throw new Error(`Cannot move a deleted asset: ${assetId}`);
  }

  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
  });

  if (!folder) {
    throw new Error(`Target folder not found with id: ${folderId}`);
  }

  const previousFolderId = asset.folderId;

  const updatedAsset = await prisma.libraryAsset.update({
    where: { id: assetId },
    data: {
      folderId: folderId,
      updatedAt: new Date(),
    },
  });

  logger.info(`Asset moved to new folder`, {
    assetId,
    previousFolderId,
    newFolderId: folderId,
  });

  return {
    id: updatedAsset.id,
    name: updatedAsset.name,
    previousFolderId: previousFolderId,
    newFolderId: folderId,
    updatedAt: updatedAsset.updatedAt,
  };
}
