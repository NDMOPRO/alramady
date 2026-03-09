import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const SearchInput = z.object({
  query: z.string().min(1).max(200),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(30).default(10),
  orientation: z.enum(['landscape', 'portrait', 'squarish']).optional(),
  locale: z.enum(['ar', 'en']).default('en'),
});

const DownloadInput = z.object({
  sourceUrl: z.string().url(),
  source: z.enum(['unsplash', 'pexels']),
  sourceId: z.string().min(1),
  presentationId: z.string().uuid(),
  photographer: z.string().optional(),
  photographerUrl: z.string().url().optional(),
});

type SearchPayload = z.infer<typeof SearchInput>;
type DownloadPayload = z.infer<typeof DownloadInput>;

interface MediaItem {
  id: string;
  source: 'unsplash' | 'pexels';
  thumbnailUrl: string;
  regularUrl: string;
  fullUrl: string;
  width: number;
  height: number;
  altText: string;
  photographer: string;
  photographerUrl: string;
  color: string | null;
}

interface SearchResult {
  items: MediaItem[];
  totalResults: number;
  page: number;
  perPage: number;
  totalPages: number;
}

interface StoredMedia {
  id: string;
  localPath: string;
  source: string;
  sourceId: string;
  presentationId: string;
  photographer: string | null;
  storedAt: Date;
}

export class MediaSearchService {
  private readonly prisma: PrismaClient;
  private readonly unsplashAccessKey: string;
  private readonly pexelsApiKey: string;
  private readonly storageBasePath: string;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();

    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
    const pexelsKey = process.env.PEXELS_API_KEY;

    if (!unsplashKey) {
      throw new Error('Missing UNSPLASH_ACCESS_KEY environment variable');
    }

    if (!pexelsKey) {
      throw new Error('Missing PEXELS_API_KEY environment variable');
    }

