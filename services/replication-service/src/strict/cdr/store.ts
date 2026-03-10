/**
 * CDR Store — In-memory storage for CDR designs and data during pipeline execution.
 * Section 6: CDR is the single source of truth.
 */

import { createHash, randomUUID } from 'crypto';
import type {
  CdrDesign,
  CdrData,
  CdrDesignRef,
  CdrDataRef,
  CdrPage,
  CdrElement,
  CdrFingerprints,
  HashBundle,
} from './types';

export class CdrStore {
  private designs = new Map<string, CdrDesign>();
  private data = new Map<string, CdrData>();

  store(design: CdrDesign): CdrDesignRef {
    const id = randomUUID();
    const fingerprints = this.computeFingerprints(design);
    design.fingerprints = fingerprints;
    this.designs.set(id, design);
    return {
      cdr_design_id: id,
      page_count: design.pages.length,
    };
  }

  storeData(cdrData: CdrData): CdrDataRef {
    const id = randomUUID();
    this.data.set(id, cdrData);
    return {
      cdr_data_id: id,
      table_count: cdrData.tables.length,
    };
  }

  getDesign(ref: CdrDesignRef): CdrDesign | undefined {
    return this.designs.get(ref.cdr_design_id);
  }

  getData(ref: CdrDataRef): CdrData | undefined {
    return this.data.get(ref.cdr_data_id);
  }

  updateDesign(ref: CdrDesignRef, design: CdrDesign): CdrDesignRef {
    const fingerprints = this.computeFingerprints(design);
    design.fingerprints = fingerprints;
    this.designs.set(ref.cdr_design_id, design);
    return {
      cdr_design_id: ref.cdr_design_id,
      page_count: design.pages.length,
    };
  }

  clone(ref: CdrDesignRef): CdrDesignRef | undefined {
    const design = this.designs.get(ref.cdr_design_id);
    if (!design) return undefined;
    const cloned = JSON.parse(JSON.stringify(design)) as CdrDesign;
    return this.store(cloned);
  }

  computeFingerprints(design: CdrDesign): CdrFingerprints {
    return {
      layout_hash: this.hashLayout(design),
      structural_hash: this.hashStructure(design),
      typography_hash: this.hashTypography(design),
      render_intent_hash: this.hashRenderIntent(design),
    };
  }

  computeHashBundle(design: CdrDesign, pixelHash: string, perceptualHash?: string): HashBundle {
    const fp = this.computeFingerprints(design);
    const effectivePixelHash = pixelHash || this.sha256(`${fp.layout_hash}:${fp.structural_hash}:${fp.typography_hash}`);
    return {
      layout_hash: fp.layout_hash,
      structural_hash: fp.structural_hash,
      typography_hash: fp.typography_hash,
      pixel_hash: effectivePixelHash,
      perceptual_hash: perceptualHash || undefined,
    };
  }

  private hashLayout(design: CdrDesign): string {
    const data: unknown[] = [];
    for (const page of design.pages) {
      data.push({
        size: page.size_emu,
        elements: this.collectElementBboxes(page),
      });
    }
    return this.sha256(JSON.stringify(data));
  }

  private hashStructure(design: CdrDesign): string {
    const data: unknown[] = [];
    for (const page of design.pages) {
      for (const layer of page.layers) {
        for (const el of layer.elements) {
          data.push({
            kind: el.kind,
            bbox: el.bbox_emu,
            z: el.z_index,
            children: el.children?.length ?? 0,
          });
        }
      }
    }
    return this.sha256(JSON.stringify(data));
  }

  private hashTypography(design: CdrDesign): string {
    const textData: unknown[] = [];
    for (const page of design.pages) {
      for (const layer of page.layers) {
        this.collectTextElements(layer.elements, textData);
      }
    }
    return this.sha256(JSON.stringify(textData));
  }

  private hashRenderIntent(design: CdrDesign): string {
    const data = {
      version: design.version,
      locked: design.immutable_layout_lock_flag,
      pages: design.pages.length,
      assets: design.assets.length,
    };
    return this.sha256(JSON.stringify(data));
  }

  private collectElementBboxes(page: CdrPage): Array<{ bbox: unknown; z: number }> {
    const result: Array<{ bbox: unknown; z: number }> = [];
    for (const layer of page.layers) {
      for (const el of layer.elements) {
        result.push({ bbox: el.bbox_emu, z: el.z_index });
      }
    }
    return result;
  }

  private collectTextElements(elements: CdrElement[], target: unknown[]): void {
    for (const el of elements) {
      if (el.kind === 'text' && el.text) {
        target.push({
          text: el.text.text,
          runs: el.text.runs.map(r => ({
            font: r.font_family,
            size: r.font_size_emu,
            weight: r.font_weight,
          })),
          shaping: el.text.shaping?.arabic_mode,
        });
      }
      if (el.children) {
        this.collectTextElements(el.children, target);
      }
    }
  }

  private sha256(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }
}
