import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const baseDir = join(tmpdir(), 'rasid-strict-runtime');
const artifactsDir = join(baseDir, 'artifacts');
const rendersDir = join(baseDir, 'renders');
const heatmapsDir = join(baseDir, 'heatmaps');

function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}

export function getStrictRuntimeDir(): string {
  return ensureDir(baseDir);
}

export function getStrictArtifactsDir(): string {
  return ensureDir(artifactsDir);
}

export function getStrictRendersDir(): string {
  return ensureDir(rendersDir);
}

export function getStrictHeatmapsDir(): string {
  return ensureDir(heatmapsDir);
}
