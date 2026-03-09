import { PrismaClient } from '@prisma/client';

export interface PlatformAppearance {
  tenantId: string;
  platformName: string;
  logoUrl: string | null;
  headerTitle: string;
  footerText: string;
  activeThemeId: string | null;
  visualIdentity: {
    navStyle: string;
    density: string;
    accentUsage: string;
    shellStyle: string;
  };
  updatedAt: Date;
}

export interface UpdatePlatformAppearanceInput {
  platformName?: string;
  logoUrl?: string | null;
  headerTitle?: string;
  footerText?: string;
  activeThemeId?: string | null;
  visualIdentity?: Partial<PlatformAppearance['visualIdentity']>;
}

interface DbTenantRow {
  id: string;
  name: string;
  logo: string | null;
  logo_url: string | null;
  settings: unknown;
  settings_json: unknown;
  updated_at: Date;
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  if (typeof value === 'object') {
    return value as T;
  }
  return fallback;
}

export class PlatformAppearanceService {
  constructor(private readonly prisma: PrismaClient) {}

  async getAppearance(tenantId?: string): Promise<PlatformAppearance> {
    const row = await this.getTenantRow(tenantId);
    const rawSettings = parseJsonValue<Record<string, unknown>>(
      row.settings ?? row.settings_json,
      {}
    );
    const appearance = parseJsonValue<Record<string, unknown>>(rawSettings.appearance, {});
    const visualIdentity = parseJsonValue<Record<string, unknown>>(appearance.visualIdentity, {});

    return {
      tenantId: row.id,
      platformName: String(appearance.platformName || row.name || 'راصد'),
      logoUrl: String(appearance.logoUrl || row.logo_url || row.logo || '') || null,
      headerTitle: String(appearance.headerTitle || row.name || 'منصة راصد'),
      footerText: String(appearance.footerText || 'راصد الإصدار التشغيلي'),
      activeThemeId: appearance.activeThemeId ? String(appearance.activeThemeId) : null,
      visualIdentity: {
        navStyle: String(visualIdentity.navStyle || 'executive'),
        density: String(visualIdentity.density || 'comfortable'),
        accentUsage: String(visualIdentity.accentUsage || 'balanced'),
        shellStyle: String(visualIdentity.shellStyle || 'premium'),
      },
      updatedAt: new Date(row.updated_at),
    };
  }

  async updateAppearance(
    tenantId: string | undefined,
    input: UpdatePlatformAppearanceInput
  ): Promise<PlatformAppearance> {
    const row = await this.getTenantRow(tenantId);
    const rawSettings = parseJsonValue<Record<string, unknown>>(
      row.settings ?? row.settings_json,
      {}
    );
    const appearance = parseJsonValue<Record<string, unknown>>(rawSettings.appearance, {});
    const currentVisualIdentity = parseJsonValue<Record<string, unknown>>(
      appearance.visualIdentity,
      {}
    );

    const nextAppearance = {
      ...appearance,
      ...(input.platformName !== undefined ? { platformName: input.platformName } : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
      ...(input.headerTitle !== undefined ? { headerTitle: input.headerTitle } : {}),
      ...(input.footerText !== undefined ? { footerText: input.footerText } : {}),
      ...(input.activeThemeId !== undefined ? { activeThemeId: input.activeThemeId } : {}),
      visualIdentity: {
        ...currentVisualIdentity,
        ...(input.visualIdentity ?? {}),
      },
    };

    const nextSettings = {
      ...rawSettings,
      appearance: nextAppearance,
    };

    await this.prisma.$queryRawUnsafe(
      `
        UPDATE tenants
        SET
          name = COALESCE($2, name),
          logo_url = $3,
          logo = $3,
          settings = $4::jsonb,
          updated_at = NOW()
        WHERE id = $1
      `,
      row.id,
      input.platformName ?? null,
      input.logoUrl !== undefined ? input.logoUrl : row.logo_url ?? row.logo,
      JSON.stringify(nextSettings)
    );

    return this.getAppearance(row.id);
  }

  private async getTenantRow(tenantId?: string): Promise<DbTenantRow> {
    const rows = tenantId
      ? await this.prisma.$queryRawUnsafe<DbTenantRow[]>(
          `
            SELECT id, name, logo, logo_url, settings, settings_json, updated_at
            FROM tenants
            WHERE id = $1 AND deleted_at IS NULL
            LIMIT 1
          `,
          tenantId
        )
      : await this.prisma.$queryRawUnsafe<DbTenantRow[]>(
          `
            SELECT id, name, logo, logo_url, settings, settings_json, updated_at
            FROM tenants
            WHERE deleted_at IS NULL
            ORDER BY created_at ASC
            LIMIT 1
          `
        );

    if (!rows[0]) {
      throw new Error('Tenant not found for appearance settings');
    }

    return rows[0];
  }
}
