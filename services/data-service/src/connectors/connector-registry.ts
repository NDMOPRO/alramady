/**
 * Connector Registry — Rasid Platform
 * سجل مركزي لجميع الموصلات الخارجية مع إدارة الرموز والتخزين
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { IConnector, ConnectorType, ConnectorToken, ConnectorMeta } from './connector.interface';
import { GoogleDriveConnector } from './google-drive.connector';
import { GoogleSheetsConnector } from './google-sheets.connector';
import { GmailConnector } from './gmail.connector';
import { OneDriveConnector } from './onedrive.connector';
import { GoogleAnalyticsConnector } from './google-analytics.connector';
import { SalesforceConnector } from './salesforce.connector';
import { NotionConnector } from './notion.connector';
import { AirtableConnector } from './airtable.connector';
import { JiraConnector } from './jira.connector';
import { SlackConnector } from './slack.connector';
import { DropboxConnector } from './dropbox.connector';
import { HubSpotConnector } from './hubspot.connector';
import { OutlookConnector } from './outlook.connector';
import { TeamsConnector } from './teams.connector';
import { GoogleFormsConnector } from './google-forms.connector';
import { GoogleSlidesConnector } from './google-slides.connector';
import { GoogleDocsConnector } from './google-docs.connector';
import { ZapierConnector } from './zapier.connector';
import { MakeConnector } from './make.connector';
import { YouTubeConnector } from './youtube.connector';
import { TypeformConnector } from './typeform.connector';
import { PowerBIConnector } from './powerbi.connector';
import { CanvaConnector } from './canva.connector';
import { FigmaConnector } from './figma.connector';
import { MiroConnector } from './miro.connector';
import { CalendlyConnector } from './calendly.connector';
import { AmplitudeConnector } from './amplitude.connector';
import { logger } from '../utils/logger';

const ENCRYPTION_KEY = process.env.CONNECTOR_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? '';
const ALGORITHM = 'aes-256-cbc';

export class ConnectorRegistry {
  private connectors: Map<ConnectorType, IConnector> = new Map();
  private prisma: PrismaClient;
  private connectorLastUsedAtAvailable = true;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.registerBuiltInConnectors();
  }

  private registerBuiltInConnectors(): void {
    this.register(new GoogleDriveConnector());
    this.register(new GoogleSheetsConnector());
    this.register(new GmailConnector());
    this.register(new OneDriveConnector());
    this.register(new GoogleAnalyticsConnector());
    this.register(new SalesforceConnector());
    this.register(new NotionConnector());
    this.register(new AirtableConnector());
    this.register(new JiraConnector());
    this.register(new SlackConnector());
    this.register(new DropboxConnector());
    this.register(new HubSpotConnector());
    this.register(new OutlookConnector());
    this.register(new TeamsConnector());
    this.register(new GoogleFormsConnector());
    this.register(new GoogleSlidesConnector());
    this.register(new GoogleDocsConnector());
    this.register(new ZapierConnector());
    this.register(new MakeConnector());
    this.register(new YouTubeConnector());
    this.register(new TypeformConnector());
    this.register(new PowerBIConnector());
    this.register(new CanvaConnector());
    this.register(new FigmaConnector());
    this.register(new MiroConnector());
    this.register(new CalendlyConnector());
    this.register(new AmplitudeConnector());
  }

  register(connector: IConnector): void {
    this.connectors.set(connector.type, connector);
    logger.info(`Connector registered: ${connector.type}`);
  }

  getConnector(type: ConnectorType): IConnector {
    const connector = this.connectors.get(type);
    if (!connector) {
      throw new Error(`Connector not found: ${type}`);
    }
    return connector;
  }

  listConnectors(): ConnectorMeta[] {
    return Array.from(this.connectors.values()).map((c) => c.meta);
  }

  getAuthUrl(type: ConnectorType, tenantId: string, userId: string): string {
    const connector = this.getConnector(type);
    const state = this.encryptToken(JSON.stringify({ type, tenantId, userId, ts: Date.now() }));
    return connector.getAuthUrl(state);
  }

  async handleCallback(
    type: ConnectorType,
    code: string,
    state: string
  ): Promise<{ tenantId: string; userId: string; connectionId: string }> {
    const stateData = JSON.parse(this.decryptToken(state));
    const connector = this.getConnector(type);

    const token = await connector.exchangeCode(code);

    // Test the connection
    const isValid = await connector.testConnection(token);
    if (!isValid) {
      throw new Error('فشل في التحقق من الاتصال');
    }

    // Store the token securely
    const connectionId = await this.storeConnection(
      stateData.tenantId,
      stateData.userId,
      type,
      token
    );

    return {
      tenantId: stateData.tenantId,
      userId: stateData.userId,
      connectionId,
    };
  }

  async getValidToken(
    connectionId: string,
    tenantId: string
  ): Promise<ConnectorToken> {
    const connection = await this.prisma.connectorConnection.findFirst({
      where: { id: connectionId, tenantId, status: 'active' },
    });

    if (!connection) {
      throw new Error('اتصال غير موجود');
    }

    const token: ConnectorToken = {
      accessToken: this.decryptToken(connection.accessToken),
      refreshToken: connection.refreshToken
        ? this.decryptToken(connection.refreshToken)
        : undefined,
      expiresAt: connection.expiresAt,
      tokenType: connection.tokenType,
    };

    // Check if token is expired and refresh if needed
    if (token.expiresAt <= new Date() && token.refreshToken) {
      const connector = this.getConnector(connection.connectorType as ConnectorType);
      const newToken = await connector.refreshAccessToken(token.refreshToken);

      // Update stored token
      await this.updateConnectionToken(connectionId, connection.refreshToken, newToken);

      return newToken;
    }

    return token;
  }

  async listConnections(
    tenantId: string,
    userId?: string
  ): Promise<
    Array<{
      id: string;
      connectorType: string;
      connectorName: string;
      status: string;
      createdAt: Date;
      lastUsedAt: Date | null;
    }>
  > {
    const where: Record<string, unknown> = { tenantId, status: 'active' };
    if (userId) where.userId = userId;

    const connections = await this.listConnectionsWithSchemaFallback(where);

    return connections.map((c) => ({
      ...c,
      connectorName:
        this.connectors.get(c.connectorType as ConnectorType)?.meta.name ?? c.connectorType,
    }));
  }

  async revokeConnection(connectionId: string, tenantId: string): Promise<void> {
    await this.prisma.connectorConnection.updateMany({
      where: { id: connectionId, tenantId },
      data: { status: 'revoked', revokedAt: new Date() },
    });
    logger.info('Connector connection revoked', { connectionId, tenantId });
  }

  private async storeConnection(
    tenantId: string,
    userId: string,
    type: ConnectorType,
    token: ConnectorToken
  ): Promise<string> {
    const connection = await this.prisma.connectorConnection.create({
      data: {
        tenantId,
        userId,
        connectorType: type,
        accessToken: this.encryptToken(token.accessToken),
        refreshToken: token.refreshToken
          ? this.encryptToken(token.refreshToken)
          : null,
        expiresAt: token.expiresAt,
        tokenType: token.tokenType,
        status: 'active',
      },
    });

    return connection.id;
  }

  private async updateConnectionToken(
    connectionId: string,
    existingRefreshToken: string | null,
    newToken: ConnectorToken
  ): Promise<void> {
    const baseData = {
      accessToken: this.encryptToken(newToken.accessToken),
      refreshToken: newToken.refreshToken
        ? this.encryptToken(newToken.refreshToken)
        : existingRefreshToken,
      expiresAt: newToken.expiresAt,
    };

    if (!this.connectorLastUsedAtAvailable) {
      await this.prisma.connectorConnection.update({
        where: { id: connectionId },
        data: baseData,
      });
      return;
    }

    try {
      await this.prisma.connectorConnection.update({
        where: { id: connectionId },
        data: {
          ...baseData,
          lastUsedAt: new Date(),
        },
      });
    } catch (error) {
      if (!this.isMissingLastUsedAtColumn(error)) {
        throw error;
      }

      this.connectorLastUsedAtAvailable = false;
      await this.prisma.connectorConnection.update({
        where: { id: connectionId },
        data: baseData,
      });
    }
  }

  private async listConnectionsWithSchemaFallback(where: Record<string, unknown>): Promise<
    Array<{
      id: string;
      connectorType: string;
      status: string;
      createdAt: Date;
      lastUsedAt: Date | null;
    }>
  > {
    if (!this.connectorLastUsedAtAvailable) {
      const fallbackConnections = await this.prisma.connectorConnection.findMany({
        where,
        select: {
          id: true,
          connectorType: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return fallbackConnections.map((connection) => ({
        ...connection,
        lastUsedAt: null,
      }));
    }

    try {
      return await this.prisma.connectorConnection.findMany({
        where,
        select: {
          id: true,
          connectorType: true,
          status: true,
          createdAt: true,
          lastUsedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      if (!this.isMissingLastUsedAtColumn(error)) {
        throw error;
      }

      this.connectorLastUsedAtAvailable = false;
      const fallbackConnections = await this.prisma.connectorConnection.findMany({
        where,
        select: {
          id: true,
          connectorType: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return fallbackConnections.map((connection) => ({
        ...connection,
        lastUsedAt: null,
      }));
    }
  }

  private isMissingLastUsedAtColumn(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2022' &&
      typeof error.message === 'string' &&
      error.message.includes('last_used_at')
    );
  }

  private encryptToken(text: string): string {
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  private decryptToken(encryptedText: string): string {
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const [ivHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
