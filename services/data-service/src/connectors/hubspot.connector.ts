/**
 * HubSpot Connector — Rasid Platform
 * تكامل كامل مع HubSpot CRM API
 */

import { Client as HubSpotClient } from '@hubspot/api-client';
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

export class HubSpotConnector implements IConnector {
  readonly type: ConnectorType = 'hubspot';
  readonly meta: ConnectorMeta = {
    type: 'hubspot',
    name: 'HubSpot',
    icon: 'hubspot',
    description: 'استيراد جهات الاتصال والصفقات والشركات من HubSpot CRM',
    requiredScopes: ['crm.objects.contacts.read', 'crm.objects.deals.read', 'crm.objects.companies.read'],
    authType: 'api_key',
  };

  private createClient(token: ConnectorToken): HubSpotClient {
    return new HubSpotClient({ accessToken: token.accessToken });
  }

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

  async refreshAccessToken(refreshToken: string): Promise<ConnectorToken> {
    // HubSpot uses API keys — return existing token with extended expiry
    logger.info('HubSpot: API key-based auth does not require token refresh');
    return {
      accessToken: refreshToken,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      tokenType: 'Bearer',
    };
  }

  async testConnection(token: ConnectorToken): Promise<boolean> {
    try {
      const client = this.createClient(token);
      await client.crm.contacts.basicApi.getPage(1);
      return true;
    } catch (error) {
      logger.warn('HubSpot connection test failed', { error });
      return false;
    }
  }

  async listFiles(
    _token: ConnectorToken,
    _options: ConnectorListOptions = {}
  ): Promise<ConnectorListResult> {
    const objects = ['contacts', 'deals', 'companies'];
    const files: ConnectorFile[] = objects.map((obj) => ({
      id: obj,
      name: obj.charAt(0).toUpperCase() + obj.slice(1),
      mimeType: `application/vnd.hubspot.${obj}`,
      size: 0,
      modifiedAt: new Date(),
      isFolder: false,
    }));
    return { files };
  }

  async downloadFile(_token: ConnectorToken, _fileId: string): Promise<Buffer> {
    throw new Error('HubSpot لا يدعم تحميل الملفات مباشرة — استخدم importData');
  }

  async importData(
    token: ConnectorToken,
    objectType: string
  ): Promise<ConnectorImportResult> {
    switch (objectType) {
      case 'contacts':
        return this.fetchContacts(token);
      case 'deals':
        return this.fetchDeals(token);
      case 'companies':
        return this.fetchCompanies(token);
      default:
        throw new Error(`Unsupported HubSpot object type: ${objectType}`);
    }
  }

  async fetchContacts(token: ConnectorToken): Promise<ConnectorImportResult> {
    const client = this.createClient(token);
    const allRecords: Record<string, unknown>[] = [];
    let after: string | undefined;

    do {
      const response = await client.crm.contacts.basicApi.getPage(
        100, after, ['firstname', 'lastname', 'email', 'phone', 'company', 'jobtitle', 'createdate']
      );

      for (const contact of response.results) {
        allRecords.push({
          id: contact.id,
          ...contact.properties,
          createdAt: contact.createdAt?.toISOString() ?? '',
          updatedAt: contact.updatedAt?.toISOString() ?? '',
        });
      }

      after = response.paging?.next?.after;
    } while (after);

    return {
      data: allRecords,
      columns: ['id', 'firstname', 'lastname', 'email', 'phone', 'company', 'jobtitle', 'createdate', 'createdAt', 'updatedAt'],
      rowCount: allRecords.length,
      sourceId: 'contacts',
      sourceName: 'HubSpot Contacts',
      sourceType: 'hubspot',
    };
  }

  async fetchDeals(token: ConnectorToken): Promise<ConnectorImportResult> {
    const client = this.createClient(token);
    const allRecords: Record<string, unknown>[] = [];
    let after: string | undefined;

    do {
      const response = await client.crm.deals.basicApi.getPage(
        100, after, ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate', 'createdate']
      );

      for (const deal of response.results) {
        allRecords.push({
          id: deal.id,
          ...deal.properties,
          createdAt: deal.createdAt?.toISOString() ?? '',
          updatedAt: deal.updatedAt?.toISOString() ?? '',
        });
      }

      after = response.paging?.next?.after;
    } while (after);

    return {
      data: allRecords,
      columns: ['id', 'dealname', 'amount', 'dealstage', 'pipeline', 'closedate', 'createdate', 'createdAt', 'updatedAt'],
      rowCount: allRecords.length,
      sourceId: 'deals',
      sourceName: 'HubSpot Deals',
      sourceType: 'hubspot',
    };
  }

  async fetchCompanies(token: ConnectorToken): Promise<ConnectorImportResult> {
    const client = this.createClient(token);
    const allRecords: Record<string, unknown>[] = [];
    let after: string | undefined;

    do {
      const response = await client.crm.companies.basicApi.getPage(
        100, after, ['name', 'domain', 'industry', 'city', 'country', 'numberofemployees', 'annualrevenue']
      );

      for (const company of response.results) {
        allRecords.push({
          id: company.id,
          ...company.properties,
          createdAt: company.createdAt?.toISOString() ?? '',
          updatedAt: company.updatedAt?.toISOString() ?? '',
        });
      }

      after = response.paging?.next?.after;
    } while (after);

    return {
      data: allRecords,
      columns: ['id', 'name', 'domain', 'industry', 'city', 'country', 'numberofemployees', 'annualrevenue', 'createdAt', 'updatedAt'],
      rowCount: allRecords.length,
      sourceId: 'companies',
      sourceName: 'HubSpot Companies',
      sourceType: 'hubspot',
    };
  }
}
