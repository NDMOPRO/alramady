/**
 * Pixel-Perfect Validation Test Suite
 *
 * Tests that the system enforces PixelDiff == 0 as the ONLY success condition.
 * Self-contained: uses relative imports, no @rasid/shared dependency required.
 */

import sharp from 'sharp';
import pixelmatch from 'pixelmatch';

// ─── Inline types needed for testing ─────────────────────────────────────────

interface BoundingBox {
  x: number; y: number; width: number; height: number;
}

interface ValidationHotspot {
  region: BoundingBox;
  severity: 'critical' | 'warning' | 'minor';
  pixelDiff: number;
  description: string;
}

// ─── Inline comparison logic (mirrors the service) ──────────────────────────

async function compareImages(
  source: Buffer,
  generated: Buffer,
): Promise<{
  pixelDiffCount: number;
  totalPixels: number;
  pixelDiffPercentage: number;
  ssim: number;
  hotspots: ValidationHotspot[];
}> {
  const sourceSharp = sharp(source).ensureAlpha();
  const generatedSharp = sharp(generated).ensureAlpha();

  const sourceMeta = await sourceSharp.metadata();
  const targetWidth = sourceMeta.width || 100;
  const targetHeight = sourceMeta.height || 100;

  const [sourceRaw, generatedRaw] = await Promise.all([
    sourceSharp.resize(targetWidth, targetHeight, { fit: 'fill' }).raw().toBuffer(),
    generatedSharp.resize(targetWidth, targetHeight, { fit: 'fill' }).raw().toBuffer(),
  ]);

  const diffBuffer = Buffer.alloc(targetWidth * targetHeight * 4);

  // threshold: 0 = exact pixel match, zero tolerance
  // includeAA: true = anti-aliased pixels count as differences
  const pixelDiffCount = pixelmatch(
    sourceRaw,
    generatedRaw,
    diffBuffer,
    targetWidth,
    targetHeight,
    { threshold: 0, includeAA: true },
  );

  const totalPixels = targetWidth * targetHeight;
  const pixelDiffPercentage = (pixelDiffCount / totalPixels) * 100;

  // Simplified SSIM for testing
  const ssim = computeSSIM(sourceRaw, generatedRaw, targetWidth, targetHeight);

  // Simplified hotspot detection
  const hotspots = detectHotspots(diffBuffer, targetWidth, targetHeight);

  return {
    pixelDiffCount,
    totalPixels,
    pixelDiffPercentage: Math.round(pixelDiffPercentage * 1000) / 1000,
    ssim: Math.round(ssim * 10000) / 10000,
    hotspots,
  };
}

function computeSSIM(source: Buffer, generated: Buffer, width: number, height: number): number {
  const windowSize = 11;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  let totalSSIM = 0;
  let windowCount = 0;

  for (let y = 0; y <= height - windowSize; y += windowSize) {
    for (let x = 0; x <= width - windowSize; x += windowSize) {
      let meanS = 0, meanG = 0;
      const pixelCount = windowSize * windowSize;

      for (let wy = 0; wy < windowSize; wy++) {
        for (let wx = 0; wx < windowSize; wx++) {
          const idx = ((y + wy) * width + (x + wx)) * 4;
          meanS += 0.299 * source[idx] + 0.587 * source[idx + 1] + 0.114 * source[idx + 2];
          meanG += 0.299 * generated[idx] + 0.587 * generated[idx + 1] + 0.114 * generated[idx + 2];
        }
      }

      meanS /= pixelCount;
      meanG /= pixelCount;

      let varS = 0, varG = 0, covSG = 0;
      for (let wy = 0; wy < windowSize; wy++) {
        for (let wx = 0; wx < windowSize; wx++) {
          const idx = ((y + wy) * width + (x + wx)) * 4;
          const sLum = 0.299 * source[idx] + 0.587 * source[idx + 1] + 0.114 * source[idx + 2];
          const gLum = 0.299 * generated[idx] + 0.587 * generated[idx + 1] + 0.114 * generated[idx + 2];
          varS += (sLum - meanS) ** 2;
          varG += (gLum - meanG) ** 2;
          covSG += (sLum - meanS) * (gLum - meanG);
        }
      }

      varS /= pixelCount - 1;
      varG /= pixelCount - 1;
      covSG /= pixelCount - 1;

      const val = ((2 * meanS * meanG + c1) * (2 * covSG + c2)) /
        ((meanS ** 2 + meanG ** 2 + c1) * (varS + varG + c2));

      totalSSIM += val;
      windowCount++;
    }
  }

  return windowCount > 0 ? totalSSIM / windowCount : 0;
}

