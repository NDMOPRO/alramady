import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { z } from 'zod';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const JWT_SECRET = process.env.JWT_SECRET || 'rasid_jwt_secret_key_2024';
const JWT_ACCESS_EXPIRY = '15m';
const JWT_REFRESH_EXPIRY = '7d';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const SamlProviderSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1, 'Provider name is required'),
  protocol: z.literal('saml'),
  entityId: z.string().min(1, 'SAML Entity ID is required'),
  ssoUrl: z.string().url('SSO URL must be a valid URL'),
  sloUrl: z.string().url('SLO URL must be a valid URL').optional(),
  certificate: z.string().min(1, 'IdP certificate is required'),
  signatureAlgorithm: z.enum(['sha256', 'sha512']).default('sha256'),
  digestAlgorithm: z.enum(['sha256', 'sha512']).default('sha256'),
  nameIdFormat: z.enum([
    'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
    'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
  ]).default('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'),
  attributeMapping: z.object({
    email: z.string().default('email'),
    name: z.string().default('displayName'),
    role: z.string().optional(),
    groups: z.string().optional(),
  }).default({}),
  roleMapping: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true),
});

const OAuthProviderSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1, 'Provider name is required'),
  protocol: z.enum(['oauth2', 'oidc']),
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client secret is required'),
  authorizationUrl: z.string().url('Authorization URL must be valid'),
  tokenUrl: z.string().url('Token URL must be valid'),
  userInfoUrl: z.string().url('UserInfo URL must be valid').optional(),
  jwksUrl: z.string().url('JWKS URL must be valid').optional(),
  scopes: z.array(z.string()).default(['openid', 'email', 'profile']),
  responseType: z.enum(['code', 'token']).default('code'),
  attributeMapping: z.object({
    email: z.string().default('email'),
    name: z.string().default('name'),
    sub: z.string().default('sub'),
    role: z.string().optional(),
    groups: z.string().optional(),
  }).default({}),
  roleMapping: z.record(z.string(), z.string()).default({}),
  pkceEnabled: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

const SsoCallbackSchema = z.object({
  tenantId: z.string().min(1),
  providerId: z.string().min(1),
  callbackData: z.record(z.string(), z.unknown()),
});

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface SsoUserProfile {
  email: string;
  name: string;
  externalId: string;
  groups: string[];
  rawAttributes: Record<string, unknown>;
}

// ─── Service ────────────────────────────────────────────────────────────────

export class SsoService {
  private readonly PROVIDER_CACHE_TTL = 600;
  private readonly STATE_TTL = 600;

  /**
   * Register a SAML identity provider for a tenant.
   */
  async registerSamlProvider(input: z.infer<typeof SamlProviderSchema>): Promise<Record<string, unknown>> {
    const validated = SamlProviderSchema.parse(input);

    const tenant = await prisma.tenant.findUnique({ where: { id: validated.tenantId } });
    if (!tenant) {
      throw new Error(`Tenant '${validated.tenantId}' not found`);
    }

    const providerId = `saml_${validated.tenantId}_${crypto.randomBytes(8).toString('hex')}`;

    const providerPayload = {
      id: providerId,
      tenantId: validated.tenantId,
      name: validated.name,
      protocol: 'saml' as const,
      entityId: validated.entityId,
      ssoUrl: validated.ssoUrl,
      sloUrl: validated.sloUrl || null,
      certificate: validated.certificate,
      signatureAlgorithm: validated.signatureAlgorithm,
      digestAlgorithm: validated.digestAlgorithm,
      nameIdFormat: validated.nameIdFormat,
      attributeMapping: validated.attributeMapping,
      roleMapping: validated.roleMapping,
      enabled: validated.enabled,
      createdAt: new Date().toISOString(),
    };

    await redis.set(
      `sso_provider:${validated.tenantId}:${providerId}`,
      JSON.stringify(providerPayload),
      'EX',
      86400,
    );

    await prisma.auditLog.create({
      data: {
        tenantId: validated.tenantId,
        userId: 'system',
        action: 'sso.saml_provider_registered',
        entityType: 'sso_provider',
        entityId: providerId,
        detailsJson: {
          providerId,
          name: validated.name,
          protocol: 'saml',
          entityId: validated.entityId,
          ssoUrl: validated.ssoUrl,
          enabled: validated.enabled,
          registeredAt: new Date().toISOString(),
        } as Record<string, unknown>,
      },
    });

    logger.info('SAML provider registered', {
      providerId,
      tenantId: validated.tenantId,
      entityId: validated.entityId,
    });

    const spMetadata = this.generateSpMetadata(validated.tenantId, providerId);

    return {
      id: providerId,
      name: validated.name,
      protocol: 'saml',
      entityId: validated.entityId,
      ssoUrl: validated.ssoUrl,
      enabled: validated.enabled,
      spMetadata,
      acsUrl: `${APP_URL}/api/auth/sso/saml/${providerId}/callback`,
      spEntityId: `${APP_URL}/api/auth/sso/saml/${providerId}/metadata`,
      createdAt: providerPayload.createdAt,
    };
  }

