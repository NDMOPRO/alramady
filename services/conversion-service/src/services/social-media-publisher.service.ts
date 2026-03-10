import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
// @ts-expect-error uuid types not installed
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

// ─── Logger ─────────────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'conversion-service', module: 'social-media-publisher' },
  transports: [new winston.transports.Console()],
});

// ─── Interfaces ──────────────────────────────────────────────────────────────

export type SocialPlatform = 'twitter' | 'linkedin' | 'instagram';

export interface SocialContent {
  text: string;
  imageUrl?: string;
  imageBuffer?: Buffer;
  link?: string;
  hashtags?: string[];
  altText?: string;
}

export interface PublishResult {
  postId: string;
  platform: SocialPlatform;
  externalId: string | null;
  externalUrl: string | null;
  status: 'published' | 'failed';
  publishedAt: Date;
}

export interface ScheduledPostResult {
  scheduleId: string;
  platforms: SocialPlatform[];
  scheduledAt: Date;
  status: 'scheduled' | 'cancelled' | 'published' | 'failed';
}

export interface PostAnalytics {
  postId: string;
  platform: SocialPlatform;
  likes: number;
  shares: number;
  comments: number;
  impressions: number;
  clicks: number;
  engagementRate: number;
  fetchedAt: Date;
}

export interface PublishHistoryResult {
  posts: Array<{
    id: string;
    platform: SocialPlatform;
    text: string;
    externalId: string | null;
    externalUrl: string | null;
    status: string;
    publishedAt: Date;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export interface GeneratedSocialContent {
  text: string;
  hashtags: string[];
  platform: SocialPlatform;
  characterCount: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class SocialMediaPublisherService {
  private static readonly PAGE_SIZE = 20;
  private static readonly TWITTER_CHAR_LIMIT = 280;
  private static readonly LINKEDIN_CHAR_LIMIT = 3000;
  private static readonly INSTAGRAM_CAPTION_LIMIT = 2200;

  private readonly openai: OpenAI;

  // Prisma client with dynamic model access for social media models
  private db: any;

  constructor(private prisma: PrismaClient) {
    this.db = prisma as any;
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }

  private async getOAuthConfig(platform: SocialPlatform, tenantId: string): Promise<Record<string, string>> {
    const config = await this.db.socialOAuthConfig.findFirst({
      where: { tenantId, platform, active: true },
    });

    if (!config) {
      throw new Error(`No OAuth configuration found for ${platform} in tenant ${tenantId}. Please connect your ${platform} account.`);
    }

    return {
      accessToken: config.accessToken,
      refreshToken: config.refreshToken || '',
      accountId: config.accountId || '',
      pageId: config.pageId || '',
    };
  }

  async publishToTwitter(content: SocialContent, tenantId: string): Promise<PublishResult> {
    const postId = uuidv4();
    logger.info('Publishing to Twitter/X', { postId, tenantId });

    const oauth = await this.getOAuthConfig('twitter', tenantId);
    let mediaId: string | null = null;

    if (content.imageUrl || content.imageBuffer) {
      mediaId = await this.uploadTwitterMedia(content, oauth.accessToken);
    }

    const tweetText = this.truncateText(
      content.hashtags
        ? `${content.text}\n\n${content.hashtags.map((h) => `#${h}`).join(' ')}`
        : content.text,
      SocialMediaPublisherService.TWITTER_CHAR_LIMIT,
    );

    const tweetPayload: Record<string, unknown> = { text: tweetText };
    if (mediaId) {
      tweetPayload.media = { media_ids: [mediaId] };
    }

    const response = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${oauth.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tweetPayload),
    });

    const data = await response.json() as {
      data?: { id: string; text: string };
      errors?: Array<{ message: string }>;
    };

    const status: 'published' | 'failed' = response.ok && data.data ? 'published' : 'failed';
    const externalId = data.data?.id || null;
    const externalUrl = externalId ? `https://twitter.com/i/web/status/${externalId}` : null;

    if (!response.ok) {
      logger.error('Twitter publish failed', { postId, errors: data.errors });
    }

    await this.db.socialPost.create({
      data: {
        id: postId,
        tenantId,
        platform: 'twitter',
        text: tweetText,
        imageUrl: content.imageUrl || null,
        externalId,
        externalUrl,
        status,
        failedReason: status === 'failed' ? (data.errors?.[0]?.message || 'Unknown error') : null,
        publishedAt: status === 'published' ? new Date() : null,
        createdAt: new Date(),
      },
    });

    return {
      postId,
      platform: 'twitter',
      externalId,
      externalUrl,
      status,
      publishedAt: new Date(),
    };
  }

  private async uploadTwitterMedia(content: SocialContent, accessToken: string): Promise<string | null> {
    let imageData: Buffer;

    if (content.imageBuffer) {
      imageData = content.imageBuffer;
    } else if (content.imageUrl) {
      const imgResponse = await fetch(content.imageUrl);
      if (!imgResponse.ok) {
        logger.error('Failed to download image for Twitter', { imageUrl: content.imageUrl });
        return null;
      }
      imageData = Buffer.from(await imgResponse.arrayBuffer());
    } else {
      return null;
    }

    const initResponse = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        command: 'INIT',
        total_bytes: imageData.length.toString(),
        media_type: 'image/png',
      }),
    });

    const initData = await initResponse.json() as { media_id_string?: string };
    if (!initData.media_id_string) {
      logger.error('Twitter media INIT failed');
      return null;
    }

    const mediaId = initData.media_id_string;

    const formData = new FormData();
    formData.append('command', 'APPEND');
    formData.append('media_id', mediaId);
    formData.append('segment_index', '0');
    formData.append('media_data', imageData.toString('base64'));

    await fetch('https://upload.twitter.com/1.1/media/upload.json', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` },
      body: formData,
    });

    await fetch('https://upload.twitter.com/1.1/media/upload.json', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        command: 'FINALIZE',
        media_id: mediaId,
      }),
    });

    if (content.altText) {
      await fetch('https://upload.twitter.com/1.1/media/metadata/create.json', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          media_id: mediaId,
          alt_text: { text: content.altText.substring(0, 1000) },
        }),
      });
    }

    return mediaId;
  }

  async publishToLinkedIn(content: SocialContent, tenantId: string): Promise<PublishResult> {
    const postId = uuidv4();
    logger.info('Publishing to LinkedIn', { postId, tenantId });

    const oauth = await this.getOAuthConfig('linkedin', tenantId);
    const authorUrn = `urn:li:person:${oauth.accountId}`;

    const postText = this.truncateText(
      content.hashtags
        ? `${content.text}\n\n${content.hashtags.map((h) => `#${h}`).join(' ')}`
        : content.text,
      SocialMediaPublisherService.LINKEDIN_CHAR_LIMIT,
    );

    let imageAsset: string | null = null;
    if (content.imageUrl || content.imageBuffer) {
      imageAsset = await this.uploadLinkedInImage(authorUrn, content, oauth.accessToken);
    }

    const sharePayload: Record<string, unknown> = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: postText },
          shareMediaCategory: imageAsset ? 'IMAGE' : 'NONE',
          media: imageAsset
            ? [{
                status: 'READY',
                media: imageAsset,
                description: { text: content.altText || '' },
              }]
            : [],
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${oauth.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(sharePayload),
    });

    const status: 'published' | 'failed' = response.ok ? 'published' : 'failed';
    let externalId: string | null = null;
    let externalUrl: string | null = null;

    if (response.ok) {
      const headerLocation = response.headers.get('x-restli-id');
      externalId = headerLocation || null;
      if (externalId) {
        externalUrl = `https://www.linkedin.com/feed/update/${externalId}`;
      }
    } else {
      const errorData = await response.json() as { message?: string };
      logger.error('LinkedIn publish failed', { postId, error: errorData.message });
    }

    await this.db.socialPost.create({
      data: {
        id: postId,
        tenantId,
        platform: 'linkedin',
        text: postText,
        imageUrl: content.imageUrl || null,
        externalId,
        externalUrl,
        status,
        publishedAt: status === 'published' ? new Date() : null,
        createdAt: new Date(),
      },
    });

    return { postId, platform: 'linkedin', externalId, externalUrl, status, publishedAt: new Date() };
  }

  private async uploadLinkedInImage(
    authorUrn: string,
    content: SocialContent,
    accessToken: string,
  ): Promise<string | null> {
    const registerResponse = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: authorUrn,
          serviceRelationships: [{
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent',
          }],
        },
      }),
    });

    const registerData = await registerResponse.json() as {
      value?: {
        uploadMechanism?: {
          'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'?: {
            uploadUrl: string;
          };
        };
        asset?: string;
      };
    };

    const uploadUrl = registerData.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
    const asset = registerData.value?.asset;

    if (!uploadUrl || !asset) {
      logger.error('Failed to register LinkedIn upload');
      return null;
    }

    let imageData: Buffer;
    if (content.imageBuffer) {
      imageData = content.imageBuffer;
    } else if (content.imageUrl) {
      const imgResponse = await fetch(content.imageUrl);
      if (!imgResponse.ok) return null;
      imageData = Buffer.from(await imgResponse.arrayBuffer());
    } else {
      return null;
    }

    await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'image/png',
      },
      body: imageData,
    });

    return asset;
  }

  async publishToInstagram(content: SocialContent, tenantId: string): Promise<PublishResult> {
    const postId = uuidv4();
    logger.info('Publishing to Instagram', { postId, tenantId });

    const oauth = await this.getOAuthConfig('instagram', tenantId);
    const igBusinessAccountId = oauth.pageId;

    if (!content.imageUrl) {
      throw new Error('Instagram posts require an image URL');
    }

    const caption = this.truncateText(
      content.hashtags
        ? `${content.text}\n\n${content.hashtags.map((h) => `#${h}`).join(' ')}`
        : content.text,
      SocialMediaPublisherService.INSTAGRAM_CAPTION_LIMIT,
    );

    const containerResponse = await fetch(
      `https://graph.facebook.com/v18.0/${igBusinessAccountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: content.imageUrl,
          caption,
          access_token: oauth.accessToken,
        }),
      },
    );

    const containerData = await containerResponse.json() as {
      id?: string;
      error?: { message: string };
    };

    if (!containerData.id) {
      logger.error('Instagram container creation failed', { error: containerData.error?.message });

      await this.db.socialPost.create({
        data: {
          id: postId,
          tenantId,
          platform: 'instagram',
          text: caption,
          imageUrl: content.imageUrl,
          status: 'failed',
          failedReason: containerData.error?.message || 'Container creation failed',
          createdAt: new Date(),
        },
      });

      return { postId, platform: 'instagram', externalId: null, externalUrl: null, status: 'failed', publishedAt: new Date() };
    }

    const publishResponse = await fetch(
      `https://graph.facebook.com/v18.0/${igBusinessAccountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerData.id,
          access_token: oauth.accessToken,
        }),
      },
    );

    const publishData = await publishResponse.json() as {
      id?: string;
      error?: { message: string };
    };

    const status: 'published' | 'failed' = publishData.id ? 'published' : 'failed';
    const externalId = publishData.id || null;
    const externalUrl = externalId ? `https://www.instagram.com/p/${externalId}/` : null;

    await this.db.socialPost.create({
      data: {
        id: postId,
        tenantId,
        platform: 'instagram',
        text: caption,
        imageUrl: content.imageUrl,
        externalId,
        externalUrl,
        status,
        failedReason: status === 'failed' ? (publishData.error?.message || 'Publish failed') : null,
        publishedAt: status === 'published' ? new Date() : null,
        createdAt: new Date(),
      },
    });

    return { postId, platform: 'instagram', externalId, externalUrl, status, publishedAt: new Date() };
  }

  async schedulePost(
    content: SocialContent,
    platforms: SocialPlatform[],
    scheduledAt: Date,
    tenantId: string,
  ): Promise<ScheduledPostResult> {
    const scheduleId = uuidv4();
    logger.info('Scheduling social post', { scheduleId, platforms, scheduledAt, tenantId });

    if (scheduledAt <= new Date()) {
      throw new Error('Scheduled time must be in the future');
    }

    if (platforms.length === 0) {
      throw new Error('At least one platform must be specified');
    }

    await this.db.scheduledPost.create({
      data: {
        id: scheduleId,
        tenantId,
        platforms: JSON.stringify(platforms),
        text: content.text,
        imageUrl: content.imageUrl || null,
        link: content.link || null,
        hashtags: content.hashtags ? JSON.stringify(content.hashtags) : null,
        altText: content.altText || null,
        scheduledAt,
        status: 'scheduled',
        createdAt: new Date(),
      },
    });

    logger.info('Post scheduled', { scheduleId, scheduledAt });

    return {
      scheduleId,
      platforms,
      scheduledAt,
      status: 'scheduled',
    };
  }

  async cancelScheduledPost(postId: string): Promise<ScheduledPostResult> {
    logger.info('Cancelling scheduled post', { postId });

    const post = await this.db.scheduledPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new Error(`Scheduled post ${postId} not found`);
    }

    if (post.status !== 'scheduled') {
      throw new Error(`Post ${postId} cannot be cancelled (current status: ${post.status})`);
    }

    await this.db.scheduledPost.update({
      where: { id: postId },
      data: { status: 'cancelled', updatedAt: new Date() },
    });

    return {
      scheduleId: postId,
      platforms: JSON.parse(post.platforms as string) as SocialPlatform[],
      scheduledAt: post.scheduledAt,
      status: 'cancelled',
    };
  }

  async getPublishHistory(
    tenantId: string,
    platform: SocialPlatform | null,
    page: number = 1,
  ): Promise<PublishHistoryResult> {
    const pageSize = SocialMediaPublisherService.PAGE_SIZE;
    const where: Record<string, unknown> = { tenantId };
    if (platform) {
      where.platform = platform;
    }

    const [posts, total] = await Promise.all([
      this.db.socialPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.socialPost.count({ where }),
    ]);

    return {
      posts: posts.map((p: any) => ({
        id: p.id,
        platform: p.platform as SocialPlatform,
        text: p.text,
        externalId: p.externalId,
        externalUrl: p.externalUrl,
        status: p.status,
        publishedAt: p.publishedAt || p.createdAt,
        createdAt: p.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async getPostAnalytics(postId: string): Promise<PostAnalytics> {
    logger.info('Fetching post analytics', { postId });

    const post = await this.db.socialPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new Error(`Post ${postId} not found`);
    }

    if (!post.externalId) {
      throw new Error(`Post ${postId} has no external ID (may not be published)`);
    }

    const platform = post.platform as SocialPlatform;
    const tenantId = post.tenantId;
    const oauth = await this.getOAuthConfig(platform, tenantId);

    let analytics: PostAnalytics = {
      postId,
      platform,
      likes: 0,
      shares: 0,
      comments: 0,
      impressions: 0,
      clicks: 0,
      engagementRate: 0,
      fetchedAt: new Date(),
    };

    if (platform === 'twitter') {
      const response = await fetch(
        `https://api.twitter.com/2/tweets/${post.externalId}?tweet.fields=public_metrics`,
        {
          headers: { 'Authorization': `Bearer ${oauth.accessToken}` },
        },
      );
      const data = await response.json() as {
        data?: {
          public_metrics?: {
            like_count: number;
            retweet_count: number;
            reply_count: number;
            impression_count: number;
          };
        };
      };
      const metrics = data.data?.public_metrics;
      if (metrics) {
        analytics = {
          ...analytics,
          likes: metrics.like_count,
          shares: metrics.retweet_count,
          comments: metrics.reply_count,
          impressions: metrics.impression_count,
          engagementRate: metrics.impression_count > 0
            ? ((metrics.like_count + metrics.retweet_count + metrics.reply_count) / metrics.impression_count) * 100
            : 0,
        };
      }
    } else if (platform === 'linkedin') {
      const response = await fetch(
        `https://api.linkedin.com/v2/socialActions/${post.externalId}`,
        {
          headers: {
            'Authorization': `Bearer ${oauth.accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
        },
      );
      const data = await response.json() as {
        likesSummary?: { totalLikes: number };
        commentsSummary?: { totalFirstLevelComments: number };
      };
      analytics = {
        ...analytics,
        likes: data.likesSummary?.totalLikes || 0,
        comments: data.commentsSummary?.totalFirstLevelComments || 0,
      };
    } else if (platform === 'instagram') {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${post.externalId}/insights?metric=impressions,reach,likes,comments,shares&access_token=${oauth.accessToken}`,
      );
      const data = await response.json() as {
        data?: Array<{ name: string; values: Array<{ value: number }> }>;
      };
      if (data.data) {
        for (const metric of data.data) {
          const value = metric.values?.[0]?.value || 0;
          if (metric.name === 'impressions') analytics.impressions = value;
          if (metric.name === 'likes') analytics.likes = value;
          if (metric.name === 'comments') analytics.comments = value;
          if (metric.name === 'shares') analytics.shares = value;
        }
        analytics.engagementRate = analytics.impressions > 0
          ? ((analytics.likes + analytics.comments + analytics.shares) / analytics.impressions) * 100
          : 0;
      }
    }

    analytics.engagementRate = Math.round(analytics.engagementRate * 100) / 100;

    await this.db.socialPost.update({
      where: { id: postId },
      data: {
        analyticsJson: JSON.stringify(analytics),
        analyticsUpdatedAt: new Date(),
      },
    });

    return analytics;
  }

  async generateSocialContent(
    sourceId: string,
    platform: SocialPlatform,
    tenantId: string,
  ): Promise<GeneratedSocialContent> {
    logger.info('Generating social content', { sourceId, platform, tenantId });

    const source = await this.db.report.findFirst({
      where: { id: sourceId, tenantId },
    });

    let sourceText: string;
    if (source) {
      sourceText = `Report Title: ${(source as Record<string, unknown>).title || 'Untitled'}\n\nContent: ${String((source as Record<string, unknown>).content || '').substring(0, 4000)}`;
    } else {
      const dashboard = await this.db.dashboard.findFirst({
        where: { id: sourceId, tenantId },
      });
      if (!dashboard) {
        throw new Error(`Source ${sourceId} not found in tenant ${tenantId}`);
      }
      sourceText = `Dashboard Title: ${(dashboard as Record<string, unknown>).title || 'Untitled'}\n\nDescription: ${String((dashboard as Record<string, unknown>).description || '').substring(0, 4000)}`;
    }

    const charLimit: Record<SocialPlatform, number> = {
      twitter: SocialMediaPublisherService.TWITTER_CHAR_LIMIT,
      linkedin: SocialMediaPublisherService.LINKEDIN_CHAR_LIMIT,
      instagram: SocialMediaPublisherService.INSTAGRAM_CAPTION_LIMIT,
    };

    const platformInstructions: Record<SocialPlatform, string> = {
      twitter: 'Write a concise, engaging tweet. Maximum 250 characters to leave room for hashtags. Be impactful and to the point.',
      linkedin: 'Write a professional LinkedIn post. Include key insights and a call to action. Be informative and authoritative.',
      instagram: 'Write an engaging Instagram caption. Be visual and conversational. Use line breaks for readability.',
    };

    const systemPrompt = `You are a social media content expert specializing in Arabic and English bilingual content for the Saudi market.
Generate content optimized for ${platform}.
${platformInstructions[platform]}
Character limit: ${charLimit[platform]}

Return a JSON object:
{
  "text": "<the post text>",
  "hashtags": ["<hashtag1>", "<hashtag2>", ...]
}
Include 3-7 relevant hashtags. Do not include # in the hashtag strings.
Return ONLY valid JSON.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate a ${platform} post based on this source:\n\n${sourceText}` },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty response');
    }

    const parsed = JSON.parse(content) as { text: string; hashtags: string[] };
    const text = this.truncateText(parsed.text || '', charLimit[platform]);
    const hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : [];

    logger.info('Social content generated', { platform, textLength: text.length, hashtagCount: hashtags.length });

    return {
      text,
      hashtags,
      platform,
      characterCount: text.length,
    };
  }

  private truncateText(text: string, limit: number): string {
    if (text.length <= limit) return text;
    return text.substring(0, limit - 3) + '...';
  }
}
