import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient, Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { z } from 'zod';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const JWT_SECRET = process.env.JWT_SECRET || 'rasid_jwt_secret_key_2024';
const JWT_ACCESS_EXPIRY = '15m';
const JWT_REFRESH_EXPIRY = '7d';

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const LdapConfigSchema = z.object({
  tenantId: z.string().min(1, 'tenantId is required'),
  url: z.string().url('LDAP URL must be a valid URL (e.g. ldap://ad.example.com:389)'),
  baseDn: z.string().min(1, 'Base DN is required'),
  bindDn: z.string().min(1, 'Bind DN is required'),
  bindPassword: z.string().min(1, 'Bind password is required'),
  searchFilter: z.string().default('(sAMAccountName={{username}})'),
  usernameAttribute: z.string().default('sAMAccountName'),
  emailAttribute: z.string().default('mail'),
  displayNameAttribute: z.string().default('displayName'),
  groupAttribute: z.string().default('memberOf'),
  groupSearchBase: z.string().optional(),
  groupSearchFilter: z.string().default('(member={{dn}})'),
  tlsEnabled: z.boolean().default(false),
  tlsCertPath: z.string().optional(),
  connectionTimeout: z.number().int().min(1000).max(30000).default(5000),
  searchTimeout: z.number().int().min(1000).max(30000).default(10000),
  syncScheduleCron: z.string().default('0 2 * * *'),
  roleMapping: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true),
});

