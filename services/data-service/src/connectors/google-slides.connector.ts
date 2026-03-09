/**
 * Google Slides Connector — Rasid Platform
 * تكامل كامل مع Google Slides API
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
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

interface SlideElement {
  objectId: string;
  type: string;
  content: string;
  position: { x: number; y: number; width: number; height: number };
}

interface SlideData {
  slideId: string;
  slideIndex: number;
  elements: SlideElement[];
  speakerNotes: string;
}

export class GoogleSlidesConnector implements IConnector {
  readonly type: ConnectorType = 'google_slides';
  readonly meta: ConnectorMeta = {
    type: 'google_slides',
    name: 'Google Slides',
    icon: 'google-slides',
    description: 'استيراد العروض التقديمية من Google Slides',
    requiredScopes: [
      'https://www.googleapis.com/auth/presentations.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
    authType: 'oauth2',
  };

  private oauth2Client: OAuth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  getAuthUrl(state: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.meta.requiredScopes,
      prompt: 'consent',
      state,
    });
  }

  async exchangeCode(code: string): Promise<ConnectorToken> {
    const { tokens } = await this.oauth2Client.getToken(code);
    return {
      accessToken: tokens.access_token ?? '',
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600_000),
      tokenType: tokens.token_type ?? 'Bearer',
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<ConnectorToken> {
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await this.oauth2Client.refreshAccessToken();
    return {
      accessToken: credentials.access_token ?? '',
      refreshToken: credentials.refresh_token ?? refreshToken,
      expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600_000),
      tokenType: 'Bearer',
    };
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      this.setCredentials(token);
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
      await drive.files.list({
        pageSize: 1,
        q: "mimeType='application/vnd.google-apps.presentation'",
      });
      return true;
    } catch (error) {
      logger.warn('Google Slides connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    this.setCredentials(token);
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.presentation'",
      pageSize: options.pageSize ?? 50,
      pageToken: options.pageToken,
      fields: 'nextPageToken, files(id, name, modifiedTime, webViewLink)',
    });

    const files: ConnectorFile[] = (response.data.files ?? []).map((f) => ({
      id: f.id ?? '',
      name: f.name ?? '',
      mimeType: 'application/vnd.google-apps.presentation',
      size: 0,
      modifiedAt: new Date(f.modifiedTime ?? Date.now()),
      webUrl: f.webViewLink ?? undefined,
      isFolder: false,
    }));

    return {
      files,
      nextPageToken: response.data.nextPageToken ?? undefined,
    };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('Google Slides لا يدعم تحميل الملفات مباشرة — استخدم importData');
  }

  async importData(
    token: ConnectorToken,
    presentationId: string
  ): Promise<ConnectorImportResult> {
    const slides = await this.importPresentation(token, presentationId);

    const data: Record<string, unknown>[] = [];
    for (const slide of slides) {
      for (const element of slide.elements) {
        data.push({
          slideIndex: slide.slideIndex,
          slideId: slide.slideId,
          elementType: element.type,
          content: element.content,
          positionX: element.position.x,
          positionY: element.position.y,
          width: element.position.width,
          height: element.position.height,
          speakerNotes: slide.speakerNotes,
        });
      }
    }

    return {
      data,
      columns: ['slideIndex', 'slideId', 'elementType', 'content', 'positionX', 'positionY', 'width', 'height', 'speakerNotes'],
      rowCount: data.length,
      sourceId: presentationId,
      sourceName: `Google Slides Presentation`,
      sourceType: 'google_slides',
    };
  }

  async importPresentation(
    token: ConnectorToken,
    presentationId: string
  ): Promise<SlideData[]> {
    this.setCredentials(token);
    const slidesApi = google.slides({ version: 'v1', auth: this.oauth2Client });
    const presentation = await slidesApi.presentations.get({ presentationId });

    const slidesData: SlideData[] = [];

    for (let i = 0; i < (presentation.data.slides ?? []).length; i++) {
      const slide = presentation.data.slides![i];
      const elements: SlideElement[] = [];

      for (const element of slide.pageElements ?? []) {
        const transform = element.transform;
        const size = element.size;

        const position = {
          x: transform?.translateX ?? 0,
          y: transform?.translateY ?? 0,
          width: (size?.width?.magnitude ?? 0) * (transform?.scaleX ?? 1),
          height: (size?.height?.magnitude ?? 0) * (transform?.scaleY ?? 1),
        };

        let type = 'unknown';
        let content = '';

        if (element.shape?.text) {
          type = 'text';
          content = element.shape.text.textElements
            ?.map((te) => te.textRun?.content ?? '')
            .join('') ?? '';
        } else if (element.image) {
          type = 'image';
          content = element.image.sourceUrl ?? '';
        } else if (element.table) {
          type = 'table';
          content = JSON.stringify({
            rows: element.table.rows,
            columns: element.table.columns,
          });
        }

        elements.push({
          objectId: element.objectId ?? '',
          type,
          content: content.trim(),
          position,
        });
      }

      // Extract speaker notes
      const notesPage = slide.slideProperties?.notesPage;
      const speakerNotes = notesPage?.pageElements
        ?.find((el) => el.shape?.placeholder?.type === 'BODY')
        ?.shape?.text?.textElements
        ?.map((te) => te.textRun?.content ?? '')
        .join('') ?? '';

      slidesData.push({
        slideId: slide.objectId ?? '',
        slideIndex: i,
        elements,
        speakerNotes: speakerNotes.trim(),
      });
    }

    return slidesData;
  }

  private setCredentials(token: ConnectorToken): void {
    this.oauth2Client.setCredentials({
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
    });
  }
}
