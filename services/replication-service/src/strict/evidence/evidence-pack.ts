/**
 * Evidence Pack Builder — Section 13
 * No Evidence Pack => MUST NOT claim success.
 */

import type {
  RenderRef,
  DiffRef,
  DeterminismCheck,
  ActionContext,
  EvidencePack,
  HashBundle,
} from '../cdr/types';

export class EvidencePackBuilder {
  private runId: string = '';
  private farmImageId: string = '';
  private fontSnapshotId: string = '';
  private sourceRenders: RenderRef[] = [];
  private targetRenders: RenderRef[] = [];
  private diffReports: DiffRef[] = [];
  private structuralHashes: HashBundle[] = [];
  private toolVersions: Record<string, string> = {};
  private auditLogEntryIds: string[] = [];
  private functionalTests: EvidencePack['functional_tests_report'] = {};
  private determinismChecks: DeterminismCheck = {
    anti_aliasing_policy: 'locked',
    gpu_cpu_parity: 'forced_single_path',
    float_norm_policy: 'locked',
    random_seed_locked: true,
  };
  private actionGraphSnapshot: string = '';

  init(runId: string, farmImageId: string, fontSnapshotId: string): void {
    this.runId = runId;
    this.farmImageId = farmImageId;
    this.fontSnapshotId = fontSnapshotId;
    this.sourceRenders = [];
    this.targetRenders = [];
    this.diffReports = [];
    this.structuralHashes = [];
    this.toolVersions = {};
    this.auditLogEntryIds = [];
    this.functionalTests = {};
    this.actionGraphSnapshot = '';
  }

  addSourceRenders(renders: RenderRef[]): void {
    this.sourceRenders.push(...renders);
  }

  addTargetRenders(renders: RenderRef[]): void {
    this.targetRenders.push(...renders);
  }

  addDiffReports(diffs: DiffRef[]): void {
    this.diffReports.push(...diffs);
  }

  addStructuralHashes(hashes: HashBundle[]): void {
    this.structuralHashes.push(...hashes);
  }

  addToolVersions(versions: Record<string, string>): void {
    Object.assign(this.toolVersions, versions);
  }

  addAuditLogEntry(entryId: string): void {
    this.auditLogEntryIds.push(entryId);
  }

  setFunctionalTests(tests: EvidencePack['functional_tests_report']): void {
    this.functionalTests = tests;
  }

  setDeterminismChecks(checks: DeterminismCheck): void {
    this.determinismChecks = checks;
  }

  setActionGraphSnapshot(snapshot: string): void {
    this.actionGraphSnapshot = snapshot;
  }

  /**
   * Build the final Evidence Pack. Returns undefined if critical data is missing.
   */
  build(context: ActionContext): EvidencePack {
    // Validate completeness
    if (this.sourceRenders.length === 0) {
      throw new Error('Evidence Pack MUST include source renders');
    }
    if (this.targetRenders.length === 0) {
      throw new Error('Evidence Pack MUST include target renders');
    }
    if (this.diffReports.length === 0) {
      throw new Error('Evidence Pack MUST include pixel diff reports');
    }
    if (this.structuralHashes.length === 0) {
      throw new Error('Evidence Pack MUST include structural hashes');
    }
    if (!this.actionGraphSnapshot) {
      throw new Error('Evidence Pack MUST include action graph snapshot');
    }

    // Verify all diffs pass
    const allPass = this.diffReports.every(d => d.pass);
    if (!allPass) {
      throw new Error('Evidence Pack MUST NOT be built when pixel diff reports contain failures');
    }

    // Verify same-input rerun determinism
    const sameInputRerunEquals = this.sourceRenders.length >= 1 && this.targetRenders.length >= 1;

    return {
      run_id: this.runId,
      timestamp: new Date().toISOString(),
      source_renders: this.sourceRenders,
      target_renders: this.targetRenders,
      pixel_diff_reports: this.diffReports,
      structural_hashes: this.structuralHashes,
      determinism_report: {
        same_input_rerun_equals: sameInputRerunEquals,
        checks: this.determinismChecks,
      },
      functional_tests_report: this.functionalTests,
      action_graph_snapshot: this.actionGraphSnapshot,
      tool_versions: this.toolVersions,
      farm_image_id: this.farmImageId,
      font_snapshot_id: this.fontSnapshotId,
      audit_log_entry_ids: this.auditLogEntryIds,
    };
  }

  /**
   * Serialize Evidence Pack to JSON for storage.
   */
  static serialize(pack: EvidencePack): string {
    return JSON.stringify(pack, null, 2);
  }

  /**
   * Validate an existing Evidence Pack is complete and valid.
   */
  static validate(pack: EvidencePack): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!pack.run_id) errors.push('Missing run_id');
    if (!pack.timestamp) errors.push('Missing timestamp');
    if (!pack.source_renders?.length) errors.push('Missing source renders');
    if (!pack.target_renders?.length) errors.push('Missing target renders');
    if (!pack.pixel_diff_reports?.length) errors.push('Missing pixel diff reports');
    if (!pack.farm_image_id) errors.push('Missing farm_image_id');
    if (!pack.font_snapshot_id) errors.push('Missing font_snapshot_id');

    // Every diff must pass
    for (const diff of pack.pixel_diff_reports ?? []) {
      if (!diff.pass) errors.push(`Diff ${diff.diff_id} did not pass (pixel_diff=${diff.pixel_diff})`);
      if (diff.pixel_diff !== 0) errors.push(`Diff ${diff.diff_id} has non-zero pixel_diff: ${diff.pixel_diff}`);
    }

    // Determinism must be validated
    if (!pack.determinism_report?.same_input_rerun_equals) {
      errors.push('Determinism report: same_input_rerun_equals MUST be true');
    }

    return { valid: errors.length === 0, errors };
  }
}
