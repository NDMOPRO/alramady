import { createHash } from 'crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';

jest.mock('pdf-parse', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue({
    text: '',
    numpages: 1,
    info: {},
  }),
}));

jest.mock('pdfkit', () => {
  const { EventEmitter } = require('events');
  class MockPDFDocument extends EventEmitter {
    addPage() {
      return this;
    }

    image() {
      return this;
    }

    end() {
      this.emit('data', Buffer.from('%PDF-1.4 mock\n'));
      this.emit('end');
    }
  }

  return {
    __esModule: true,
    default: MockPDFDocument,
  };
});

import {
  executeLctTool,
  getLctArtifact,
  getLctEvidence,
  listLctTools,
  resetLctUltraEngine,
  type LctAssetRef,
} from '../../services/lct-ultra-engine.service.js';

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function assetRef(path: string, mime: string): LctAssetRef {
  const buffer = readFileSync(path);
  return {
    asset_id: `asset_${hashBuffer(Buffer.from(path)).slice(0, 12)}`,
    uri: path,
    mime,
    sha256: hashBuffer(buffer),
    size_bytes: statSync(path).size,
  };
}

describe('LCT Ultra Engine', () => {
  let sandboxDir: string;

  beforeEach(() => {
    resetLctUltraEngine();
    sandboxDir = mkdtempSync(join(tmpdir(), 'rasid-lct-test-'));
  });

  afterEach(() => {
    rmSync(sandboxDir, { recursive: true, force: true });
  });

  it('runs transcript + localization + multi-format export with stored evidence', async () => {
    const videoPath = join(sandboxDir, 'meeting.mp4');
    writeFileSync(videoPath, Buffer.from('fake-video-binary'));
    writeFileSync(`${videoPath}.engine1.txt`, 'Revenue report and sales growth for customer status and monthly analysis.');
    writeFileSync(`${videoPath}.engine2.txt`, 'Revenue report and sales growth for customer status and monthly analysis.');
    writeFileSync(`${videoPath}.ocr.txt`, 'Revenue 2024 sales growth');
    writeFileSync(`${videoPath}.meta.json`, JSON.stringify({ duration_seconds: 14 }, null, 2), 'utf8');

    const response = await executeLctTool<{ artifacts: Array<{ artifact_id: string; kind: string; uri: string }>; evidence_id: string }>({
      request_id: 'req_lct_001',
      tool_id: 'lct.orch.any_to_any',
      context: {
        workspace_id: 'ws_demo',
        user_id: 'user_demo',
        mode: 'AUTO',
        arabic_mode: 'ELITE',
        locale: 'ar-SA',
      },
      inputs: {
        assets: [assetRef(videoPath, 'video/mp4')],
        instruction: 'Create Arabic report pack from this meeting',
      },
      params: {
        targets: ['srt', 'docx', 'pdf', 'pptx', 'json'],
        claims: ['TRANSCRIBE_STRICT_100', 'LOCALIZE_PRO_100'],
        target_language: 'ar',
        fidelity_mode: 'smart',
        classification: 'internal',
      },
    });

    expect(response.status).toBe('ok');
    const kinds = response.refs.artifacts.map(artifact => artifact.kind).sort();
    expect(kinds).toEqual(['docx', 'json', 'pdf', 'pptx', 'srt']);
    for (const artifact of response.refs.artifacts) {
      expect(existsSync(artifact.uri)).toBe(true);
      expect(getLctArtifact(artifact.artifact_id)).toBeDefined();
    }
    const docxArtifact = response.refs.artifacts.find(artifact => artifact.kind === 'docx');
    expect(docxArtifact).toBeDefined();
    const storedDocx = getLctArtifact(docxArtifact!.artifact_id);
    expect(storedDocx?.metadata.editable_core).toBe(true);
    expect(storedDocx?.metadata.text_runs).toBe(true);

    const evidence = getLctEvidence(response.refs.evidence_id);
    expect(evidence).toBeDefined();
    expect(existsSync(evidence!.uri)).toBe(true);
    expect(evidence!.reports.transcribe).toBeDefined();
    expect(evidence!.reports.localization).toBeDefined();
  });

  it('passes the zero pixel gate for raster-preserving strict png conversion', async () => {
    const imagePath = join(sandboxDir, 'snapshot.png');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <rect x="20" y="20" width="280" height="140" rx="18" fill="#dbeafe" stroke="#2563eb" stroke-width="4"/>
      <text x="160" y="100" font-size="28" text-anchor="middle" font-family="Segoe UI">STRICT</text>
    </svg>`;
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    writeFileSync(imagePath, pngBuffer);

    const response = await executeLctTool<{ artifacts: Array<{ artifact_id: string; kind: string; uri: string }>; evidence_id: string }>({
      request_id: 'req_lct_002',
      tool_id: 'lct.orch.any_to_any',
      context: {
        workspace_id: 'ws_demo',
        user_id: 'user_demo',
        mode: 'AUTO',
        arabic_mode: 'ELITE',
        locale: 'ar-SA',
      },
      inputs: {
        assets: [assetRef(imagePath, 'image/png')],
        instruction: 'Replicate this image strictly',
      },
      params: {
        targets: ['png'],
        claims: ['CONVERT_STRICT_1TO1_100'],
        classification: 'internal',
      },
    });

    expect(response.status).toBe('ok');
    expect(response.refs.artifacts).toHaveLength(1);
    expect(response.refs.artifacts[0].kind).toBe('png');
    const evidence = getLctEvidence(response.refs.evidence_id);
    expect(evidence).toBeDefined();
    const convertReport = evidence?.reports.convert as Record<string, unknown>;
    const pixelGate = convertReport.pixel_gate as Record<string, unknown>;
    expect(pixelGate.pass).toBe(true);
    expect(pixelGate.pixel_diff).toBe(0);
  });

  it('lists the full LCT tool registry', () => {
    const tools = listLctTools();
    expect(tools.length).toBeGreaterThanOrEqual(18);
    expect(tools.some(tool => tool.tool_id === 'lct.orch.any_to_any')).toBe(true);
    expect(tools.some(tool => tool.tool_id === 'verifier.ops.dispatch')).toBe(true);
  });
});
