import { getThemeConfig, getAllThemes, getThemePresets } from '../../utils/theme-presets.js';

describe('Theme Presets', () => {
  describe('getAllThemes', () => {
    it('should return all theme names', () => {
      const themes = getAllThemes();
      expect(themes).toHaveLength(10);
      expect(themes).toContain('corporate-blue');
      expect(themes).toContain('modern-green');
      expect(themes).toContain('elegant-gray');
      expect(themes).toContain('dark-professional');
    });
  });

  describe('getThemeConfig', () => {
    it('should return corporate-blue theme', () => {
      const theme = getThemeConfig('corporate-blue');
      expect(theme.name).toBe('corporate-blue');
      expect(theme.primaryColor).toBe('#1F4E79');
      expect(theme.headerFg).toBe('#FFFFFF');
      expect(theme.fontFamily).toBeTruthy();
    });

    it('should return different configs for different themes', () => {
      const blue = getThemeConfig('corporate-blue');
      const green = getThemeConfig('modern-green');
      expect(blue.primaryColor).not.toBe(green.primaryColor);
    });

    it('should fallback to corporate-blue for unknown theme', () => {
      const theme = getThemeConfig('nonexistent' as any);
      expect(theme.name).toBe('corporate-blue');
    });

    it('should have valid color format for all themes', () => {
      const themes = getAllThemes();
      for (const name of themes) {
        const theme = getThemeConfig(name);
        expect(theme.primaryColor).toMatch(/^#[0-9A-F]{6}$/i);
        expect(theme.headerBg).toMatch(/^#[0-9A-F]{6}$/i);
        expect(theme.headerFg).toMatch(/^#[0-9A-F]{6}$/i);
        expect(theme.headerFontSize).toBeGreaterThan(0);
        expect(theme.bodyFontSize).toBeGreaterThan(0);
      }
    });
  });

  describe('getThemePresets', () => {
    it('should return all presets as object', () => {
      const presets = getThemePresets();
      expect(Object.keys(presets)).toHaveLength(10);
      expect(presets['corporate-blue']).toBeDefined();
    });
  });
});
