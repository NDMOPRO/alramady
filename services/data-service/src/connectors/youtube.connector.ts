/**
 * YouTube Connector — Rasid Platform
 * استخراج بيانات الفيديو والنصوص من YouTube
 */

import { google } from 'googleapis';
import {
  IConnector,
  ConnectorType,
  ConnectorMeta,
  ConnectorToken,
  ConnectorFile,
  ConnectorListOptions,
  ConnectorListResult,
  ConnectorImportResult,
} from './connector.interface';
import { logger } from '../utils/logger';

interface YouTubeVideo {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  viewCount: string;
  likeCount: string;
  commentCount: string;
  duration: string;
  thumbnailUrl: string;
}

export class YouTubeConnector implements IConnector {
  readonly type: ConnectorType = 'youtube';
  readonly meta: ConnectorMeta = {
    type: 'youtube',
    name: 'YouTube',
    icon: 'youtube',
    description: 'استخراج بيانات الفيديو والنصوص والتحليلات من YouTube',
    requiredScopes: [],
    authType: 'api_key',
  };

  getAuthUrl(_state: string): string {
    return '';
  }

  async exchangeCode(code: string): Promise<ConnectorToken> {
    return {
      accessToken: code,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      tokenType: 'ApiKey',
    };
  }

  async refreshAccessToken(_refreshToken: string): Promise<ConnectorToken> {
    throw new Error('YouTube API keys do not expire');
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const youtube = google.youtube({ version: 'v3', auth: token.accessToken });
      await youtube.channels.list({ part: ['id'], mine: true }).catch(() => {
        // If mine fails (API key mode), try a public video
        return youtube.videos.list({ part: ['id'], id: ['dQw4w9WgXcQ'] });
      });
      return true;
    } catch (error) {
      logger.warn('YouTube connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    _token: ConnectorToken,
    _options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    return { files: [] };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('YouTube لا يدعم تحميل الملفات مباشرة — استخدم importData');
  }

  async importData(
    token: ConnectorToken,
    videoUrl: string
  ): Promise<ConnectorImportResult> {
    const videoId = this.extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    const metadata = await this.fetchVideoMetadata(token, videoId);
    const transcript = await this.extractTranscript(videoId);

    const data: Record<string, any>[] = [{
      videoId: metadata.videoId,
      title: metadata.title,
      description: metadata.description,
      channelTitle: metadata.channelTitle,
      publishedAt: metadata.publishedAt,
      viewCount: metadata.viewCount,
      likeCount: metadata.likeCount,
      commentCount: metadata.commentCount,
      duration: metadata.duration,
      thumbnailUrl: metadata.thumbnailUrl,
      transcript,
    }];

    return {
      data,
      columns: ['videoId', 'title', 'description', 'channelTitle', 'publishedAt', 'viewCount', 'likeCount', 'commentCount', 'duration', 'thumbnailUrl', 'transcript'],
      rowCount: 1,
      sourceId: videoId,
      sourceName: metadata.title,
      sourceType: 'youtube',
    };
  }

  async fetchVideoMetadata(
    token: ConnectorToken,
    videoId: string
  ): Promise<YouTubeVideo> {
    const youtube = google.youtube({ version: 'v3', auth: token.accessToken });

    const response = await youtube.videos.list({
      part: ['snippet', 'statistics', 'contentDetails'],
      id: [videoId],
    });

    const video = response.data.items?.[0];
    if (!video) {
      throw new Error(`Video not found: ${videoId}`);
    }

    return {
      videoId,
      title: video.snippet?.title ?? '',
      description: video.snippet?.description ?? '',
      channelTitle: video.snippet?.channelTitle ?? '',
      publishedAt: video.snippet?.publishedAt ?? '',
      viewCount: video.statistics?.viewCount ?? '0',
      likeCount: video.statistics?.likeCount ?? '0',
      commentCount: video.statistics?.commentCount ?? '0',
      duration: video.contentDetails?.duration ?? '',
      thumbnailUrl: video.snippet?.thumbnails?.maxres?.url ??
        video.snippet?.thumbnails?.high?.url ?? '',
    };
  }

  async extractTranscript(videoId: string, lang?: string): Promise<string> {
    try {
      // Use YouTube's timedtext API for transcript extraction
      const langParam = lang ?? 'ar';
      const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${langParam}&fmt=json3`;

      const res = await fetch(url);
      if (!res.ok) {
        // Try English if Arabic fails
        const fallbackRes = await fetch(
          `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`
        );
        if (!fallbackRes.ok) {
          logger.warn('No transcript available for video', { videoId });
          return '';
        }
        const fallbackData = await fallbackRes.json() as Record<string, any>;
        return this.parseTranscriptJson(fallbackData);
      }

      const data = await res.json() as Record<string, any>;
      return this.parseTranscriptJson(data);
    } catch (error) {
      logger.warn('Failed to extract transcript', { videoId, error });
      return '';
    }
  }

  private parseTranscriptJson(data: Record<string, any>): string {
    const events = (data.events as Array<Record<string, any>>) ?? [];
    const segments: string[] = [];

    for (const event of events) {
      const segs = (event.segs as Array<Record<string, string>>) ?? [];
      for (const seg of segs) {
        if (seg.utf8 && seg.utf8.trim() !== '\n') {
          segments.push(seg.utf8.trim());
        }
      }
    }

    return segments.join(' ');
  }

  private extractVideoId(url: string): string | null {
    // Handle various YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/, // Just the ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  }
}
