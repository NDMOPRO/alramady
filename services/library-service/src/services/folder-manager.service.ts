import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import winston from 'winston';

const prisma = new PrismaClient();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'folder-manager' },
  transports: [new winston.transports.Console()],
});

export async function createFolder(
  name: string,
  parentId: string | null,
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  if (!name || name.trim().length === 0) {
    throw new Error('Folder name cannot be empty');
  }

  const sanitizedName = name.trim();

  if (parentId) {
    const parentFolder = await prisma.folder.findUnique({
      where: { id: parentId },
    });

    if (!parentFolder) {
      throw new Error(`Parent folder not found with id: ${parentId}`);
    }

    if (parentFolder.tenantId !== tenantId) {
      throw new Error('Parent folder belongs to a different tenant');
    }
  }

  const existingFolder = await prisma.folder.findFirst({
    where: {
      name: sanitizedName,
      parentId: parentId,
      tenantId: tenantId,
      deletedAt: null,
    },
  });

  if (existingFolder) {
    throw new Error(
      `A folder named "${sanitizedName}" already exists in this location`
    );
  }

  const folderId = crypto.randomUUID();

  const folderPath = parentId
    ? await buildFolderPath(parentId, sanitizedName)
    : `/${sanitizedName}`;

  const folder = await prisma.folder.create({
    data: {
      id: folderId,
      name: sanitizedName,
      parentId: parentId,
      tenantId: tenantId,
      userId: userId,
      path: folderPath,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  logger.info('Folder created', {
    folderId: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    path: folderPath,
    tenantId,
  });

  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    path: folder.path,
    tenantId: folder.tenantId,
    createdAt: folder.createdAt,
  };
}

async function buildFolderPath(
  parentId: string,
  currentName: string
): Promise<string> {
  const pathSegments: string[] = [currentName];
  let currentParentId: string | null = parentId;

  while (currentParentId) {
    const parent: { name: string; parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: currentParentId },
      select: { name: true, parentId: true },
    });

    if (!parent) {
      break;
    }

    pathSegments.unshift(parent.name);
    currentParentId = parent.parentId;
  }

  return '/' + pathSegments.join('/');
}

interface FolderTreeNode {
  id: string;
  name: string;
  path: string | null;
  parentId: string | null;
  children: FolderTreeNode[];
  assetCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function getFolderTree(tenantId: string): Promise<FolderTreeNode[]> {
  const allFolders = await prisma.folder.findMany({
    where: {
      tenantId: tenantId,
      deletedAt: null,
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      path: true,
      parentId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const assetCounts = await prisma.libraryAsset.groupBy({
    by: ['folderId'],
    where: {
      tenantId: tenantId,
      deletedAt: null,
      folderId: { not: null },
    },
    _count: { id: true },
  });

  const countMap = new Map<string, number>();
  for (const entry of assetCounts) {
    if (entry.folderId) {
      countMap.set(entry.folderId, entry._count.id);
    }
  }

  const folderMap = new Map<string, FolderTreeNode>();

  for (const folder of allFolders) {
    folderMap.set(folder.id, {
      id: folder.id,
      name: folder.name,
      path: folder.path,
      parentId: folder.parentId,
      children: [],
      assetCount: countMap.get(folder.id) || 0,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    });
  }

  const rootNodes: FolderTreeNode[] = [];

  for (const folder of allFolders) {
    const node = folderMap.get(folder.id)!;

    if (folder.parentId && folderMap.has(folder.parentId)) {
      const parentNode = folderMap.get(folder.parentId)!;
      parentNode.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  logger.info('Folder tree built', {
    tenantId,
    totalFolders: allFolders.length,
    rootFolders: rootNodes.length,
  });

  return rootNodes;
}

export async function moveFolder(
  folderId: string,
  newParentId: string | null
): Promise<Record<string, unknown>> {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
  });

  if (!folder) {
    throw new Error(`Folder not found with id: ${folderId}`);
  }

  if (newParentId === folderId) {
    throw new Error('A folder cannot be moved into itself');
  }

  if (newParentId) {
    const targetParent = await prisma.folder.findUnique({
      where: { id: newParentId },
    });

    if (!targetParent) {
      throw new Error(`Target parent folder not found: ${newParentId}`);
    }

    let currentAncestorId: string | null = newParentId;
    const visited = new Set<string>();

    while (currentAncestorId) {
      if (currentAncestorId === folderId) {
        throw new Error(
          'Cannot move folder: would create a circular reference'
        );
      }

      if (visited.has(currentAncestorId)) {
        break;
      }

      visited.add(currentAncestorId);

      const ancestor: { parentId: string | null } | null = await prisma.folder.findUnique({
        where: { id: currentAncestorId },
        select: { parentId: true },
      });

      currentAncestorId = ancestor?.parentId || null;
    }
  }

  const previousParentId = folder.parentId;

  const newPath = newParentId
    ? await buildFolderPath(newParentId, folder.name)
    : `/${folder.name}`;

  const updatedFolder = await prisma.folder.update({
    where: { id: folderId },
    data: {
      parentId: newParentId,
      path: newPath,
      updatedAt: new Date(),
    },
  });

  logger.info('Folder moved', {
    folderId,
    previousParentId,
    newParentId,
    newPath,
  });

  return {
    id: updatedFolder.id,
    name: updatedFolder.name,
    previousParentId: previousParentId,
    newParentId: newParentId,
    path: updatedFolder.path,
    updatedAt: updatedFolder.updatedAt,
  };
}

export async function deleteFolder(folderId: string): Promise<Record<string, unknown>> {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
  });

  if (!folder) {
    throw new Error(`Folder not found with id: ${folderId}`);
  }

  const childFolders = await prisma.folder.findMany({
    where: {
      parentId: folderId,
      deletedAt: null,
    },
  });

  if (childFolders.length > 0) {
    await prisma.folder.updateMany({
      where: {
        parentId: folderId,
        deletedAt: null,
      },
      data: {
        parentId: folder.parentId,
        updatedAt: new Date(),
      },
    });

    logger.info(`Reassigned ${childFolders.length} child folders`, {
      folderId,
      newParentId: folder.parentId,
    });
  }

  await prisma.libraryAsset.updateMany({
    where: {
      folderId: folderId,
      deletedAt: null,
    },
    data: {
      folderId: folder.parentId,
      updatedAt: new Date(),
    },
  });

  const deletedFolder = await prisma.folder.update({
    where: { id: folderId },
    data: {
      deletedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  logger.info('Folder deleted', {
    folderId,
    reassignedChildren: childFolders.length,
    reassignedTo: folder.parentId,
  });

  return {
    id: deletedFolder.id,
    name: deletedFolder.name,
    deletedAt: deletedFolder.deletedAt,
    childrenReassignedTo: folder.parentId,
    childrenReassigned: childFolders.length,
    message: 'Folder deleted and children reassigned',
  };
}
