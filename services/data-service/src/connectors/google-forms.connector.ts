/**
 * Google Forms Connector — Rasid Platform
 * تكامل كامل مع Google Forms API
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

export class GoogleFormsConnector implements IConnector {
  readonly type: ConnectorType = 'google_forms';
  readonly meta: ConnectorMeta = {
    type: 'google_forms',
    name: 'Google Forms',
    icon: 'google-forms',
    description: 'استيراد استجابات النماذج من Google Forms',
    requiredScopes: [
      'https://www.googleapis.com/auth/forms.responses.readonly',
      'https://www.googleapis.com/auth/forms.body.readonly',
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
      tokenType: credentials.token_type ?? 'Bearer',
    };
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      this.setCredentials(token);
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
      await drive.files.list({ pageSize: 1, q: "mimeType='application/vnd.google-apps.form'" });
      return true;
    } catch (error) {
      logger.warn('Google Forms connection test failed', { error });
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
      q: "mimeType='application/vnd.google-apps.form'",
      pageSize: options.pageSize ?? 50,
      pageToken: options.pageToken,
      fields: 'nextPageToken, files(id, name, modifiedTime, webViewLink)',
    });

    const files: ConnectorFile[] = (response.data.files ?? []).map((f) => ({
      id: f.id ?? '',
      name: f.name ?? '',
      mimeType: 'application/vnd.google-apps.form',
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
    throw new Error('Google Forms لا يدعم تحميل الملفات مباشرة — استخدم importData');
  }

  async importData(
    token: ConnectorToken,
    formId: string
  ): Promise<ConnectorImportResult> {
    this.setCredentials(token);
    const forms = google.forms({ version: 'v1', auth: this.oauth2Client });

    // Get form structure for question titles
    const formData = await forms.forms.get({ formId });
    const questionMap = new Map<string, string>();
    for (const item of formData.data.items ?? []) {
      if (item.questionItem?.question?.questionId) {
        questionMap.set(
          item.questionItem.question.questionId,
          item.title ?? `Question ${item.questionItem.question.questionId}`
        );
      }
    }

    // Fetch all responses with pagination
    const allRows: Record<string, unknown>[] = [];
    let pageToken: string | undefined;

    do {
      const responsesData = await forms.forms.responses.list({
        formId,
        pageToken,
      });

      for (const response of responsesData.data.responses ?? []) {
        const row: Record<string, unknown> = {
          responseId: response.responseId,
          createTime: response.createTime,
          lastSubmittedTime: response.lastSubmittedTime,
        };

        for (const [questionId, answer] of Object.entries(response.answers ?? {})) {
          const questionTitle = questionMap.get(questionId) ?? questionId;
          const textAnswers = answer.textAnswers?.answers?.map((a) => a.value).join(', ');
          row[questionTitle] = textAnswers ?? '';
        }

        allRows.push(row);
      }

      pageToken = responsesData.data.nextPageToken ?? undefined;
    } while (pageToken);

    const columns = ['responseId', 'createTime', 'lastSubmittedTime', ...Array.from(questionMap.values())];

    return {
      data: allRows,
      columns,
      rowCount: allRows.length,
      sourceId: formId,
      sourceName: formData.data.info?.title ?? `Form ${formId}`,
      sourceType: 'google_forms',
    };
  }

  private setCredentials(token: ConnectorToken): void {
    this.oauth2Client.setCredentials({
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
    });
  }
}
