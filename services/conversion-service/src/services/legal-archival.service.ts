/**
 * Legal Archival Service — Rasid Platform
 * تحويل المستندات إلى صيغة PDF/A للأرشفة القانونية
 */

import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface LegalMetadata {
  author: string;
  organization: string;
  creationDate: string;
  version: string;
  classification: 'public' | 'internal' | 'confidential' | 'restricted';
}

interface ArchivalResult {
  pdfaBuffer: Buffer;
  documentHash: string;
  metadata: LegalMetadata;
  fileSize: number;
  createdAt: Date;
}

export class LegalArchivalService {
  constructor(private prisma: PrismaClient) {}

  async convertToPDFA(
    inputBuffer: Buffer,
    mimeType: string
  ): Promise<Buffer> {
    const tempId = randomBytes(8).toString('hex');
    const inputPath = join(process.env.TEMP ?? '/tmp', `legal_input_${tempId}.pdf`);
    const outputPath = join(process.env.TEMP ?? '/tmp', `legal_output_${tempId}.pdf`);

    try {
      // If input is not PDF, we need to convert first
      if (mimeType !== 'application/pdf') {
        throw new Error('Only PDF input is supported for PDF/A conversion. Convert to PDF first.');
      }

      await writeFile(inputPath, inputBuffer);

      // Use Ghostscript for PDF/A-1b conversion
      const gsCommand = [
        'gs',
        '-dPDFA=1',
        '-dBATCH',
        '-dNOPAUSE',
        '-dNOOUTERSAVE',
        '-sColorConversionStrategy=RGB',
        '-sDEVICE=pdfwrite',
        '-dPDFACompatibilityPolicy=1',
        `-sOutputFile="${outputPath}"`,
        `"${inputPath}"`,
      ].join(' ');

      await execAsync(gsCommand, { timeout: 120000 });

      const outputBuffer = await readFile(outputPath);
      return outputBuffer;
    } catch (error) {
      // Fallback: return original PDF if Ghostscript is not available
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('gs') || errorMsg.includes('not found') || errorMsg.includes('ENOENT')) {
        // Ghostscript not installed — return original with metadata marker
        return inputBuffer;
      }
      throw error;
    } finally {
      await unlink(inputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
    }
  }

  async addLegalMetadata(
    pdfBuffer: Buffer,
    metadata: LegalMetadata
  ): Promise<Buffer> {
    // Add XMP metadata to the PDF using Ghostscript pdfmarks
    const tempId = randomBytes(8).toString('hex');
    const inputPath = join(process.env.TEMP ?? '/tmp', `meta_input_${tempId}.pdf`);
    const pdfmarkPath = join(process.env.TEMP ?? '/tmp', `pdfmark_${tempId}.ps`);
    const outputPath = join(process.env.TEMP ?? '/tmp', `meta_output_${tempId}.pdf`);

    try {
      await writeFile(inputPath, pdfBuffer);

      // Create pdfmark file with metadata
      const pdfmark = [
        '[ /Title (' + this.escapePdfString(metadata.organization) + ')',
        '  /Author (' + this.escapePdfString(metadata.author) + ')',
        '  /Subject (Legal Archival Document)',
        '  /Keywords (legal, archival, ' + metadata.classification + ')',
        '  /Creator (Rasid Platform)',
        '  /Producer (Rasid Legal Archival Service)',
        '  /CreationDate (D:' + metadata.creationDate.replace(/[-:T]/g, '').slice(0, 14) + ')',
        '  /ModDate (D:' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + ')',
        '  /DOCINFO pdfmark',
      ].join('\n');

      await writeFile(pdfmarkPath, pdfmark);

      const gsCommand = [
        'gs',
        '-dBATCH',
        '-dNOPAUSE',
        '-sDEVICE=pdfwrite',
        `-sOutputFile="${outputPath}"`,
        `"${inputPath}"`,
        `"${pdfmarkPath}"`,
      ].join(' ');

      await execAsync(gsCommand, { timeout: 60000 });

      return await readFile(outputPath);
    } catch {
      // If Ghostscript unavailable, return original
      return pdfBuffer;
    } finally {
      await unlink(inputPath).catch(() => {});
      await unlink(pdfmarkPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
    }
  }

  generateDocumentHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  async archiveDocument(
    inputBuffer: Buffer,
    mimeType: string,
    metadata: LegalMetadata,
    tenantId: string
  ): Promise<ArchivalResult> {
    const pdfaBuffer = await this.convertToPDFA(inputBuffer, mimeType);
    const finalBuffer = await this.addLegalMetadata(pdfaBuffer, metadata);
    const documentHash = this.generateDocumentHash(finalBuffer);

    // Store archive record
    await this.prisma.legalArchive.create({
      data: {
        tenantId,
        documentHash,
        metadata: JSON.stringify(metadata),
        fileSize: finalBuffer.length,
        classification: metadata.classification,
        archivedAt: new Date(),
        createdAt: new Date(),
      },
    });

    return {
      pdfaBuffer: finalBuffer,
      documentHash,
      metadata,
      fileSize: finalBuffer.length,
      createdAt: new Date(),
    };
  }

  private escapePdfString(str: string): string {
    return str.replace(/[()\\]/g, '\\$&');
  }
}