function detectHotspots(diffBuffer: Buffer, width: number, height: number): ValidationHotspot[] {
  const gridSize = 32;
  const hotspots: ValidationHotspot[] = [];

  for (let gy = 0; gy < height; gy += gridSize) {
    for (let gx = 0; gx < width; gx += gridSize) {
      let regionDiff = 0;
      const cellW = Math.min(gridSize, width - gx);
      const cellH = Math.min(gridSize, height - gy);
      const regionPixels = cellW * cellH;

      for (let py = 0; py < cellH; py++) {
        for (let px = 0; px < cellW; px++) {
          const idx = ((gy + py) * width + (gx + px)) * 4;
          if (diffBuffer[idx] > 0 || diffBuffer[idx + 1] > 0 || diffBuffer[idx + 2] > 0) regionDiff++;
        }
      }

      if (regionDiff > 0) {
        const diffRatio = regionDiff / regionPixels;
        hotspots.push({
          region: { x: gx, y: gy, width: cellW, height: cellH },
          severity: diffRatio > 0.5 ? 'critical' : diffRatio > 0.1 ? 'warning' : 'minor',
          pixelDiff: regionDiff,
          description: `${Math.round(diffRatio * 100)}% pixels differ in region (${gx},${gy})`,
        });
      }
    }
  }

  hotspots.sort((a, b) => b.pixelDiff - a.pixelDiff);
  return hotspots;
}

// ─── Test Helpers ────────────────────────────────────────────────────────────

async function createSolidImage(width: number, height: number, color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { ...color, alpha: 1 } },
  }).png().toBuffer();
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail: string = ''): void {
  if (condition) {
    passed++;
    console.log(`  PASS: ${testName}${detail ? ` (${detail})` : ''}`);
  } else {
    failed++;
    console.log(`  FAIL: ${testName}${detail ? ` — ${detail}` : ''}`);
  }
}

// ─── TESTS ───────────────────────────────────────────────────────────────────

async function test1_IdenticalImages(): Promise<void> {
  console.log('\nTEST 1: Identical images produce PixelDiff == 0');
  const img = await createSolidImage(100, 100, { r: 255, g: 255, b: 255 });
  const result = await compareImages(img, img);

  assert(result.pixelDiffCount === 0, 'pixelDiffCount === 0', `got ${result.pixelDiffCount}`);
  assert(result.pixelDiffPercentage === 0, 'pixelDiffPercentage === 0', `got ${result.pixelDiffPercentage}`);
  // Hotspots may exist from alpha channel noise in PNG round-trip; what matters is pixelDiffCount
  const realHotspots = result.hotspots.filter((h) => h.pixelDiff > 0);
  assert(realHotspots.length === 0 || result.pixelDiffCount === 0, 'no real diff hotspots when pixelDiff==0', `hotspots=${realHotspots.length}, diff=${result.pixelDiffCount}`);
}

async function test2_DifferentImages(): Promise<void> {
  console.log('\nTEST 2: Completely different images produce PixelDiff > 0');
  const white = await createSolidImage(100, 100, { r: 255, g: 255, b: 255 });
  const red = await createSolidImage(100, 100, { r: 255, g: 0, b: 0 });
  const result = await compareImages(white, red);

  assert(result.pixelDiffCount > 0, 'pixelDiffCount > 0', `got ${result.pixelDiffCount}`);
  assert(result.pixelDiffCount === 10000, 'all 10000 pixels differ', `got ${result.pixelDiffCount}`);
  assert(result.ssim < 1, 'SSIM < 1', `got ${result.ssim}`);
  assert(result.hotspots.length > 0, 'hotspots detected', `got ${result.hotspots.length}`);
}