  /**
   * Register an OAuth2/OIDC identity provider for a tenant.
   */
  async registerOAuthProvider(input: z.infer<typeof OAuthProviderSchema>): Promise<Record<string, unknown>> {
    const validated = OAuthProviderSchema.parse(input);

    const tenant = await prisma.tenant.findUnique({ where: { id: validated.tenantId } });
    if (!tenant) {
      throw new Error(`Tenant '${validated.tenantId}' not found`);
    }

    const providerId = `oauth_${validated.tenantId}_${crypto.randomBytes(8).toString('hex')}`;
    const encryptedSecret = this.encryptSecret(validated.clientSecret);

    const providerPayload = {
      id: providerId,
      tenantId: validated.tenantId,
      name: validated.name,
      protocol: validated.protocol,
      clientId: validated.clientId,
      clientSecretEncrypted: encryptedSecret,
      authorizationUrl: validated.authorizationUrl,
      tokenUrl: validated.tokenUrl,
      userInfoUrl: validated.userInfoUrl || null,
      jwksUrl: validated.jwksUrl || null,
      scopes: validated.scopes,
      responseType: validated.responseType,
      attributeMapping: validated.attributeMapping,
      roleMapping: validated.roleMapping,
      pkceEnabled: validated.pkceEnabled,
      enabled: validated.enabled,
      createdAt: new Date().toISOString(),
    };

    await redis.set(
      `sso_provider:${validated.tenantId}:${providerId}`,
      JSON.stringify(providerPayload),
      'EX',
      86400,
    );

    await prisma.auditLog.create({
      data: {
        tenantId: validated.tenantId,
        userId: 'system',
        action: 'sso.oauth_provider_registered',
        entityType: 'sso_provider',
        entityId: providerId,
        detailsJson: {
          providerId,
          name: validated.name,
          protocol: validated.protocol,
          authorizationUrl: validated.authorizationUrl,
          scopes: validated.scopes,
          pkceEnabled: validated.pkceEnabled,
          enabled: validated.enabled,
          registeredAt: new Date().toISOString(),
        } as Record<string, unknown>,
      },
    });

    logger.info('OAuth provider registered', {
      providerId,
      tenantId: validated.tenantId,
      protocol: validated.protocol,
    });

    return {
      id: providerId,
      name: validated.name,
      protocol: validated.protocol,
      clientId: validated.clientId,
      authorizationUrl: validated.authorizationUrl,
      scopes: validated.scopes,
      pkceEnabled: validated.pkceEnabled,
      enabled: validated.enabled,
      redirectUrl: `${APP_URL}/api/auth/sso/oauth/${providerId}/callback`,
      createdAt: providerPayload.createdAt,
    };
  }

