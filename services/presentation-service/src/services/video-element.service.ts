import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const VideoElementSchema = z.object({
  type: z.enum(['youtube', 'vimeo', 'direct']),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  startTime: z.number().int().min(0).optional(),
  endTime: z.number().int().min(1).optional(),
  autoplay: z.boolean().default(false),
  muted: z.boolean().default(false),
});

const AddVideoToSlideSchema = VideoElementSchema.extend({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().min(50),
  height: z.number().min(50),
});

interface VideoElement {
  type: 'youtube' | 'vimeo' | 'direct';
  url: string;
  thumbnailUrl?: string;
  startTime?: number;
  endTime?: number;
  autoplay?: boolean;
  muted?: boolean;
}

interface SlideVideoElement {
  id: string;
  presentationId: string;
  slideIndex: number;
  video: VideoElement;
  x: number;
  y: number;
  width: number;
  height: number;
  createdAt: Date;
}

const YOUTUBE_PATTERNS: ReadonlyArray<RegExp> = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
];

const VIMEO_PATTERNS: ReadonlyArray<RegExp> = [
  /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/,
  /(?:https?:\/\/)?player\.vimeo\.com\/video\/(\d+)/,
];

const DIRECT_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.avi'];

export class VideoElementService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  extractYouTubeId(url: string): string | null {
    const validated = z.string().min(1).parse(url);

