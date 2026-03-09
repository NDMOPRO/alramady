import { ThemeEngineService } from '../services/theme-engine.service';
import { PlatformAppearanceService } from '../services/platform-appearance.service';
import { mockPrisma } from './helpers/mock-prisma';

describe('ThemeEngineService', () => {
  let service: ThemeEngineService;

  beforeEach(() => {
    service = new ThemeEngineService(mockPrisma as never);
  });

  it('creates a real catalog larger than 200 items when a theme is saved', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'theme-1',
        name: 'قيادي',
        is_system: false,
        created_at: new Date('2026-03-09T00:00:00.000Z'),
        updated_at: new Date('2026-03-09T00:00:00.000Z'),
        config: {
          description: 'ثيم قيادي',
          defaultMode: 'light',
          rtl: true,
          palettes: {},
          catalog: {
            totalElements: 216,
            families: [{ key: 'hero_panels', nameAr: 'ألواح الواجهة', count: 18 }],
            items: Array.from({ length: 216 }, (_, index) => ({
              key: `item-${index}`,
              family: 'hero_panels',
              familyNameAr: 'ألواح الواجهة',
              style: 'executive',
              shape: 'soft',
              nameAr: `عنصر ${index}`,
              usageAr: 'عنصر قابل لإعادة الاستخدام',
            })),
          },
        },
      },
    ]);

    const result = await service.createTheme({
      name: 'قيادي',
      description: 'ثيم قيادي',
      primaryColor: '#0F766E',
      semanticLabelAr: 'قيادي',
      semanticDefinitionAr: 'يعطي أولوية للوضوح والتدرج التنفيذي',
    });

    expect(result.name).toBe('قيادي');
    expect(result.catalog.totalElements).toBeGreaterThanOrEqual(216);
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('maps persisted rows into light and dark palettes', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'theme-2',
        name: 'ليلي',
        is_system: true,
        created_at: new Date('2026-03-09T00:00:00.000Z'),
        updated_at: new Date('2026-03-09T00:00:00.000Z'),
        config: {
          description: 'ثيم ليلي',
          defaultMode: 'dark',
          rtl: true,
          palettes: {
            dark: {
              primary: '#111827',
              secondary: '#1F2937',
              accent: '#38BDF8',
              background: '#020617',
              surface: '#0F172A',
              text: '#F8FAFC',
            },
          },
        },
      },
    ]);

    const result = await service.getTheme('theme-2');

    expect(result.defaultMode).toBe('dark');
    expect(result.palettes.dark.background).toBe('#020617');
    expect(result.palettes.light.primary).toBeTruthy();
  });
});

describe('PlatformAppearanceService', () => {
  let service: PlatformAppearanceService;

  beforeEach(() => {
    service = new PlatformAppearanceService(mockPrisma as never);
  });

  it('merges tenant settings into an operational appearance payload', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'tenant-1',
        name: 'راصد',
        logo: null,
        logo_url: 'https://assets.rasid.test/logo.svg',
        updated_at: new Date('2026-03-09T00:00:00.000Z'),
        settings: {
          appearance: {
            platformName: 'راصد برو',
            headerTitle: 'مركز المؤشرات',
            footerText: 'تشغيل داخلي',
            activeThemeId: 'theme-1',
            visualIdentity: {
              navStyle: 'executive',
              density: 'comfortable',
              accentUsage: 'balanced',
              shellStyle: 'premium',
            },
          },
        },
        settings_json: null,
      },
    ]);

    const result = await service.getAppearance('tenant-1');

    expect(result.platformName).toBe('راصد برو');
    expect(result.activeThemeId).toBe('theme-1');
    expect(result.visualIdentity.shellStyle).toBe('premium');
  });
});