  /**
   * Initiate SSO login - returns URL to redirect the user.
   */
  async initiateLogin(tenantId: string, providerId: string): Promise<Record<string, unknown>> {
    z.string().min(1).parse(tenantId);
    z.string().min(1).parse(providerId);

    const provider = await this.getProvider(tenantId, providerId);
    if (!provider) {
      throw new Error(`SSO provider '${providerId}' not found for tenant '${tenantId}'`);
    }

    if (!provider.enabled) {
      throw new Error('SSO provider is disabled');
    }

    const state = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');

    await redis.set(
      `sso_state:${state}`,
      JSON.stringify({ tenantId, providerId, nonce, createdAt: Date.now() }),
      'EX',
      this.STATE_TTL,
    );

    const protocol = provider.protocol as string;

    if (protocol === 'saml') {
      const samlRequestId = `_${crypto.randomBytes(16).toString('hex')}`;
      const issueInstant = new Date().toISOString();
      const acsUrl = `${APP_URL}/api/auth/sso/saml/${providerId}/callback`;
      const spEntityId = `${APP_URL}/api/auth/sso/saml/${providerId}/metadata`;

      const authnRequest = `<samlp:AuthnRequest
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        ID="${samlRequestId}"
        Version="2.0"
        IssueInstant="${issueInstant}"
        Destination="${provider.ssoUrl}"
        AssertionConsumerServiceURL="${acsUrl}"
        ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
        <saml:Issuer>${spEntityId}</saml:Issuer>
        <samlp:NameIDPolicy Format="${provider.nameIdFormat}" AllowCreate="true" />
      </samlp:AuthnRequest>`;

      const encoded = Buffer.from(authnRequest, 'utf-8').toString('base64');
      const redirectUrl = `${provider.ssoUrl}?SAMLRequest=${encodeURIComponent(encoded)}&RelayState=${state}`;

      await redis.set(`sso_saml_request:${samlRequestId}`, state, 'EX', this.STATE_TTL);

      logger.info('SAML login initiated', { tenantId, providerId, requestId: samlRequestId });

      return {
        protocol: 'saml',
        redirectUrl,
        requestId: samlRequestId,
        state,
      };
    }

    // OAuth2/OIDC flow
    const authUrl = new URL(provider.authorizationUrl as string);
    authUrl.searchParams.set('client_id', provider.clientId as string);
    authUrl.searchParams.set('redirect_uri', `${APP_URL}/api/auth/sso/oauth/${providerId}/callback`);
    authUrl.searchParams.set('response_type', (provider.responseType as string) || 'code');
    authUrl.searchParams.set('scope', (provider.scopes as string[]).join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);

    if (provider.pkceEnabled) {
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      await redis.set(`sso_pkce:${state}`, codeVerifier, 'EX', this.STATE_TTL);
    }

    logger.info('OAuth login initiated', { tenantId, providerId, protocol });

    return {
      protocol,
      redirectUrl: authUrl.toString(),
      state,
    };
  }

  /**
   * Handle SSO callback after IdP redirects back.
   */
  async handleCallback(input: z.infer<typeof SsoCallbackSchema>): Promise<Record<string, unknown>> {
    const validated = SsoCallbackSchema.parse(input);

    const provider = await this.getProvider(validated.tenantId, validated.providerId);
    if (!provider) {
      throw new Error(`SSO provider '${validated.providerId}' not found`);
    }

    const protocol = provider.protocol as string;
    let userProfile: SsoUserProfile;

    if (protocol === 'saml') {
      userProfile = await this.processSamlResponse(provider, validated.callbackData);
    } else {
      userProfile = await this.processOAuthCallback(provider, validated.callbackData);
    }

    if (!userProfile.email) {
      throw new Error('SSO authentication failed: email not provided by identity provider');
    }

    let user = await prisma.user.findFirst({
      where: {
        email: userProfile.email.toLowerCase(),
        tenantId: validated.tenantId,
      },
    });

    const roleMapping = (provider.roleMapping || {}) as Record<string, string>;
    const mappedRole = this.mapGroupsToRole(userProfile.groups, roleMapping);

    if (!user) {
      user = await prisma.user.create({
        data: {
          tenantId: validated.tenantId,
          email: userProfile.email.toLowerCase(),
          name: userProfile.name || userProfile.email.split('@')[0],
          role: mappedRole,
          passwordHash: crypto.randomBytes(64).toString('hex'),
          status: 'ACTIVE',
          lastLogin: new Date(),
        },
      });

      logger.info('SSO user provisioned', {
        userId: user.id,
        email: userProfile.email,
        tenantId: validated.tenantId,
        protocol,
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: userProfile.name || user.name,
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
        authMethod: `sso_${protocol}`,
        ssoProviderId: validated.providerId,
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
        action: `user.sso_login_${protocol}`,
        entityType: 'user',
        entityId: user.id,
        detailsJson: {
          email: userProfile.email,
          externalId: userProfile.externalId,
          groups: userProfile.groups,
          protocol,
          providerId: validated.providerId,
          providerName: provider.name,
          mappedRole,
          loginAt: new Date().toISOString(),
        } as Record<string, unknown>,
      },
    });

    logger.info('SSO authentication successful', {
      userId: user.id,
      email: userProfile.email,
      protocol,
      providerId: validated.providerId,
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
      authMethod: `sso_${protocol}`,
      provider: {
        id: validated.providerId,
        name: provider.name,
        protocol,
      },
    };
  }

  /**
   * List SSO providers for a tenant.
   */
  async listProviders(tenantId: string): Promise<Array<Record<string, unknown>>> {
    z.string().min(1).parse(tenantId);

    const keys = await redis.keys(`sso_provider:${tenantId}:*`);
    const providers: Array<Record<string, unknown>> = [];

    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;

      const provider = JSON.parse(raw);
      providers.push({
        id: provider.id,
        name: provider.name,
        protocol: provider.protocol,
        enabled: provider.enabled,
        entityId: provider.entityId || undefined,
        authorizationUrl: provider.authorizationUrl || undefined,
        createdAt: provider.createdAt,
      });
    }

    return providers;
  }