const LdapAuthSchema = z.object({
  tenantId: z.string().min(1),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const LdapSyncSchema = z.object({
  tenantId: z.string().min(1),
  fullSync: z.boolean().default(false),
  dryRun: z.boolean().default(false),
});

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface LdapUser {
  dn: string;
  username: string;
  email: string;
  displayName: string;
  groups: string[];
  department: string | null;
  title: string | null;
  enabled: boolean;
  lastModified: string | null;
}

interface LdapSyncResult {
  created: number;
  updated: number;
  disabled: number;
  skipped: number;
  errors: Array<{ username: string; error: string }>;
  duration: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

export class LdapService {
  private readonly CONFIG_CACHE_TTL = 600;
  private readonly SYNC_LOCK_TTL = 3600;

  /**
   * Save or update an LDAP/AD configuration for a tenant.
   */
  async saveConfig(input: z.infer<typeof LdapConfigSchema>): Promise<Record<string, unknown>> {
    const validated = LdapConfigSchema.parse(input);

    const tenant = await prisma.tenant.findUnique({ where: { id: validated.tenantId } });
    if (!tenant) {
      throw new Error(`Tenant '${validated.tenantId}' not found`);
    }

    const encryptedPassword = this.encryptSecret(validated.bindPassword);

    const configPayload = {
      url: validated.url,
      baseDn: validated.baseDn,
      bindDn: validated.bindDn,
      bindPasswordEncrypted: encryptedPassword,
      searchFilter: validated.searchFilter,
      usernameAttribute: validated.usernameAttribute,
      emailAttribute: validated.emailAttribute,
      displayNameAttribute: validated.displayNameAttribute,
      groupAttribute: validated.groupAttribute,
      groupSearchBase: validated.groupSearchBase || validated.baseDn,
      groupSearchFilter: validated.groupSearchFilter,
      tlsEnabled: validated.tlsEnabled,
      tlsCertPath: validated.tlsCertPath || null,
      connectionTimeout: validated.connectionTimeout,
      searchTimeout: validated.searchTimeout,
      syncScheduleCron: validated.syncScheduleCron,
      roleMapping: validated.roleMapping,
      enabled: validated.enabled,
    };

    const existing = await prisma.auditLog.findFirst({
      where: {
        tenantId: validated.tenantId,
        action: 'ldap.config_saved',
        entityType: 'ldap_config',
      },
      orderBy: { createdAt: 'desc' },
    });

    const configId = existing?.entityId || `ldap_config_${validated.tenantId}`;

    await prisma.auditLog.create({
      data: {
        tenantId: validated.tenantId,
        userId: 'system',
        action: 'ldap.config_saved',
        entityType: 'ldap_config',
        entityId: configId,
        detailsJson: {
          ...configPayload,
          bindPasswordEncrypted: '***REDACTED***',
          savedAt: new Date().toISOString(),
          isUpdate: !!existing,
        },
      },
    });

    await redis.set(
      `ldap_config:${validated.tenantId}`,
      JSON.stringify(configPayload),
      'EX',
      this.CONFIG_CACHE_TTL,
    );

    logger.info('LDAP configuration saved', {
      tenantId: validated.tenantId,
      url: validated.url,
      baseDn: validated.baseDn,
      tlsEnabled: validated.tlsEnabled,
      isUpdate: !!existing,
    });

    return {
      id: configId,
      tenantId: validated.tenantId,
      url: validated.url,
      baseDn: validated.baseDn,
      bindDn: validated.bindDn,
      searchFilter: validated.searchFilter,
      tlsEnabled: validated.tlsEnabled,
      connectionTimeout: validated.connectionTimeout,
      syncScheduleCron: validated.syncScheduleCron,
      roleMappingCount: Object.keys(validated.roleMapping).length,
      enabled: validated.enabled,
      savedAt: new Date().toISOString(),
    };
  }

  /**
   * Authenticate a user against the LDAP/AD directory.
   */
  async authenticate(input: z.infer<typeof LdapAuthSchema>): Promise<Record<string, unknown>> {
    const validated = LdapAuthSchema.parse(input);

    const config = await this.getConfig(validated.tenantId);
    if (!config) {
      throw new Error(`LDAP is not configured for tenant '${validated.tenantId}'`);
    }

    if (!config.enabled) {
      throw new Error('LDAP authentication is disabled for this tenant');
    }

    const rateLimitKey = `ldap_auth_attempts:${validated.tenantId}:${validated.username}`;
    const attempts = await redis.get(rateLimitKey);
    if (attempts && parseInt(attempts, 10) >= 5) {
      logger.warn('LDAP auth rate limited', { tenantId: validated.tenantId, username: validated.username });
      throw new Error('Too many authentication attempts. Please try again later.');
    }

    let ldapUser: LdapUser;
    try {
      ldapUser = await this.performLdapBind(config, validated.username, validated.password);
    } catch (bindError: unknown) {
      await redis.incr(rateLimitKey);
      await redis.expire(rateLimitKey, 900);
      const errMsg = bindError instanceof Error ? bindError.message : String(bindError);
      logger.warn('LDAP authentication failed', {
        tenantId: validated.tenantId,
        username: validated.username,
        error: errMsg,
      });
      throw new Error('LDAP authentication failed: Invalid credentials or directory unreachable');
    }

    await redis.del(rateLimitKey);

    let user = await prisma.user.findFirst({
      where: {
        email: ldapUser.email,
        tenantId: validated.tenantId,
      },
    });

    const mappedRole = this.mapLdapGroupsToRole(ldapUser.groups, config.roleMapping as Record<string, string>);

    if (!user) {
      user = await prisma.user.create({
        data: {
          tenantId: validated.tenantId,
          email: ldapUser.email,
          name: ldapUser.displayName,
          role: mappedRole,
          passwordHash: crypto.randomBytes(64).toString('hex'),
          status: 'ACTIVE',
          lastLogin: new Date(),
        },
      });

      logger.info('LDAP user provisioned', {
        userId: user.id,
        email: ldapUser.email,
        tenantId: validated.tenantId,
        role: mappedRole,
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: ldapUser.displayName,
          role: mappedRole,
          status: 'ACTIVE',
          lastLogin: new Date(),
        },
      });
    }

    const tokenId = crypto.randomUUID();
    const accessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
        tokenId,
        authMethod: 'ldap',
      },
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRY },
    );

    const refreshToken = jwt.sign(
      { id: user.id, type: 'refresh', tokenId: crypto.randomUUID() },
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRY },
    );

    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await redis.set(
      `refresh:${user.id}:${refreshHash.slice(0, 16)}`,
      refreshHash,
      'EX',
      7 * 24 * 3600,
    );

    await prisma.auditLog.create({
      data: {
        tenantId: validated.tenantId,
        userId: user.id,
        action: 'user.ldap_login',
        entityType: 'user',
        entityId: user.id,
        detailsJson: {
          username: validated.username,
          email: ldapUser.email,
          dn: ldapUser.dn,
          groups: ldapUser.groups,
          mappedRole: mappedRole,
          authMethod: 'ldap',
          loginAt: new Date().toISOString(),
        },
      },
    });

    logger.info('LDAP authentication successful', {
      userId: user.id,
      email: ldapUser.email,
      tenantId: validated.tenantId,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
      accessToken,
      refreshToken,
      expiresIn: 900,
      authMethod: 'ldap',
      ldapGroups: ldapUser.groups,
    };
  }

  /**
   * Synchronize users from LDAP/AD directory to local database.
   */
  async syncUsers(input: z.infer<typeof LdapSyncSchema>): Promise<LdapSyncResult> {
    const validated = LdapSyncSchema.parse(input);

    const lockKey = `ldap_sync_lock:${validated.tenantId}`;
    const lockAcquired = await redis.set(lockKey, '1', 'EX', this.SYNC_LOCK_TTL, 'NX');
    if (!lockAcquired) {
      throw new Error('LDAP sync is already in progress for this tenant');
    }

    const config = await this.getConfig(validated.tenantId);
    if (!config) {
      await redis.del(lockKey);
      throw new Error(`LDAP is not configured for tenant '${validated.tenantId}'`);
    }

    const startTime = Date.now();
    const result: LdapSyncResult = {
      created: 0,
      updated: 0,
      disabled: 0,
      skipped: 0,
      errors: [],
      duration: 0,
    };

    try {
      const ldapUsers = await this.searchLdapUsers(config);

      const existingUsers = await prisma.user.findMany({
        where: { tenantId: validated.tenantId },
        select: { id: true, email: true, name: true, role: true, status: true },
      });

      const existingByEmail = new Map(existingUsers.map(u => [u.email.toLowerCase(), u]));
      const processedEmails = new Set<string>();

      for (const ldapUser of ldapUsers) {
        const emailLower = ldapUser.email.toLowerCase();
        processedEmails.add(emailLower);

        try {
          const existing = existingByEmail.get(emailLower);
          const mappedRole = this.mapLdapGroupsToRole(ldapUser.groups, config.roleMapping as Record<string, string>);

          if (validated.dryRun) {
            if (existing) {
              result.updated++;
            } else {
              result.created++;
            }
            continue;
          }

          if (existing) {
            const needsUpdate =
              existing.name !== ldapUser.displayName ||
              existing.role !== mappedRole ||
              existing.status !== (ldapUser.enabled ? 'ACTIVE' : 'SUSPENDED');

            if (needsUpdate) {
              await prisma.user.update({
                where: { id: existing.id },
                data: {
                  name: ldapUser.displayName,
                  role: mappedRole,
                  status: ldapUser.enabled ? 'ACTIVE' : 'SUSPENDED',
                },
              });
              result.updated++;
            } else {
              result.skipped++;
            }
          } else {
            await prisma.user.create({
              data: {
                tenantId: validated.tenantId,
                email: ldapUser.email,
                name: ldapUser.displayName,
                role: mappedRole,
                passwordHash: crypto.randomBytes(64).toString('hex'),
                status: ldapUser.enabled ? 'ACTIVE' : 'SUSPENDED',
              },
            });
            result.created++;
          }
        } catch (userError: unknown) {
          const errMsg = userError instanceof Error ? userError.message : String(userError);
          result.errors.push({ username: ldapUser.username, error: errMsg });
          logger.warn('Failed to sync LDAP user', {
            username: ldapUser.username,
            error: errMsg,
          });
        }
      }

      if (validated.fullSync && !validated.dryRun) {
        for (const [email, existingUser] of existingByEmail) {
          if (!processedEmails.has(email) && existingUser.status === 'ACTIVE') {
            await prisma.user.update({
              where: { id: existingUser.id },
              data: { status: 'SUSPENDED' },
            });
            result.disabled++;
          }
        }
      }

      result.duration = Date.now() - startTime;

      await prisma.auditLog.create({
        data: {
          tenantId: validated.tenantId,
          userId: 'system',
          action: 'ldap.sync_completed',
          entityType: 'ldap_sync',
          entityId: `sync_${Date.now()}`,
          detailsJson: {
            ...result,
            fullSync: validated.fullSync,
            dryRun: validated.dryRun,
            ldapUsersFound: ldapUsers.length,
            completedAt: new Date().toISOString(),
          },
        },
      });

      logger.info('LDAP sync completed', {
        tenantId: validated.tenantId,
        ...result,
      });

      return result;
    } finally {
      await redis.del(lockKey);
    }
  }

  /**
   * Test the LDAP connection for a given tenant configuration.
   */
  async testConnection(tenantId: string): Promise<Record<string, unknown>> {
    z.string().min(1).parse(tenantId);

    const config = await this.getConfig(tenantId);
    if (!config) {
      throw new Error(`LDAP is not configured for tenant '${tenantId}'`);
    }

    const startTime = Date.now();

    try {
      const testResult = await this.performLdapConnectionTest(config);
      const elapsed = Date.now() - startTime;

      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: 'system',
          action: 'ldap.connection_test',
          entityType: 'ldap_config',
          entityId: `ldap_config_${tenantId}`,
          detailsJson: {
            success: true,
            responseTimeMs: elapsed,
            serverInfo: testResult.serverInfo as Record<string, unknown>,
            testedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      logger.info('LDAP connection test passed', { tenantId, responseTimeMs: elapsed });

      return {
        success: true,
        url: config.url,
        baseDn: config.baseDn,
        responseTimeMs: elapsed,
        serverInfo: testResult.serverInfo,
        message: 'LDAP connection test successful',
      };
    } catch (err: unknown) {
      const elapsed = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);

      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: 'system',
          action: 'ldap.connection_test_failed',
          entityType: 'ldap_config',
          entityId: `ldap_config_${tenantId}`,
          detailsJson: {
            success: false,
            responseTimeMs: elapsed,
            error: errMsg,
            testedAt: new Date().toISOString(),
          },
        },
      });

      logger.warn('LDAP connection test failed', { tenantId, error: errMsg });

      return {
        success: false,
        url: config.url,
        responseTimeMs: elapsed,
        error: errMsg,
        message: 'LDAP connection test failed',
      };
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async getConfig(tenantId: string): Promise<Record<string, unknown> | null> {
    const cacheKey = `ldap_config:${tenantId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const configLog = await prisma.auditLog.findFirst({
      where: {
        tenantId,
        action: 'ldap.config_saved',
        entityType: 'ldap_config',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!configLog) return null;

    const details = configLog.detailsJson as Record<string, unknown>;
    await redis.set(cacheKey, JSON.stringify(details), 'EX', this.CONFIG_CACHE_TTL);
    return details;
  }

  private async performLdapBind(
    config: Record<string, unknown>,
    username: string,
    password: string,
  ): Promise<LdapUser> {
    const ldap = await this.getLdapClient();

    const url = config.url as string;
    const baseDn = config.baseDn as string;
    const bindDn = config.bindDn as string;
    const bindPasswordEncrypted = config.bindPasswordEncrypted as string;
    const searchFilter = (config.searchFilter as string).replace('{{username}}', username);
    const usernameAttr = config.usernameAttribute as string;
    const emailAttr = config.emailAttribute as string;
    const displayNameAttr = config.displayNameAttribute as string;
    const groupAttr = config.groupAttribute as string;
    const timeout = (config.connectionTimeout as number) || 5000;
    const tlsEnabled = config.tlsEnabled as boolean;

    const bindPassword = this.decryptSecret(bindPasswordEncrypted);

    const client = ldap.createClient({
      url,
      timeout,
      connectTimeout: timeout,
      tlsOptions: tlsEnabled ? { rejectUnauthorized: true } : undefined,
    });

    await new Promise<void>((resolve, reject) => {
      client.bind(bindDn, bindPassword, (err: Error | null) => {
        if (err) reject(new Error(`Service bind failed: ${err.message}`));
        else resolve();
      });
    });

    const entries: LdapUser[] = await new Promise((resolve, reject) => {
      const results: LdapUser[] = [];

      client.search(baseDn, {
        scope: 'sub',
        filter: searchFilter,
        attributes: [usernameAttr, emailAttr, displayNameAttr, groupAttr, 'dn', 'department', 'title', 'userAccountControl'],
        timeLimit: ((config.searchTimeout as number) || 10000) / 1000,
      }, (err: Error | null, res: { on: (event: string, callback: (...args: any[]) => void) => void }) => {
        if (err) return reject(new Error(`Search failed: ${err.message}`));

        res.on('searchEntry', (entry: { dn: { toString: () => string }; ppiAttributes?: Record<string, { values?: string[] }>; attributes?: Array<{ type: string; values: string[] }> }) => {
          const getAttr = (name: string): string => {
            if (entry.attributes && Array.isArray(entry.attributes)) {
              const attr = entry.attributes.find((a: { type: string; values: string[] }) => a.type === name);
              return attr?.values?.[0] || '';
            }
            return '';
          };

          const getAttrMulti = (name: string): string[] => {
            if (entry.attributes && Array.isArray(entry.attributes)) {
              const attr = entry.attributes.find((a: { type: string; values: string[] }) => a.type === name);
              return attr?.values || [];
            }
            return [];
          };

          const uac = getAttr('userAccountControl');
          const uacNum = uac ? parseInt(uac, 10) : 0;
          const isDisabled = (uacNum & 2) !== 0;

          results.push({
            dn: entry.dn.toString(),
            username: getAttr(usernameAttr),
            email: getAttr(emailAttr),
            displayName: getAttr(displayNameAttr),
            groups: getAttrMulti(groupAttr),
            department: getAttr('department') || null,
            title: getAttr('title') || null,
            enabled: !isDisabled,
            lastModified: getAttr('whenChanged') || null,
          });
        });

        res.on('error', (searchErr: Error) => reject(new Error(`Search error: ${searchErr.message}`)));
        res.on('end', () => resolve(results));
      });
    });

    if (entries.length === 0) {
      client.unbind(() => {});
      throw new Error(`User '${username}' not found in directory`);
    }

    const ldapUser = entries[0];

    await new Promise<void>((resolve, reject) => {
      client.bind(ldapUser.dn, password, (err: Error | null) => {
        if (err) reject(new Error('Invalid credentials'));
        else resolve();
      });
    });

    client.unbind(() => {});

    return ldapUser;
  }

  private async searchLdapUsers(config: Record<string, unknown>): Promise<LdapUser[]> {
    const ldap = await this.getLdapClient();

    const url = config.url as string;
    const baseDn = config.baseDn as string;
    const bindDn = config.bindDn as string;
    const bindPasswordEncrypted = config.bindPasswordEncrypted as string;
    const usernameAttr = config.usernameAttribute as string;
    const emailAttr = config.emailAttribute as string;
    const displayNameAttr = config.displayNameAttribute as string;
    const groupAttr = config.groupAttribute as string;
    const timeout = (config.connectionTimeout as number) || 5000;
    const tlsEnabled = config.tlsEnabled as boolean;

    const bindPassword = this.decryptSecret(bindPasswordEncrypted);

    const client = ldap.createClient({
      url,
      timeout,
      connectTimeout: timeout,
      tlsOptions: tlsEnabled ? { rejectUnauthorized: true } : undefined,
    });

    await new Promise<void>((resolve, reject) => {
      client.bind(bindDn, bindPassword, (err: Error | null) => {
        if (err) reject(new Error(`Service bind failed: ${err.message}`));
        else resolve();
      });
    });

    const users: LdapUser[] = await new Promise((resolve, reject) => {
      const results: LdapUser[] = [];

      client.search(baseDn, {
        scope: 'sub',
        filter: '(&(objectClass=user)(objectCategory=person))',
        attributes: [usernameAttr, emailAttr, displayNameAttr, groupAttr, 'dn', 'department', 'title', 'userAccountControl', 'whenChanged'],
        paged: true,
        sizeLimit: 10000,
      }, (err: Error | null, res: { on: (event: string, callback: (...args: any[]) => void) => void }) => {
        if (err) return reject(new Error(`Search failed: ${err.message}`));

        res.on('searchEntry', (entry: { dn: { toString: () => string }; attributes?: Array<{ type: string; values: string[] }> }) => {
          const getAttr = (name: string): string => {
            if (entry.attributes && Array.isArray(entry.attributes)) {
              const attr = entry.attributes.find((a: { type: string; values: string[] }) => a.type === name);
              return attr?.values?.[0] || '';
            }
            return '';
          };

          const getAttrMulti = (name: string): string[] => {
            if (entry.attributes && Array.isArray(entry.attributes)) {
              const attr = entry.attributes.find((a: { type: string; values: string[] }) => a.type === name);
              return attr?.values || [];
            }
            return [];
          };

          const email = getAttr(emailAttr);
          if (!email) return;

          const uac = getAttr('userAccountControl');
          const uacNum = uac ? parseInt(uac, 10) : 0;
          const isDisabled = (uacNum & 2) !== 0;

          results.push({
            dn: entry.dn.toString(),
            username: getAttr(usernameAttr),
            email,
            displayName: getAttr(displayNameAttr),
            groups: getAttrMulti(groupAttr),
            department: getAttr('department') || null,
            title: getAttr('title') || null,
            enabled: !isDisabled,
            lastModified: getAttr('whenChanged') || null,
          });
        });

        res.on('error', (searchErr: Error) => reject(new Error(`Search error: ${searchErr.message}`)));
        res.on('end', () => resolve(results));
      });
    });

    client.unbind(() => {});

    return users;
  }

  private async performLdapConnectionTest(
    config: Record<string, unknown>,
  ): Promise<{ serverInfo: Record<string, unknown> }> {
    const ldap = await this.getLdapClient();

    const url = config.url as string;
    const bindDn = config.bindDn as string;
    const bindPasswordEncrypted = config.bindPasswordEncrypted as string;
    const timeout = (config.connectionTimeout as number) || 5000;
    const tlsEnabled = config.tlsEnabled as boolean;

    const bindPassword = this.decryptSecret(bindPasswordEncrypted);

    const client = ldap.createClient({
      url,
      timeout,
      connectTimeout: timeout,
      tlsOptions: tlsEnabled ? { rejectUnauthorized: true } : undefined,
    });

    await new Promise<void>((resolve, reject) => {
      client.bind(bindDn, bindPassword, (err: Error | null) => {
        if (err) reject(new Error(`Connection test bind failed: ${err.message}`));
        else resolve();
      });
    });

    const serverInfo: Record<string, unknown> = { url, connected: true };

    try {
      const rootDse: Record<string, unknown> = await new Promise((resolve, reject) => {
        client.search('', {
          scope: 'base',
          filter: '(objectClass=*)',
          attributes: ['namingContexts', 'subschemaSubentry', 'supportedLDAPVersion', 'vendorName', 'vendorVersion'],
        }, (err: Error | null, res: { on: (event: string, callback: (...args: any[]) => void) => void }) => {
          if (err) return reject(err);
          const result: Record<string, unknown> = {};
          res.on('searchEntry', (entry: { attributes?: Array<{ type: string; values: string[] }> }) => {
            if (entry.attributes && Array.isArray(entry.attributes)) {
              for (const attr of entry.attributes) {
                result[attr.type] = attr.values.length === 1 ? attr.values[0] : attr.values;
              }
            }
          });
          res.on('error', () => resolve(result));
          res.on('end', () => resolve(result));
        });
      });

      Object.assign(serverInfo, rootDse);
    } catch {
      // Root DSE not available; connection still valid
    }

    client.unbind(() => {});

    return { serverInfo };
  }

  private mapLdapGroupsToRole(groups: string[], roleMapping: Record<string, string>): string {
    const roleHierarchy = ['admin', 'manager', 'editor', 'auditor', 'viewer'];

    let bestRole = 'viewer';
    let bestPriority = roleHierarchy.length;

    for (const group of groups) {
      const groupCn = this.extractCnFromDn(group);
      const mappedRole = roleMapping[groupCn] || roleMapping[group];

      if (mappedRole) {
        const priority = roleHierarchy.indexOf(mappedRole);
        if (priority >= 0 && priority < bestPriority) {
          bestRole = mappedRole;
          bestPriority = priority;
        }
      }
    }

    return bestRole;
  }

  private extractCnFromDn(dn: string): string {
    const match = dn.match(/CN=([^,]+)/i);
    return match ? match[1] : dn;
  }

  private encryptSecret(plaintext: string): string {
    const key = process.env.ENCRYPTION_KEY || 'rasid_default_encryption_key_32b!';
    const keyBuffer = Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf-8');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
    let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decryptSecret(encrypted: string): string {
    const key = process.env.ENCRYPTION_KEY || 'rasid_default_encryption_key_32b!';
    const keyBuffer = Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf-8');
    const [ivHex, encryptedHex] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  }

  private async getLdapClient(): Promise<{
    createClient: (opts: Record<string, unknown>) => {
      bind: (dn: string, password: string, cb: (err: Error | null) => void) => void;
      search: (base: string, opts: Record<string, unknown>, cb: (err: Error | null, res: { on: (event: string, cb: (...args: unknown[]) => void) => void }) => void) => void;
      unbind: (cb: () => void) => void;
    };
  }> {
    try {
      return require('ldapjs');
    } catch {
      throw new Error(
        'ldapjs package is not installed. Run: npm install ldapjs @types/ldapjs',
      );
    }
  }
}

export const ldapService = new LdapService();
