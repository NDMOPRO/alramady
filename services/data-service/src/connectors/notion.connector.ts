/**
 * Notion Connector — Rasid Platform
 * تكامل كامل مع Notion API
 */

import { Client } from '@notionhq/client';
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

interface NotionDatabase {
  id: string;
  title: string;
  description: string;
  url: string;
  properties: Record<string, { type: string; name: string }>;
}

export class NotionConnector implements IConnector {
  readonly type: ConnectorType = 'notion';
  readonly meta: ConnectorMeta = {
    type: 'notion',
    name: 'Notion',
    icon: 'notion',
    description: 'استيراد البيانات وقواعد البيانات من Notion',
    requiredScopes: [],
    authType: 'api_key',
  };

  private createClient(token: ConnectorToken): Client {
    return new Client({ auth: token.accessToken });
  }

  getAuthUrl(_state: string): string {
    // Notion uses integration tokens, no OAuth redirect needed for internal integrations
    return '';
  }

  async exchangeCode(code: string): Promise<ConnectorToken> {
    // For Notion, the code IS the integration token
    return {
      accessToken: code,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      tokenType: 'Bearer',
    };
  }

  async refreshAccessToken(_refreshToken: string): Promise<ConnectorToken> {
    throw new Error('Notion integration tokens do not expire — no refresh needed');
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const notion = this.createClient(token);
      await notion.users.me({});
      return true;
    } catch (error) {
      logger.warn('Notion connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const notion = this.createClient(token);
    const databases = await this.listDatabases(notion, options.pageToken);

    const files: ConnectorFile[] = databases.results.map((db) => ({
      id: db.id,
      name: db.title,
      mimeType: 'application/vnd.notion.database',
      size: 0,
      modifiedAt: new Date(),
      webUrl: db.url,
      isFolder: false,
    }));

    return {
      files,
      nextPageToken: databases.nextCursor ?? undefined,
    };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('Notion لا يدعم تحميل الملفات مباشرة — استخدم importData');
  }

  async importData(
    token: ConnectorToken,
    databaseId: string
  ): Promise<ConnectorImportResult> {
    const notion = this.createClient(token);
    const allRows: Record<string, unknown>[] = [];
    let columns: string[] = [];
    let hasMore = true;
    let startCursor: string | undefined;

    while (hasMore) {
      const response = await (notion.databases as unknown as { query: (args: { database_id: string; start_cursor?: string; page_size?: number }) => Promise<{ results: Array<Record<string, unknown>>; has_more: boolean; next_cursor: string | null }> }).query({
        database_id: databaseId,
        start_cursor: startCursor,
        page_size: 100,
      });

      for (const page of response.results) {
        if (!('properties' in page)) continue;
        const row: Record<string, unknown> = {};

        for (const [propName, propValue] of Object.entries(page.properties as Record<string, unknown>)) {
          if (!columns.includes(propName)) {
            columns.push(propName);
          }
          row[propName] = this.extractPropertyValue(propValue as Record<string, unknown>);
        }

        allRows.push(row);
      }

      hasMore = response.has_more;
      startCursor = response.next_cursor ?? undefined;
    }

    return {
      data: allRows,
      columns,
      rowCount: allRows.length,
      sourceId: databaseId,
      sourceName: `Notion Database ${databaseId}`,
      sourceType: 'notion',
    };
  }

  async fetchPage(
    token: ConnectorToken,
    pageId: string
  ): Promise<ConnectorImportResult> {
    const notion = this.createClient(token);

    const page = await notion.pages.retrieve({ page_id: pageId });
    const blocks = await this.fetchAllBlocks(notion, pageId);

    const data: Record<string, unknown>[] = [];
    const columns = ['type', 'content', 'hasChildren'];

    for (const block of blocks) {
      if (!('type' in block)) continue;
      const blockType = block.type as string;
      const blockData = (block as Record<string, unknown>)[blockType] as Record<string, unknown> | undefined;
      const richText = blockData?.rich_text as Array<{ plain_text: string }> | undefined;

      data.push({
        type: blockType,
        content: richText?.map((t) => t.plain_text).join('') ?? '',
        hasChildren: (block as Record<string, unknown>).has_children ?? false,
      });
    }

    const title = 'properties' in page
      ? this.extractPageTitle(page.properties)
      : pageId;

    return {
      data,
      columns,
      rowCount: data.length,
      sourceId: pageId,
      sourceName: String(title),
      sourceType: 'notion_page',
    };
  }

  private async listDatabases(
    notion: Client,
    startCursor?: string
  ): Promise<{ results: NotionDatabase[]; nextCursor: string | null }> {
    const response = await notion.search({
      filter: { property: 'object', value: 'database' as 'page' },
      start_cursor: startCursor,
      page_size: 100,
    });

    const results: NotionDatabase[] = (response.results as Array<Record<string, unknown>>)
      .filter((r) => r.object === 'database')
      .map((db) => ({
        id: db.id as string,
        title: 'title' in db ? (db.title as Array<{ plain_text: string }>)?.map((t) => t.plain_text).join('') : db.id as string,
        description: 'description' in db ? (db.description as Array<{ plain_text: string }>)?.map((t) => t.plain_text).join('') : '',
        url: 'url' in db ? (db.url as string) : '',
        properties: Object.fromEntries(
          Object.entries('properties' in db ? (db.properties as Record<string, unknown>) : {}).map(([key, val]) => [
            key,
            { type: (val as Record<string, string>).type, name: key },
          ])
        ),
      }));

    return { results, nextCursor: response.next_cursor };
  }

  private async fetchAllBlocks(
    notion: Client,
    blockId: string
  ): Promise<Array<Record<string, unknown>>> {
    const allBlocks: Array<Record<string, unknown>> = [];
    let hasMore = true;
    let startCursor: string | undefined;

    while (hasMore) {
      const response = await notion.blocks.children.list({
        block_id: blockId,
        start_cursor: startCursor,
        page_size: 100,
      });

      allBlocks.push(...(response.results as Array<Record<string, unknown>>));
      hasMore = response.has_more;
      startCursor = response.next_cursor ?? undefined;
    }

    return allBlocks;
  }

  private extractPropertyValue(prop: Record<string, unknown>): unknown {
    const type = prop.type as string;
    const value = prop[type];

    switch (type) {
      case 'title':
      case 'rich_text':
        return (value as Array<{ plain_text: string }>)?.map((t) => t.plain_text).join('') ?? '';
      case 'number':
        return value ?? null;
      case 'select':
        return (value as Record<string, string>)?.name ?? null;
      case 'multi_select':
        return (value as Array<{ name: string }>)?.map((s) => s.name).join(', ') ?? '';
      case 'date':
        return (value as Record<string, string>)?.start ?? null;
      case 'checkbox':
        return value ?? false;
      case 'url':
      case 'email':
      case 'phone_number':
        return value ?? null;
      case 'formula':
        return this.extractFormulaValue(value as Record<string, unknown>);
      case 'relation':
        return (value as Array<{ id: string }>)?.map((r) => r.id).join(', ') ?? '';
      case 'rollup':
        return this.extractRollupValue(value as Record<string, unknown>);
      case 'people':
        return (value as Array<{ name: string }>)?.map((p) => p.name).join(', ') ?? '';
      case 'files':
        return (value as Array<{ name: string }>)?.map((f) => f.name).join(', ') ?? '';
      case 'status':
        return (value as Record<string, string>)?.name ?? null;
      default:
        return JSON.stringify(value);
    }
  }

  private extractFormulaValue(formula: Record<string, unknown>): unknown {
    const formulaType = formula.type as string;
    return formula[formulaType] ?? null;
  }

  private extractRollupValue(rollup: Record<string, unknown>): unknown {
    const rollupType = rollup.type as string;
    if (rollupType === 'array') {
      return (rollup.array as Array<Record<string, unknown>>)?.map(
        (item) => this.extractPropertyValue(item)
      );
    }
    return rollup[rollupType] ?? null;
  }

  private extractPageTitle(properties: Record<string, unknown>): string {
    for (const prop of Object.values(properties)) {
      const p = prop as Record<string, unknown>;
      if (p.type === 'title') {
        const titleParts = p.title as Array<{ plain_text: string }> | undefined;
        return titleParts?.map((t) => t.plain_text).join('') ?? '';
      }
    }
    return 'Untitled';
  }
}