  /**
   * Disable or enable an SSO provider.
   */
  async toggleProvider(tenantId: string, providerId: string, enabled: boolean): Promise<Record<string, unknown>> {
    z.string().min(1).parse(tenantId);
    z.string().min(1).parse(providerId);

    const provider = await this.getProvider(tenantId, providerId);
    if (!provider) {
      throw new Error(`SSO provider '${providerId}' not found`);
    }

    provider.enabled = enabled;

    await redis.set(
      `sso_provider:${tenantId}:${providerId}`,
      JSON.stringify(provider),
      'EX',
      86400,
    );

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: 'system',
        action: enabled ? 'sso.provider_enabled' : 'sso.provider_disabled',
        entityType: 'sso_provider',
        entityId: providerId,
        detailsJson: {
          providerId,
          name: provider.name,
          protocol: provider.protocol,
          enabled,
          toggledAt: new Date().toISOString(),
        } as Record<string, unknown>,
      },
    });

    logger.info(`SSO provider ${enabled ? 'enabled' : 'disabled'}`, { tenantId, providerId });

    return {
      id: providerId,
      name: provider.name,
      enabled,
      message: `Provider ${enabled ? 'enabled' : 'disabled'} successfully`,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async getProvider(tenantId: string, providerId: string): Promise<Record<string, unknown> | null> {
    const raw = await redis.get(`sso_provider:${tenantId}:${providerId}`);
    if (raw) return JSON.parse(raw);

    const providerLog = await prisma.auditLog.findFirst({
      where: {
        tenantId,
        entityId: providerId,
        entityType: 'sso_provider',
        action: { startsWith: 'sso.' },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!providerLog) return null;

    const details = providerLog.detailsJson as Record<string, unknown>;
    await redis.set(
      `sso_provider:${tenantId}:${providerId}`,
      JSON.stringify(details),
      'EX',
      this.PROVIDER_CACHE_TTL,
    );
    return details;
  }

  private async processSamlResponse(
    provider: Record<string, unknown>,
    callbackData: Record<string, unknown>,
  ): Promise<SsoUserProfile> {
    const samlResponse = callbackData.SAMLResponse as string;
    if (!samlResponse) {
      throw new Error('SAML response not found in callback data');
    }

    const relayState = callbackData.RelayState as string;
    if (relayState) {
      const stateData = await redis.get(`sso_state:${relayState}`);
      if (!stateData) {
        throw new Error('Invalid or expired SAML relay state');
      }
      await redis.del(`sso_state:${relayState}`);
    }

    const decoded = Buffer.from(samlResponse, 'base64').toString('utf-8');

    const certificate = provider.certificate as string;
    if (!this.verifySamlSignature(decoded, certificate)) {
      throw new Error('SAML response signature verification failed');
    }

    const attrMapping = (provider.attributeMapping || {}) as Record<string, string>;

    const extractAttr = (xml: string, attrName: string): string => {
      const namePattern = new RegExp(
        `Name="${attrName}"[^>]*>\\s*<saml:AttributeValue[^>]*>([^<]+)</saml:AttributeValue>`,
        'i',
      );
      const match = xml.match(namePattern);
      return match ? match[1].trim() : '';
    };

    const extractMultiAttr = (xml: string, attrName: string): string[] => {
      const namePattern = new RegExp(
        `Name="${attrName}"[^>]*>([\\s\\S]*?)</saml:Attribute>`,
        'i',
      );
      const block = xml.match(namePattern);
      if (!block) return [];

      const values: string[] = [];
      const valPattern = /<saml:AttributeValue[^>]*>([^<]+)<\/saml:AttributeValue>/gi;
      let valMatch: RegExpExecArray | null;
      while ((valMatch = valPattern.exec(block[1])) !== null) {
        values.push(valMatch[1].trim());
      }
      return values;
    };

    const nameIdMatch = decoded.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/i);
    const nameId = nameIdMatch ? nameIdMatch[1].trim() : '';

    const email = extractAttr(decoded, attrMapping.email || 'email') || nameId;
    const name = extractAttr(decoded, attrMapping.name || 'displayName') || email.split('@')[0];
    const groups = attrMapping.groups
      ? extractMultiAttr(decoded, attrMapping.groups)
      : [];

    return {
      email,
      name,
      externalId: nameId,
      groups,
      rawAttributes: { nameId, decoded: '[REDACTED]' },
    };
  }

  private async processOAuthCallback(
    provider: Record<string, unknown>,
    callbackData: Record<string, unknown>,
  ): Promise<SsoUserProfile> {
    const code = callbackData.code as string;
    const state = callbackData.state as string;

    if (!code) {
      const error = callbackData.error as string;
      throw new Error(`OAuth callback error: ${error || 'authorization code not provided'}`);
    }

    if (state) {
      const stateData = await redis.get(`sso_state:${state}`);
      if (!stateData) {
        throw new Error('Invalid or expired OAuth state parameter');
      }
      await redis.del(`sso_state:${state}`);
    }

    const tokenParams: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${APP_URL}/api/auth/sso/oauth/${provider.id}/callback`,
      client_id: provider.clientId as string,
    };

    if (provider.pkceEnabled && state) {
      const codeVerifier = await redis.get(`sso_pkce:${state}`);
      if (codeVerifier) {
        tokenParams.code_verifier = codeVerifier;
        await redis.del(`sso_pkce:${state}`);
      }
    }

    const clientSecret = this.decryptSecret(provider.clientSecretEncrypted as string);

    const tokenResponse = await fetch(provider.tokenUrl as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${provider.clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams(tokenParams).toString(),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      logger.error('OAuth token exchange failed', { status: tokenResponse.status, body: errorBody });
      throw new Error('Failed to exchange authorization code for tokens');
    }

    const tokenData = await tokenResponse.json() as Record<string, unknown>;
    const accessTokenValue = tokenData.access_token as string;
    const idToken = tokenData.id_token as string;

    let userInfo: Record<string, unknown> = {};

    if (idToken) {
      const parts = idToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
        userInfo = payload;
      }
    }

    if (provider.userInfoUrl && accessTokenValue) {
      const userInfoResponse = await fetch(provider.userInfoUrl as string, {
        headers: { Authorization: `Bearer ${accessTokenValue}` },
      });

      if (userInfoResponse.ok) {
        const fetchedInfo = await userInfoResponse.json() as Record<string, unknown>;
        userInfo = { ...userInfo, ...fetchedInfo };
      }
    }

    const attrMapping = (provider.attributeMapping || {}) as Record<string, string>;

    const email = String(userInfo[attrMapping.email || 'email'] || '');
    const name = String(userInfo[attrMapping.name || 'name'] || '');
    const sub = String(userInfo[attrMapping.sub || 'sub'] || '');
    const groups: string[] = attrMapping.groups && userInfo[attrMapping.groups]
      ? (Array.isArray(userInfo[attrMapping.groups])
          ? (userInfo[attrMapping.groups] as string[])
          : [String(userInfo[attrMapping.groups])])
      : [];

    return {
      email,
      name,
      externalId: sub,
      groups,
      rawAttributes: { sub, iss: userInfo.iss, aud: userInfo.aud },
    };
  }

  private verifySamlSignature(xml: string, certificate: string): boolean {
    try {
      const signatureBlock = xml.match(/<ds:SignatureValue[^>]*>([^<]+)<\/ds:SignatureValue>/i);
      if (!signatureBlock) {
        logger.warn('No SAML signature found in response');
        return false;
      }

      const signedInfoMatch = xml.match(/<ds:SignedInfo[^>]*>([\s\S]*?)<\/ds:SignedInfo>/i);
      if (!signedInfoMatch) {
        logger.warn('No SignedInfo block found in SAML response');
        return false;
      }

      const certPem = certificate.includes('-----BEGIN')
        ? certificate
        : `-----BEGIN CERTIFICATE-----\n${certificate}\n-----END CERTIFICATE-----`;

      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(signedInfoMatch[0]);

      return verifier.verify(certPem, signatureBlock[1], 'base64');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('SAML signature verification error', { error: errMsg });
      return false;
    }
  }

  private generateSpMetadata(tenantId: string, providerId: string): string {
    const spEntityId = `${APP_URL}/api/auth/sso/saml/${providerId}/metadata`;
    const acsUrl = `${APP_URL}/api/auth/sso/saml/${providerId}/callback`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${spEntityId}">
  <md:SPSSODescriptor
    AuthnRequestsSigned="true"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${acsUrl}"
      index="1" />
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
  }

  private mapGroupsToRole(groups: string[], roleMapping: Record<string, string>): string {
    const roleHierarchy = ['admin', 'manager', 'editor', 'auditor', 'viewer'];
    let bestRole = 'viewer';
    let bestPriority = roleHierarchy.length;

    for (const group of groups) {
      const mappedRole = roleMapping[group];
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
}

export const ssoService = new SsoService();
