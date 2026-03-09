/**
 * Jira Connector — Rasid Platform
 * تكامل كامل مع Jira REST API v3
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

interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

interface JiraIssue {
  id: string;
  key: string;
  fields: Record<string, unknown>;
}

export class JiraConnector implements IConnector {
  readonly type: ConnectorType = 'jira';
  readonly meta: ConnectorMeta = {
    type: 'jira',
    name: 'Jira',
    icon: 'jira',
    description: 'استيراد المشاريع والمهام من Jira',
    requiredScopes: [],
    authType: 'api_key',
  };

  getAuthUrl(_state: string): string {
    return '';
  }

  async exchangeCode(code: string): Promise<ConnectorToken> {
    // code format: "host:email:apiToken"
    return {
      accessToken: code,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      tokenType: 'Basic',
    };
  }

  async refreshAccessToken(_refreshToken: string): Promise<ConnectorToken> {
    throw new Error('Jira API tokens do not expire');
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const { host, auth } = this.parseToken(token);
      const res = await fetch(`${host}/rest/api/3/myself`, {
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      });
      return res.ok;
    } catch (error) {
      logger.warn('Jira connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    _options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const projects = await this.listProjects(token);

    const files: ConnectorFile[] = projects.map((project) => ({
      id: project.key,
      name: `${project.name} (${project.key})`,
      mimeType: 'application/vnd.jira.project',
      size: 0,
      modifiedAt: new Date(),
      isFolder: true,
    }));

    return { files };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('Jira لا يدعم تحميل الملفات مباشرة — استخدم importData');
  }

  async importData(
    token: ConnectorToken,
    projectKey: string,
    options?: { jql?: string; maxResults?: number }
  ): Promise<ConnectorImportResult> {
    const issues = await this.fetchIssues(token, projectKey, options?.jql, options?.maxResults);

    const columns = [
      'key', 'summary', 'status', 'priority', 'assignee',
      'reporter', 'issueType', 'created', 'updated', 'resolution',
    ];

    const data = issues.map((issue) => ({
      key: issue.key,
      summary: issue.fields.summary ?? '',
      status: (issue.fields.status as Record<string, string>)?.name ?? '',
      priority: (issue.fields.priority as Record<string, string>)?.name ?? '',
      assignee: (issue.fields.assignee as Record<string, string>)?.displayName ?? 'Unassigned',
      reporter: (issue.fields.reporter as Record<string, string>)?.displayName ?? '',
      issueType: (issue.fields.issuetype as Record<string, string>)?.name ?? '',
      created: issue.fields.created ?? '',
      updated: issue.fields.updated ?? '',
      resolution: (issue.fields.resolution as Record<string, string>)?.name ?? 'Unresolved',
    }));

    return {
      data,
      columns,
      rowCount: data.length,
      sourceId: projectKey,
      sourceName: `Jira Project: ${projectKey}`,
      sourceType: 'jira',
    };
  }

  async listProjects(token: ConnectorToken): Promise<JiraProject[]> {
    const { host, auth } = this.parseToken(token);
    const res = await fetch(`${host}/rest/api/3/project`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Jira project list failed: ${res.status}`);
    }

    const projects = await res.json();
    return (projects as Array<Record<string, unknown>>).map((p) => ({
      id: String(p.id),
      key: String(p.key),
      name: String(p.name),
      projectTypeKey: String(p.projectTypeKey),
    }));
  }

  async fetchIssues(
    token: ConnectorToken,
    projectKey: string,
    jql?: string,
    maxResults?: number
  ): Promise<JiraIssue[]> {
    const { host, auth } = this.parseToken(token);
    const allIssues: JiraIssue[] = [];
    let startAt = 0;
    const limit = maxResults ?? 1000;
    const pageSize = 100;

    const query = jql ?? `project=${projectKey} ORDER BY created DESC`;

    while (startAt < limit) {
      const currentPageSize = Math.min(pageSize, limit - startAt);
      const params = new URLSearchParams({
        jql: query,
        startAt: String(startAt),
        maxResults: String(currentPageSize),
        fields: 'summary,status,priority,assignee,reporter,issuetype,created,updated,resolution',
      });

      const res = await fetch(`${host}/rest/api/3/search?${params}`, {
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`Jira issue search failed: ${res.status}`);
      }

      const data = await res.json() as Record<string, unknown>;
      const issues = (data.issues ?? []) as JiraIssue[];
      allIssues.push(...issues);

      if (issues.length < currentPageSize || allIssues.length >= ((data.total as number) ?? 0)) {
        break;
      }

      startAt += currentPageSize;
    }

    return allIssues;
  }

  async fetchSprints(
    token: ConnectorToken,
    boardId: string
  ): Promise<ConnectorImportResult> {
    const { host, auth } = this.parseToken(token);
    const allSprints: Record<string, unknown>[] = [];
    let startAt = 0;
    let isLast = false;

    while (!isLast) {
      const res = await fetch(
        `${host}/rest/agile/1.0/board/${boardId}/sprint?startAt=${startAt}&maxResults=50`,
        { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } }
      );

      if (!res.ok) {
        throw new Error(`Jira sprint fetch failed: ${res.status}`);
      }

      const data = await res.json() as Record<string, unknown>;
      const sprints = (data.values ?? []) as Array<Record<string, unknown>>;

      for (const sprint of sprints) {
        allSprints.push({
          id: sprint.id,
          name: sprint.name,
          state: sprint.state,
          startDate: sprint.startDate ?? null,
          endDate: sprint.endDate ?? null,
          completeDate: sprint.completeDate ?? null,
          goal: sprint.goal ?? '',
        });
      }

      isLast = (data.isLast as boolean) ?? true;
      startAt += sprints.length;
    }

    return {
      data: allSprints,
      columns: ['id', 'name', 'state', 'startDate', 'endDate', 'completeDate', 'goal'],
      rowCount: allSprints.length,
      sourceId: boardId,
      sourceName: `Jira Board ${boardId} Sprints`,
      sourceType: 'jira_sprints',
    };
  }

  private parseToken(token: ConnectorToken): { host: string; auth: string } {
    const parts = token.accessToken.split(':');
    if (parts.length < 3) {
      throw new Error('Invalid Jira token format. Expected "host:email:apiToken"');
    }
    // Host may contain protocol with ://, so reconstruct
    const host = parts.slice(0, -2).join(':');
    const email = parts[parts.length - 2];
    const apiToken = parts[parts.length - 1];
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    return { host, auth };
  }
}