    this.unsplashAccessKey = unsplashKey;
    this.pexelsApiKey = pexelsKey;
    this.storageBasePath = process.env.MEDIA_STORAGE_PATH ?? '/data/media';
  }

  async searchUnsplash(input: SearchPayload): Promise<SearchResult> {
    const validated = SearchInput.parse(input);

    const params = new URLSearchParams({
      query: validated.query,
      page: validated.page.toString(),
      per_page: validated.perPage.toString(),
    });

    if (validated.orientation) {
      params.set('orientation', validated.orientation);
    }

    const response = await fetch(
      `https://api.unsplash.com/search/photos?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Client-ID ${this.unsplashAccessKey}`,
          'Accept-Version': 'v1',
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Unsplash API error (${response.status}): ${errorBody}`
      );
    }

    const data = await response.json() as {
      total: number;
      total_pages: number;
      results: Array<{
        id: string;
        width: number;
        height: number;
        color: string | null;
        alt_description: string | null;
        description: string | null;
        urls: {
          thumb: string;
          regular: string;
          full: string;
        };
        user: {
          name: string;
          links: { html: string };
        };
      }>;
    };

    const items: MediaItem[] = data.results.map((photo) => ({
      id: photo.id,
      source: 'unsplash' as const,
      thumbnailUrl: photo.urls.thumb,
      regularUrl: photo.urls.regular,
      fullUrl: photo.urls.full,
      width: photo.width,
      height: photo.height,
      altText: photo.alt_description ?? photo.description ?? validated.query,
      photographer: photo.user.name,
      photographerUrl: photo.user.links.html,
      color: photo.color,
    }));

    return {
      items,
      totalResults: data.total,
      page: validated.page,
      perPage: validated.perPage,
      totalPages: data.total_pages,
    };
  }

  async searchPexels(input: SearchPayload): Promise<SearchResult> {
    const validated = SearchInput.parse(input);

    const params = new URLSearchParams({
      query: validated.query,
      page: validated.page.toString(),
      per_page: validated.perPage.toString(),
    });

    if (validated.orientation) {
      params.set('orientation', validated.orientation);
    }

    if (validated.locale !== 'en') {
      params.set('locale', validated.locale);
    }

    const response = await fetch(
      `https://api.pexels.com/v1/search?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Authorization: this.pexelsApiKey,
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Pexels API error (${response.status}): ${errorBody}`
      );
    }

    const data = await response.json() as {
      total_results: number;
      page: number;
      per_page: number;
      photos: Array<{
        id: number;
        width: number;
        height: number;
        avg_color: string | null;
        alt: string | null;
        photographer: string;
        photographer_url: string;
        src: {
          tiny: string;
          medium: string;
          original: string;
          large: string;
        };
      }>;
    };

    const items: MediaItem[] = data.photos.map((photo) => ({
      id: photo.id.toString(),
      source: 'pexels' as const,
      thumbnailUrl: photo.src.tiny,
      regularUrl: photo.src.medium,
      fullUrl: photo.src.original,
      width: photo.width,
      height: photo.height,
      altText: photo.alt ?? validated.query,
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      color: photo.avg_color,
    }));

    const totalPages = Math.ceil(data.total_results / validated.perPage);

    return {
      items,
      totalResults: data.total_results,
      page: validated.page,
      perPage: validated.perPage,
      totalPages,
    };
  }

  async searchAll(input: SearchPayload): Promise<{
    unsplash: SearchResult;
    pexels: SearchResult;
    combined: MediaItem[];
  }> {
    const validated = SearchInput.parse(input);

    const [unsplashResult, pexelsResult] = await Promise.all([
      this.searchUnsplash(validated),
      this.searchPexels(validated),
    ]);

    const combined: MediaItem[] = [];
    const maxLen = Math.max(unsplashResult.items.length, pexelsResult.items.length);

    for (let i = 0; i < maxLen; i++) {
      if (i < unsplashResult.items.length) {
        combined.push(unsplashResult.items[i]);
      }
      if (i < pexelsResult.items.length) {
        combined.push(pexelsResult.items[i]);
      }
    }

    return {
      unsplash: unsplashResult,
      pexels: pexelsResult,
      combined,
    };
  }

  async downloadAndStore(input: DownloadPayload): Promise<StoredMedia> {
    const validated = DownloadInput.parse(input);

    const existing = await this.prisma.mediaAsset.findFirst({
      where: {
        source: validated.source,
        sourceId: validated.sourceId,
        presentationId: validated.presentationId,
      },
    });

    if (existing) {
      return {
        id: existing.id,
        localPath: existing.localPath,
        source: existing.source,
        sourceId: existing.sourceId,
        presentationId: existing.presentationId,
        photographer: existing.photographer,
        storedAt: existing.createdAt,
      };
    }

    const headers: Record<string, string> = {};

    if (validated.source === 'unsplash') {
      headers['Authorization'] = `Client-ID ${this.unsplashAccessKey}`;
    } else {
      headers['Authorization'] = this.pexelsApiKey;
    }

    const response = await fetch(validated.sourceUrl, { headers });

    if (!response.ok) {
      throw new Error(
        `Failed to download media from ${validated.source} (${response.status})`
      );
    }

    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    const extension = this.getExtensionFromMime(contentType);

    const fileHash = crypto.randomBytes(16).toString('hex');
    const fileName = `${validated.source}_${validated.sourceId}_${fileHash}${extension}`;
    const dirPath = path.join(
      this.storageBasePath,
      validated.presentationId
    );
    const filePath = path.join(dirPath, fileName);

    await mkdir(dirPath, { recursive: true });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await writeFile(filePath, buffer);

    const asset = await this.prisma.mediaAsset.create({
      data: {
        source: validated.source,
        sourceId: validated.sourceId,
        sourceUrl: validated.sourceUrl,
        localPath: filePath,
        presentationId: validated.presentationId,
        mimeType: contentType,
        fileSize: buffer.byteLength,
        photographer: validated.photographer ?? null,
        photographerUrl: validated.photographerUrl ?? null,
      },
    });

    return {
      id: asset.id,
      localPath: asset.localPath,
      source: asset.source,
      sourceId: asset.sourceId,
      presentationId: asset.presentationId,
      photographer: asset.photographer,
      storedAt: asset.createdAt,
    };
  }

  private getExtensionFromMime(mimeType: string): string {
    const mimeMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/svg+xml': '.svg',
      'image/avif': '.avif',
    };

    return mimeMap[mimeType] ?? '.jpg';
  }
}