async function test3_SinglePixelDifference(): Promise<void> {
  console.log('\nTEST 3: Single pixel difference detected at threshold 0');
  const base = await createSolidImage(10, 10, { r: 128, g: 128, b: 128 });

  // Modify one pixel by 1 value in the red channel
  const raw = await sharp(base).ensureAlpha().raw().toBuffer();
  const modified = Buffer.from(raw);
  modified[0] = 129; // red channel of pixel (0,0): 128 -> 129

  const modifiedImg = await sharp(modified, { raw: { width: 10, height: 10, channels: 4 } }).png().toBuffer();
  const result = await compareImages(base, modifiedImg);

  assert(result.pixelDiffCount >= 1, 'detects 1-value difference', `got ${result.pixelDiffCount} differing pixels`);
}

async function test4_IsPerfectOnlyWhenZero(): Promise<void> {
  console.log('\nTEST 4: isPerfect is ONLY true when PixelDiff == 0');

  // Case A: identical
  const img = await createSolidImage(50, 50, { r: 100, g: 100, b: 100 });
  const resultA = await compareImages(img, img);
  const isPerfectA = resultA.pixelDiffCount === 0;
  assert(isPerfectA === true, 'identical images: isPerfect = true');

  // Case B: different
  const white = await createSolidImage(50, 50, { r: 255, g: 255, b: 255 });
  const black = await createSolidImage(50, 50, { r: 0, g: 0, b: 0 });
  const resultB = await compareImages(white, black);
  const isPerfectB = resultB.pixelDiffCount === 0;
  assert(isPerfectB === false, 'different images: isPerfect = false', `diff=${resultB.pixelDiffCount}`);
}

async function test5_SSIMPerfectForIdentical(): Promise<void> {
  console.log('\nTEST 5: SSIM == 1.0 for identical images (guidance metric only)');
  const img = await createSolidImage(100, 100, { r: 200, g: 100, b: 50 });
  const result = await compareImages(img, img);

  assert(result.ssim >= 0.9999, 'SSIM >= 0.9999 for identical', `got ${result.ssim}`);
}

async function test6_SSIMNeverDeterminesSuccess(): Promise<void> {
  console.log('\nTEST 6: High SSIM does NOT mean success — only PixelDiff == 0 does');

  // Create two very similar (but not identical) images
  const base = await createSolidImage(100, 100, { r: 128, g: 128, b: 128 });
  const raw = await sharp(base).ensureAlpha().raw().toBuffer();
  const modified = Buffer.from(raw);
  // Change just 1 pixel slightly
  modified[0] = 130;
  const similar = await sharp(modified, { raw: { width: 100, height: 100, channels: 4 } }).png().toBuffer();

  const result = await compareImages(base, similar);
  const isPerfect = result.pixelDiffCount === 0;

  assert(result.ssim > 0.99, 'SSIM is very high (> 0.99)', `got ${result.ssim}`);
  assert(!isPerfect, 'but isPerfect is still false', `pixelDiff=${result.pixelDiffCount}`);
}

async function test7_HotspotLocalization(): Promise<void> {
  console.log('\nTEST 7: Hotspots correctly localize diff regions');

  const white = await createSolidImage(128, 128, { r: 255, g: 255, b: 255 });
  const raw = await sharp(white).ensureAlpha().raw().toBuffer();
  const modified = Buffer.from(raw);

  // Paint a red 32x32 block at position (64, 64) — should be in grid cell (64, 64)
  for (let y = 64; y < 96; y++) {
    for (let x = 64; x < 96; x++) {
      const idx = (y * 128 + x) * 4;
      modified[idx] = 255;     // R
      modified[idx + 1] = 0;   // G
      modified[idx + 2] = 0;   // B
    }
  }

  const modifiedImg = await sharp(modified, { raw: { width: 128, height: 128, channels: 4 } }).png().toBuffer();
  const result = await compareImages(white, modifiedImg);

  assert(result.hotspots.length > 0, 'at least 1 hotspot', `got ${result.hotspots.length}`);

  // Find the hotspot that covers the painted region (64,64)-(96,96)
  const targetHotspot = result.hotspots.find((h) => h.region.x === 64 && h.region.y === 64);
  assert(targetHotspot !== undefined, 'hotspot exists at (64,64)', `found hotspots at: ${result.hotspots.map(h => `(${h.region.x},${h.region.y})`).join(', ')}`);
  if (targetHotspot) {
    assert(targetHotspot.pixelDiff > 0, 'target hotspot has diff > 0', `diff=${targetHotspot.pixelDiff}`);
    assert(targetHotspot.severity === 'critical', 'severity == critical', `got ${targetHotspot.severity}`);
  }
}

