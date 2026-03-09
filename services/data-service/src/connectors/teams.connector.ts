/**
 * Microsoft Teams Connector — Rasid Platform
 * تكامل كامل مع Microsoft Graph API for Teams
 */

import { Client as GraphClient } from '@microsoft/microsoft-graph-client';
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

interface TeamsTeam {
  id: string;
  displayName: string;
  description: string;
}

export class TeamsConnector implements IConnector {
  readonly type: ConnectorType = 'teams';
  readonly meta: ConnectorMeta = {
    type: 'teams',
    name: 'Microsoft Teams',
    icon: 'teams',
    description: 'استيراد الرسائل والفرق من Microsoft Teams',
    requiredScopes: ['Team.ReadBasic.All', 'Channel.ReadBasic.All', 'ChannelMessage.Read.All'],
    authType: 'oauth2',
  };

  private createGraphClient(token: ConnectorToken): GraphClient {
    return GraphClient.init({
      authProvider: (done) => done(null, token.accessToken),
    });
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? '',
      response_type: 'code',
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI ?? '',
      scope: this.meta.requiredScopes.join(' '),
      state,
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  }

  async exchangeCode(code: string): Promise<ConnectorToken> {
    const body = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? '',
      client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
      code,
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI ?? '',
      grant_type: 'authorization_code',
      scope: this.meta.requiredScopes.join(' '),
    });

    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) throw new Error(`Teams token exchange failed: ${res.status}`);

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string,
      expiresAt: new Date(Date.now() + ((data.expires_in as number) ?? 3600) * 1000),
      tokenType: (data.token_type as string) ?? 'Bearer',
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<ConnectorToken> {
    const body = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? '',
      client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: this.meta.requiredScopes.join(' '),
    });

    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) throw new Error(`Teams token refresh failed: ${res.status}`);

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string) ?? refreshToken,
      expiresAt: new Date(Date.now() + ((data.expires_in as number) ?? 3600) * 1000),
      tokenType: 'Bearer',
    };
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const client = this.createGraphClient(token);
      await client.api('/me/joinedTeams').top(1).get();
      return true;
    } catch (error) {
      logger.warn('Teams connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    token: ConnectorToken,
    _options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const teams = await this.listTeams(token);
    const files: ConnectorFile[] = teams.map((team) => ({
      id: team.id,
      name: team.displayName,
      mimeType: 'application/vnd.teams.team',
      size: 0,
      modifiedAt: new Date(),
      isFolder: true,
    }));
    return { files };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('Teams لا يدعم تحميل الملفات مباشرة — استخدم importData');
  }

  async importData(
    token: ConnectorToken,
    teamChannelId: string
  ): Promise<ConnectorImportResult> {
    // teamChannelId format: "teamId:channelId"
    const [teamId, channelId] = teamChannelId.split(':');
    if (!teamId || !channelId) {
      throw new Error('Invalid team channel ID format. Expected "teamId:channelId"');
    }
    return this.fetchChannelMessages(token, teamId, channelId);
  }

  async listTeams(token: ConnectorToken): Promise<TeamsTeam[]> {
    const client = this.createGraphClient(token);
    const response = await client.api('/me/joinedTeams').get();

    return (response.value ?? []).map((team: Record<string, unknown>) => ({
      id: String(team.id),
      displayName: String(team.displayName ?? ''),
      description: String(team.description ?? ''),
    }));
  }

  async listChannels(
    token: ConnectorToken,
    teamId: string
  ): Promise<Array<{ id: string; displayName: string }>> {
    const client = this.createGraphClient(token);
    const response = await client.api(`/teams/${teamId}/channels`).get();

    return (response.value ?? []).map((ch: Record<string, unknown>) => ({
      id: String(ch.id),
      displayName: String(ch.displayName ?? ''),
    }));
  }

  async fetchChannelMessages(
    token: ConnectorToken,
    teamId: string,
    channelId: string
  ): Promise<ConnectorImportResult> {
    const client = this.createGraphClient(token);
    const response = await client
      .api(`/teams/${teamId}/channels/${channelId}/messages`)
      .top(50)
      .get();

    const messages: Record<string, unknown>[] = (response.value ?? []).map(
      (msg: Record<string, unknown>) => ({
        id: msg.id,
        createdDateTime: msg.createdDateTime,
        from: (msg.from as Record<string, Record<string, unknown>>)?.user?.displayName ?? 'Unknown',
        body: ((msg.body as Record<string, string>)?.content ?? '').replace(/<[^>]*>/g, ''),
        importance: msg.importance ?? 'normal',
        messageType: msg.messageType ?? 'message',
      })
    );

    return {
      data: messages,
      columns: ['id', 'createdDateTime', 'from', 'body', 'importance', 'messageType'],
      rowCount: messages.length,
      sourceId: `${teamId}:${channelId}`,
      sourceName: `Teams Channel Messages`,
      sourceType: 'teams',
    };
  }
}