    for (const pattern of YOUTUBE_PATTERNS) {
      const match = validated.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  private extractVimeoId(url: string): string | null {
    for (const pattern of VIMEO_PATTERNS) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  private isDirectVideoUrl(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return DIRECT_VIDEO_EXTENSIONS.some((ext) => lowerUrl.endsWith(ext));
  }

  parseVideoUrl(url: string): VideoElement {
    const validated = z.string().url().parse(url);

    const youtubeId = this.extractYouTubeId(validated);
    if (youtubeId) {
      return {
        type: 'youtube',
        url: validated,
        thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`,
        autoplay: false,
        muted: false,
      };
    }

    const vimeoId = this.extractVimeoId(validated);
    if (vimeoId) {
      return {
        type: 'vimeo',
        url: validated,
        thumbnailUrl: `https://vumbnail.com/${vimeoId}.jpg`,
        autoplay: false,
        muted: false,
      };
    }

    if (this.isDirectVideoUrl(validated)) {
      return {
        type: 'direct',
        url: validated,
        autoplay: false,
        muted: false,
      };
    }

    throw new Error(
      `Unsupported video URL format. Supported: YouTube, Vimeo, or direct video links (${DIRECT_VIDEO_EXTENSIONS.join(', ')})`
    );
  }

  async addVideoToSlide(
    presentationId: string,
    slideIndex: number,
    video: VideoElement & { x: number; y: number; width: number; height: number }
  ): Promise<SlideVideoElement> {
    const validatedPresentationId = z.string().uuid().parse(presentationId);
    const validatedSlideIndex = z.number().int().min(0).parse(slideIndex);
    const validatedVideo = AddVideoToSlideSchema.parse(video);

    const presentation = await this.prisma.presentation.findUnique({
      where: { id: validatedPresentationId },
      select: { id: true, slideCount: true },
    });

    if (!presentation) {
      throw new Error(`Presentation not found: ${validatedPresentationId}`);
    }

    if (validatedSlideIndex >= presentation.slideCount) {
      throw new Error(
        `Slide index ${validatedSlideIndex} out of range. Presentation has ${presentation.slideCount} slides.`
      );
    }

    const slide = await this.prisma.slide.findFirst({
      where: {
        presentationId: validatedPresentationId,
        order: validatedSlideIndex,
      },
    });

    if (!slide) {
      throw new Error(
        `Slide not found at index ${validatedSlideIndex} in presentation ${validatedPresentationId}`
      );
    }

    const existingContent = (slide.content as Record<string, unknown>) ?? {};
    const existingElements = Array.isArray(existingContent.elements)
      ? (existingContent.elements as Array<Record<string, unknown>>)
      : [];

    const embedHtml = this.generateEmbedHtml({
      type: validatedVideo.type,
      url: validatedVideo.url,
      thumbnailUrl: validatedVideo.thumbnailUrl,
      startTime: validatedVideo.startTime,
      endTime: validatedVideo.endTime,
      autoplay: validatedVideo.autoplay,
      muted: validatedVideo.muted,
    });

    const videoElement = {
      type: 'video',
      videoType: validatedVideo.type,
      url: validatedVideo.url,
      thumbnailUrl: validatedVideo.thumbnailUrl ?? null,
      startTime: validatedVideo.startTime ?? null,
      endTime: validatedVideo.endTime ?? null,
      autoplay: validatedVideo.autoplay,
      muted: validatedVideo.muted,
      embedHtml,
      x: validatedVideo.x,
      y: validatedVideo.y,
      width: validatedVideo.width,
      height: validatedVideo.height,
    };

    const updatedElements = [...existingElements, videoElement];

    const updatedSlide = await this.prisma.slide.update({
      where: { id: slide.id },
      data: {
        content: JSON.parse(JSON.stringify({
          ...existingContent,
          elements: updatedElements,
        })),
      },
    });

    return {
      id: updatedSlide.id,
      presentationId: validatedPresentationId,
      slideIndex: validatedSlideIndex,
      video: {
        type: validatedVideo.type,
        url: validatedVideo.url,
        thumbnailUrl: validatedVideo.thumbnailUrl,
        startTime: validatedVideo.startTime,
        endTime: validatedVideo.endTime,
        autoplay: validatedVideo.autoplay,
        muted: validatedVideo.muted,
      },
      x: validatedVideo.x,
      y: validatedVideo.y,
      width: validatedVideo.width,
      height: validatedVideo.height,
      createdAt: new Date(),
    };
  }

  generateEmbedHtml(video: VideoElement): string {
    const validated = VideoElementSchema.parse(video);

    switch (validated.type) {
      case 'youtube': {
        const videoId = this.extractYouTubeId(validated.url);
        if (!videoId) {
          throw new Error(`Could not extract YouTube video ID from: ${validated.url}`);
        }

        const params: Array<string> = [];
        if (validated.autoplay) params.push('autoplay=1');
        if (validated.muted) params.push('mute=1');
        if (validated.startTime !== undefined) params.push(`start=${validated.startTime}`);
        if (validated.endTime !== undefined) params.push(`end=${validated.endTime}`);
        params.push('rel=0');

        const queryString = params.length > 0 ? `?${params.join('&')}` : '';
        const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}${queryString}`;

        return [
          `<iframe src="${this.escapeAttr(embedUrl)}"`,
          ' width="100%" height="100%"',
          ' frameborder="0"',
          ' allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"',
          ' allowfullscreen',
          ' loading="lazy"',
          ' style="border: none; border-radius: 4px;"',
          '></iframe>',
        ].join('');
      }

      case 'vimeo': {
        const vimeoId = this.extractVimeoId(validated.url);
        if (!vimeoId) {
          throw new Error(`Could not extract Vimeo video ID from: ${validated.url}`);
        }

        const params: Array<string> = [];
        if (validated.autoplay) params.push('autoplay=1');
        if (validated.muted) params.push('muted=1');
        params.push('dnt=1');

        const queryString = params.length > 0 ? `?${params.join('&')}` : '';
        const embedUrl = `https://player.vimeo.com/video/${vimeoId}${queryString}`;

        return [
          `<iframe src="${this.escapeAttr(embedUrl)}"`,
          ' width="100%" height="100%"',
          ' frameborder="0"',
          ' allow="autoplay; fullscreen; picture-in-picture"',
          ' allowfullscreen',
          ' loading="lazy"',
          ' style="border: none; border-radius: 4px;"',
          '></iframe>',
        ].join('');
      }

      case 'direct': {
        const attributes: Array<string> = [
          `src="${this.escapeAttr(validated.url)}"`,
          'width="100%"',
          'height="100%"',
          'controls',
          'preload="metadata"',
          'style="border: none; border-radius: 4px; object-fit: contain;"',
        ];

        if (validated.autoplay) attributes.push('autoplay');
        if (validated.muted) attributes.push('muted');

        let videoTag = `<video ${attributes.join(' ')}>`;

        if (validated.url.endsWith('.mp4')) {
          videoTag += `<source src="${this.escapeAttr(validated.url)}" type="video/mp4">`;
        } else if (validated.url.endsWith('.webm')) {
          videoTag += `<source src="${this.escapeAttr(validated.url)}" type="video/webm">`;
        } else if (validated.url.endsWith('.ogg')) {
          videoTag += `<source src="${this.escapeAttr(validated.url)}" type="video/ogg">`;
        } else {
          videoTag += `<source src="${this.escapeAttr(validated.url)}">`;
        }

        videoTag += '</video>';
        return videoTag;
      }

      default:
        throw new Error(`Unsupported video type: ${String(validated.type)}`);
    }
  }

  async removeVideoFromSlide(
    presentationId: string,
    slideIndex: number,
    elementIndex: number
  ): Promise<{ removed: boolean }> {
    const validatedPresentationId = z.string().uuid().parse(presentationId);
    const validatedSlideIndex = z.number().int().min(0).parse(slideIndex);
    const validatedElementIndex = z.number().int().min(0).parse(elementIndex);

    const slide = await this.prisma.slide.findFirst({
      where: {
        presentationId: validatedPresentationId,
        order: validatedSlideIndex,
      },
    });

    if (!slide) {
      throw new Error(
        `Slide not found at index ${validatedSlideIndex} in presentation ${validatedPresentationId}`
      );
    }

    const existingContent = (slide.content as Record<string, unknown>) ?? {};
    const existingElements = Array.isArray(existingContent.elements)
      ? (existingContent.elements as Array<Record<string, unknown>>)
      : [];

    const videoElements = existingElements.filter((el) => el.type === 'video');

    if (validatedElementIndex >= videoElements.length) {
      throw new Error(
        `Video element index ${validatedElementIndex} out of range. Found ${videoElements.length} video elements.`
      );
    }

    let videoCount = 0;
    const updatedElements = existingElements.filter((el) => {
      if (el.type === 'video') {
        const shouldRemove = videoCount === validatedElementIndex;
        videoCount++;
        return !shouldRemove;
      }
      return true;
    });

    await this.prisma.slide.update({
      where: { id: slide.id },
      data: {
        content: JSON.parse(JSON.stringify({
          ...existingContent,
          elements: updatedElements,
        })),
      },
    });

    return { removed: true };
  }

  private escapeAttr(value: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return value.replace(/[&<>"']/g, (char) => map[char]);
  }
}
