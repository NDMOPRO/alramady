/**
 * Typeform Connector — Rasid Platform
 * تكامل كامل مع Typeform API
 */

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

interface TypeformForm {
  id: string;
  title: string;
  lastUpdatedAt: string;
  createdAt: string;
  fields: Array<{ id: string; title: string; type: string }>;
}

export class TypeformConnector implements IConnector {
  readonly type: ConnectorType = 'typeform';
  readonly meta: ConnectorMeta = {
    type: 'typeform',
    name: 'Typeform',
    icon: 'typeform',
    description: 'استيراد استجابات النماذج من Typeform',
    requiredScopes: [],
    authType: 'api_key',
  };

  private readonly baseUrl = 'https://api.typeform.com';

  getAuthUrl(_state: string): string {
    return '';
  }

  async exchangeCode(code: string): Promise<ConnectorToken> {
    return {
      accessToken: code,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      tokenType: 'Bearer',
    };
  }

  async refreshAccessToken(_refreshToken: string): Promise<ConnectorToken> {
    throw new Error('Typeform personal tokens do not expire');
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/me`, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      return res.ok;
    } catch (error) {
      logger.warn('Typeform connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const forms = await this.listForms(token, options.pageSize);

    const files: ConnectorFile[] = forms.map((form) => ({
      id: form.id,
      name: form.title,
      mimeType: 'application/vnd.typeform.form',
      size: form.fields.length,
      modifiedAt: new Date(form.lastUpdatedAt),
      isFolder: false,
    }));

    return { files };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('Typeform لا يدعم تحميل الملفات مباشرة — استخدم importData');
  }

  async importData(
    token: ConnectorToken,
    formId: string
  ): Promise<ConnectorImportResult> {
    return this.fetchResponses(token, formId);
  }

  async listForms(
    token: ConnectorToken,
    pageSize?: number
  ): Promise<TypeformForm[]> {
    const res = await fetch(
      `${this.baseUrl}/forms?page_size=${pageSize ?? 50}`,
      {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      }
    );

    if (!res.ok) {
      throw new Error(`Typeform forms list failed: ${res.status}`);
    }

    const data = await res.json() as Record<string, unknown>;
    return ((data.items ?? []) as Array<Record<string, unknown>>).map((form) => ({
      id: String(form.id),
      title: String(form.title ?? ''),
      lastUpdatedAt: String(form.last_updated_at ?? ''),
      createdAt: String(form.created_at ?? ''),
      fields: ((form.fields ?? []) as Array<Record<string, unknown>>).map((f) => ({
        id: String(f.id),
        title: String(f.title ?? ''),
        type: String(f.type ?? ''),
      })),
    }));
  }

  async fetchResponses(
    token: ConnectorToken,
    formId: string
  ): Promise<ConnectorImportResult> {
    // First get form structure for field titles
    const formRes = await fetch(`${this.baseUrl}/forms/${formId}`, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });

    if (!formRes.ok) {
      throw new Error(`Typeform form fetch failed: ${formRes.status}`);
    }

    const formData = await formRes.json() as Record<string, unknown>;
    const fieldMap = new Map<string, string>();
    for (const field of ((formData.fields ?? []) as Array<Record<string, unknown>>)) {
      fieldMap.set(String(field.id), String(field.title ?? field.id));
    }

    // Fetch responses with pagination
    const allRows: Record<string, unknown>[] = [];
    let beforeToken: string | undefined;

    do {
      const params = new URLSearchParams({ page_size: '100' });
      if (beforeToken) params.set('before', beforeToken);

      const res = await fetch(
        `${this.baseUrl}/forms/${formId}/responses?${params}`,
        {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        }
      );

      if (!res.ok) {
        throw new Error(`Typeform responses fetch failed: ${res.status}`);
      }

      const data = await res.json() as Record<string, unknown>;
      const items = (data.items ?? []) as Array<Record<string, unknown>>;

      for (const response of items) {
        const row: Record<string, unknown> = {
          responseId: response.response_id ?? response.token,
          submittedAt: response.submitted_at,
          landedAt: response.landed_at,
        };

        for (const answer of (response.answers ?? []) as Array<Record<string, unknown>>) {
          const fieldId = (answer.field as Record<string, string>)?.id ?? '';
          const fieldTitle = fieldMap.get(fieldId) ?? fieldId;
          row[fieldTitle] = this.extractAnswerValue(answer);
        }

        allRows.push(row);
      }

      if (items.length < 100) break;
      beforeToken = String(items[items.length - 1]?.token ?? '');
    } while (beforeToken);

    const columns = ['responseId', 'submittedAt', 'landedAt', ...Array.from(fieldMap.values())];

    return {
      data: allRows,
      columns,
      rowCount: allRows.length,
      sourceId: formId,
      sourceName: String((formData as Record<string, unknown>).title ?? formId),
      sourceType: 'typeform',
    };
  }

  private extractAnswerValue(answer: Record<string, unknown>): unknown {
    const type = String(answer.type ?? '');
    switch (type) {
      case 'text':
      case 'email':
      case 'url':
      case 'file_url':
      case 'phone_number':
        return answer[type] ?? '';
      case 'number':
        return answer.number ?? 0;
      case 'boolean':
        return answer.boolean ?? false;
      case 'date':
        return answer.date ?? '';
      case 'choice':
        return (answer.choice as Record<string, string>)?.label ?? '';
      case 'choices': {
        const choices = answer.choices as Record<string, unknown>;
        return ((choices?.labels ?? []) as string[]).join(', ');
      }
      case 'payment':
        return (answer.payment as Record<string, unknown>)?.amount ?? 0;
      default:
        return JSON.stringify(answer[type] ?? '');
    }
  }
}