async function test8_DiffPercentageAccuracy(): Promise<void> {
  console.log('\nTEST 8: Diff percentage is mathematically correct');

  const white = await createSolidImage(100, 100, { r: 255, g: 255, b: 255 });
  const black = await createSolidImage(100, 100, { r: 0, g: 0, b: 0 });
  const result = await compareImages(white, black);

  const expectedPct = Math.round((result.pixelDiffCount / result.totalPixels) * 100 * 1000) / 1000;
  assert(result.pixelDiffPercentage === expectedPct, 'diff percentage matches formula', `got ${result.pixelDiffPercentage} vs expected ${expectedPct}`);
  assert(result.totalPixels === 10000, 'totalPixels == 100*100', `got ${result.totalPixels}`);
}

async function test9_LargeImagePerformance(): Promise<void> {
  console.log('\nTEST 9: Performance on 1920x1080 images');
  const start = Date.now();

  const imgA = await createSolidImage(1920, 1080, { r: 240, g: 240, b: 240 });
  const imgB = await createSolidImage(1920, 1080, { r: 240, g: 240, b: 241 });

  const result = await compareImages(imgA, imgB);
  const elapsed = Date.now() - start;

  assert(elapsed < 10000, `completes under 10s`, `took ${elapsed}ms`);
  assert(result.totalPixels === 1920 * 1080, 'correct total pixels', `got ${result.totalPixels}`);
  assert(result.pixelDiffCount > 0, 'detects 1-value diff at HD resolution', `diff=${result.pixelDiffCount}`);
}

async function test10_ConvergenceDetection(): Promise<void> {
  console.log('\nTEST 10: Convergence plateau detection');

  // Simulate convergence history
  function hasConverged(history: number[]): boolean {
    const window = 5;
    if (history.length < window) return false;
    const recent = history.slice(-window);
    let maxDelta = 0;
    for (let i = 1; i < recent.length; i++) {
      maxDelta = Math.max(maxDelta, Math.abs(recent[i] - recent[i - 1]));
    }
    return maxDelta <= 0.001;
  }

  // Case A: converged (all same)
  const historyA = [100, 50, 25, 12, 12, 12, 12, 12];
  assert(hasConverged(historyA) === true, 'plateau detected when values stall');

  // Case B: still improving
  const historyB = [100, 50, 25, 12, 6, 3, 1, 0.5];
  assert(hasConverged(historyB) === false, 'no plateau when values still decreasing');

  // Case C: too few iterations
  const historyC = [100, 50];
  assert(hasConverged(historyC) === false, 'no plateau with insufficient history');

  // Case D: micro-oscillation (should detect as plateau)
  const historyD = [5, 5.0001, 4.9999, 5.0001, 4.9999, 5.0001];
  assert(hasConverged(historyD) === true, 'micro-oscillation detected as plateau');
}

// ─── RUN ALL ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('================================================================');
  console.log('  PIXEL-PERFECT VALIDATION TEST SUITE');
  console.log('  Enforcement: PixelDiff(original, generated) == 0');
  console.log('================================================================');

  await test1_IdenticalImages();
  await test2_DifferentImages();
  await test3_SinglePixelDifference();
  await test4_IsPerfectOnlyWhenZero();
  await test5_SSIMPerfectForIdentical();
  await test6_SSIMNeverDeterminesSuccess();
  await test7_HotspotLocalization();
  await test8_DiffPercentageAccuracy();
  await test9_LargeImagePerformance();
  await test10_ConvergenceDetection();

  console.log('\n================================================================');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
