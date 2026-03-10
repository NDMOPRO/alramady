import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PNG } from 'pngjs';
import { executeTool, initStrictEngine } from '../strict';
import type { ActionContext, RenderRef } from '../strict/cdr/types';

function writePng(filePath: string, rgba: [number, number, number, number][]): void {
  const png = new PNG({ width: 2, height: 2 });
  rgba.forEach((pixel, index) => {
    const offset = index * 4;
    png.data[offset] = pixel[0];
    png.data[offset + 1] = pixel[1];
    png.data[offset + 2] = pixel[2];
    png.data[offset + 3] = pixel[3];
  });
  writeFileSync(filePath, PNG.sync.write(png));
}

describe('STRICT contracts and pixel diff', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'rasid-strict-contracts-'));
  const context: ActionContext = {
    workspace_id: 'workspace-1',
    user_id: 'user-1',
    locale: 'ar-SA',
    strict_visual: true,
    arabic_mode: 'ELITE',
    mode: 'AUTO',
    font_policy: 'PROVIDED',
  };

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects tool execution when the request contract is invalid', async () => {
    initStrictEngine();

    await expect(executeTool({
      request_id: 'req-1',
      tool_id: 'extract.pdf_dom',
      context,
      inputs: {},
      params: {},
    } as never)).rejects.toThrow('extract.pdf_dom request contract violation');
  });

  it('rejects strict pixel diff requests when threshold is not zero', async () => {
    initStrictEngine();

    const sourcePath = join(tempDir, 'strict-source.png');
    const targetPath = join(tempDir, 'strict-target.png');
    writePng(sourcePath, [
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ]);
    writePng(targetPath, [
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ]);

    const renderBase = {
      dpi: 300,
      colorspace: 'sRGB' as const,
      engine_fingerprint: 'engine-123456',
      render_config_hash: 'render-config-123456',
      fingerprint: {
        layout_hash: 'a'.repeat(32),
        structural_hash: 'b'.repeat(32),
        typography_hash: 'c'.repeat(32),
        pixel_hash: 'd'.repeat(32),
      },
    };

    await expect(executeTool({
      request_id: 'req-threshold',
      tool_id: 'verify.pixel_diff',
      context,
      inputs: {
        source_render: { render_id: 'render-source-threshold', uri: sourcePath, ...renderBase } as RenderRef,
        target_render: { render_id: 'render-target-threshold', uri: targetPath, ...renderBase } as RenderRef,
      },
      params: { threshold: 1 },
    } as never)).rejects.toThrow('verify.pixel_diff request contract violation');
  });

  it('detects a real pixel mismatch from generated PNG renders', async () => {
    initStrictEngine();

    const sourcePath = join(tempDir, 'source.png');
    const targetPath = join(tempDir, 'target.png');
    writePng(sourcePath, [
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ]);
    writePng(targetPath, [
      [255, 255, 255, 255],
      [255, 0, 0, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ]);

    const renderBase = {
      dpi: 300,
      colorspace: 'sRGB' as const,
      engine_fingerprint: 'engine-123456',
      render_config_hash: 'render-config-123456',
      fingerprint: {
        layout_hash: 'a'.repeat(32),
        structural_hash: 'b'.repeat(32),
        typography_hash: 'c'.repeat(32),
        pixel_hash: 'd'.repeat(32),
      },
    };

    const response = await executeTool<{ diff: { pass: boolean; pixel_diff: number; heatmap_uri?: string } }>({
      request_id: 'req-2',
      tool_id: 'verify.pixel_diff',
      context,
      inputs: {
        source_render: { render_id: 'render-source-01', uri: sourcePath, ...renderBase } as RenderRef,
        target_render: { render_id: 'render-target-01', uri: targetPath, ...renderBase } as RenderRef,
      },
      params: { threshold: 0 },
    });

    expect(response.refs.diff.pass).toBe(false);
    expect(response.refs.diff.pixel_diff).toBeGreaterThan(0);
    expect(response.refs.diff.heatmap_uri).toBeTruthy();
  }, 20000);
});
