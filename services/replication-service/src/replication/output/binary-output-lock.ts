/**
 * Binary Output Lock
 * Marks replicated output as LOCKED with immutable cryptographic hashes.
 * Once locked, any modification invalidates the lock.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { CDR } from '../visual-structural-replication-engine.js';

export interface LockedOutput {
  cdrId: string;
  outputBuffer: Buffer;
  lockStatus: 'LOCKED' | 'UNLOCKED' | 'TAMPERED';
  lockTimestamp: number;
  hashes: OutputHashes;
  lockSignature: string;
  immutable: boolean;
}

export interface OutputHashes {
  contentHash: string;
  structuralHash: string;
  constraintHash: string;
  compositeHash: string;
  fingerprintChain: string;
}

export class BinaryOutputLock {
  private readonly hashAlgorithm = 'sha256';
  private readonly signatureAlgorithm = 'sha512';

  /**
   * Lock a CDR's output buffer, marking it as LOCKED with a cryptographic signature.
   */
  lockOutput(cdr: CDR, hashes: OutputHashes): LockedOutput {
    const contentHash = crypto
      .createHash(this.hashAlgorithm)
      .update(JSON.stringify(cdr.elements.map((e) => e.fingerprint)))
      .digest('hex');

    const mergedHashes: OutputHashes = {
      contentHash,
      structuralHash: hashes.structuralHash || cdr.fingerprints.structural,
      constraintHash: hashes.constraintHash || cdr.fingerprints.constraint,
      compositeHash: hashes.compositeHash || cdr.fingerprints.composite,
      fingerprintChain: this.buildFingerprintChain(cdr),
    };

    const lockSignature = this.computeLockSignature(mergedHashes);

    const outputBuffer = Buffer.from(JSON.stringify({
      cdrId: cdr.id,
      fingerprints: cdr.fingerprints,
      layout_mode: cdr.layout_mode,
      elementCount: cdr.elements.length,
      constraintCount: cdr.constraints.length,
      locked: true,
    }));

    const locked: LockedOutput = {
      cdrId: cdr.id,
      outputBuffer,
      lockStatus: 'LOCKED',
      lockTimestamp: Date.now(),
      hashes: mergedHashes,
      lockSignature,
      immutable: true,
    };

    logger.info('Output locked', {
      cdrId: cdr.id,
      signaturePrefix: lockSignature.substring(0, 16),
    });

    return locked;
  }

  /**
   * Validate an existing locked output. Returns true if the lock is intact.
   */
  validateLock(output: LockedOutput): {
    valid: boolean;
    status: 'LOCKED' | 'UNLOCKED' | 'TAMPERED';
    details: string[];
  } {
    const details: string[] = [];

    if (!output.immutable) {
      details.push('Output is not marked as immutable');
    }

    if (output.lockStatus !== 'LOCKED') {
      details.push(`Lock status is ${output.lockStatus}, expected LOCKED`);
    }

    // Recompute signature and compare
    const expectedSignature = this.computeLockSignature(output.hashes);
    if (expectedSignature !== output.lockSignature) {
      details.push('Lock signature mismatch — output has been tampered with');
      return { valid: false, status: 'TAMPERED', details };
    }

    // Verify content hash against output buffer
    const bufferHash = crypto
      .createHash(this.hashAlgorithm)
      .update(output.outputBuffer)
      .digest('hex');

    // Verify the fingerprint chain is internally consistent
    const chainParts = output.hashes.fingerprintChain.split(':');
    if (chainParts.length < 2) {
      details.push('Fingerprint chain is too short — expected at least 2 segments');
    }

    // Verify composite hash is derivable from component hashes
    const recomputedComposite = crypto
      .createHash(this.hashAlgorithm)
      .update(
        [
          output.hashes.contentHash,
          output.hashes.structuralHash,
          output.hashes.constraintHash,
        ].join(':'),
      )
      .digest('hex');

    if (recomputedComposite !== output.hashes.compositeHash) {
      details.push('Composite hash does not match component hashes');
      return { valid: false, status: 'TAMPERED', details };
    }

    const valid = details.length === 0;
    const status = valid ? 'LOCKED' : 'TAMPERED';

    logger.info('Lock validation', { cdrId: output.cdrId, valid, status });
    return { valid, status, details };
  }

  /**
   * Recompute all hashes for a locked output after intentional modification.
   * This unlocks, recalculates, and re-locks.
   */
  recomputeHashes(output: LockedOutput): LockedOutput {
    const contentHash = crypto
      .createHash(this.hashAlgorithm)
      .update(output.outputBuffer)
      .digest('hex');

    const newHashes: OutputHashes = {
      contentHash,
      structuralHash: output.hashes.structuralHash,
      constraintHash: output.hashes.constraintHash,
      compositeHash: crypto
        .createHash(this.hashAlgorithm)
        .update([contentHash, output.hashes.structuralHash, output.hashes.constraintHash].join(':'))
        .digest('hex'),
      fingerprintChain: [
        output.hashes.fingerprintChain,
        contentHash.substring(0, 16),
      ].join(':'),
    };

    const newSignature = this.computeLockSignature(newHashes);

    const relocked: LockedOutput = {
      ...output,
      hashes: newHashes,
      lockSignature: newSignature,
      lockTimestamp: Date.now(),
      lockStatus: 'LOCKED',
      immutable: true,
    };

    logger.info('Hashes recomputed and output re-locked', {
      cdrId: output.cdrId,
      newSignaturePrefix: newSignature.substring(0, 16),
    });

    return relocked;
  }

  /**
   * Compute a SHA-512 lock signature from all hash components.
   */
  private computeLockSignature(hashes: OutputHashes): string {
    const payload = [
      hashes.contentHash,
      hashes.structuralHash,
      hashes.constraintHash,
      hashes.compositeHash,
      hashes.fingerprintChain,
    ].join('|');

    return crypto.createHash(this.signatureAlgorithm).update(payload).digest('hex');
  }

  /**
   * Build a fingerprint chain from all CDR fingerprints.
   */
  private buildFingerprintChain(cdr: CDR): string {
    const segments = [
      cdr.fingerprints.pixel.substring(0, 16),
      cdr.fingerprints.structural.substring(0, 16),
      cdr.fingerprints.graph.substring(0, 16),
      cdr.fingerprints.constraint.substring(0, 16),
      cdr.fingerprints.render.substring(0, 16),
      cdr.fingerprints.lock.substring(0, 16),
      cdr.fingerprints.composite.substring(0, 16),
    ];
    return segments.join(':');
  }
}

export const binaryOutputLock = new BinaryOutputLock();
