import { PrismaClient } from '@prisma/client';
import { formatConverterService } from './format-converter.service.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

const prisma = new PrismaClient();

interface ConversionResult {
  filename: string;
  status: 'fulfilled' | 'rejected';
  buffer?: Buffer;
  outputFilename?: string;
  mimeType?: string;
  error?: string;
  durationMs?: number;
}

interface PipelineStep {
  fromFormat: string;
  toFormat: string;
  options?: Record<string, unknown>;
}

const FILE_SIGNATURES: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46],
  png: [0x89, 0x50, 0x4E, 0x47],
  jpg: [0xFF, 0xD8, 0xFF],
  gif: [0x47, 0x49, 0x46],
  webp: [0x52, 0x49, 0x46, 0x46],
  zip: [0x50, 0x4B, 0x03, 0x04],
  docx: [0x50, 0x4B, 0x03, 0x04],
  xlsx: [0x50, 0x4B, 0x03, 0x04],
};

export class BatchConverterService {

  /**
   * Batch convert multiple files to a target format using Promise.allSettled.
   * Tracks progress and returns detailed results array.
   */
  async batchConvert(
    files: Array<{ buffer: Buffer; filename: string }>,
    targetFormat: string,
    tenantId: string,
    userId: string
  ): Promise<{
    batchId: string;
    total: number;
    succeeded: number;
    failed: number;
    results: ConversionResult[];
    durationMs: number;
  }> {
    const batchId = crypto.randomUUID();
    const batchStartTime = Date.now();
    logger.info('Starting batch conversion', {
      batchId,
      fileCount: files.length,
      targetFormat,
      tenantId,
      userId,
    });

    const fileNames = files.map((f) => f.filename);
    logger.info('Files in batch', { batchId, files: fileNames });

    const conversionPromises = files.map(async (file) => {
      const fileStart = Date.now();
      const sourceExt = file.filename.split('.').pop()?.toLowerCase() || '';
      const conversionKey = `${sourceExt}_to_${targetFormat}`;

      logger.info('Processing file in batch', {
        batchId,
        filename: file.filename,
        conversionKey,
        fileSize: file.buffer.length,
      });

      let result: { buffer: Buffer; outputFilename: string; mimeType: string };

      switch (conversionKey) {
        case 'pdf_to_docx':
        case 'pdf_to_word': {
          const r = await formatConverterService.convertPDFtoWord(file.buffer, file.filename, tenantId, userId);
          result = { buffer: r.buffer, outputFilename: r.outputFilename, mimeType: r.mimeType };
          break;
        }
        case 'docx_to_pdf':
        case 'doc_to_pdf': {
          const r = await formatConverterService.convertWordToPDF(file.buffer, file.filename, tenantId, userId);
          result = { buffer: r.buffer, outputFilename: r.outputFilename, mimeType: r.mimeType };
          break;
        }
        case 'xlsx_to_pdf':
        case 'xls_to_pdf': {
          const r = await formatConverterService.convertExcelToPDF(file.buffer, file.filename, tenantId, userId);
          result = { buffer: r.buffer, outputFilename: r.outputFilename, mimeType: r.mimeType };
          break;
        }
        case 'csv_to_xlsx': {
          const r = await formatConverterService.convertCSVtoExcel(file.buffer, file.filename);
          result = { buffer: r.buffer, outputFilename: r.outputFilename, mimeType: r.mimeType };
          break;
        }
        case 'xlsx_to_csv':
        case 'xls_to_csv': {
          const r = await formatConverterService.convertExcelToCSV(file.buffer);
          result = {
            buffer: Buffer.from(r.csv, 'utf-8'),
            outputFilename: r.outputFilename,
            mimeType: r.mimeType,
          };
          break;
        }
        case 'png_to_jpg':
        case 'png_to_webp':
        case 'png_to_avif':
        case 'jpg_to_png':
        case 'jpg_to_webp':
        case 'jpg_to_avif':
        case 'jpeg_to_png':
        case 'jpeg_to_webp':
        case 'jpeg_to_avif':
        case 'webp_to_png':
        case 'webp_to_jpg':
        case 'avif_to_png':
        case 'avif_to_jpg':
        case 'avif_to_webp': {
          const r = await formatConverterService.convertImageFormat(
            file.buffer,
            targetFormat as 'png' | 'jpg' | 'webp' | 'avif'
          );
          result = { buffer: r.buffer, outputFilename: r.outputFilename, mimeType: r.mimeType };
          break;
        }
        default:
          throw new Error(`Unsupported batch conversion: ${conversionKey}`);
      }

      const fileDuration = Date.now() - fileStart;
      logger.info('File conversion completed in batch', {
        batchId,
        filename: file.filename,
        durationMs: fileDuration,
        outputSize: result.buffer.length,
      });

      return {
        ...result,
        durationMs: fileDuration,
        originalFilename: file.filename,
      };
    });

    const settledResults = await Promise.allSettled(conversionPromises);

    const results: ConversionResult[] = settledResults.map((settled, index) => {
      if (settled.status === 'fulfilled') {
        return {
          filename: files[index].filename,
          status: 'fulfilled' as const,
          buffer: settled.value.buffer,
          outputFilename: settled.value.outputFilename,
          mimeType: settled.value.mimeType,
          durationMs: settled.value.durationMs,
        };
      } else {
        const errorMessage = settled.reason instanceof Error
          ? settled.reason.message
          : String(settled.reason);
        logger.error('File conversion failed in batch', {
          batchId,
          filename: files[index].filename,
          error: errorMessage,
        });
        return {
          filename: files[index].filename,
          status: 'rejected' as const,
          error: errorMessage,
        };
      }
    });

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    const totalDuration = Date.now() - batchStartTime;

    await prisma.conversionJob.create({
      data: {
        tenantId,
        userId,
        sourceFormat: 'BATCH',
        targetFormat: targetFormat.toUpperCase() as string,
        sourceFilename: `batch_${files.length}_files`,
        outputFilename: `batch_result_${batchId}`,
        status: failed === 0 ? 'COMPLETED' : failed === files.length ? 'FAILED' : 'FAILED',
        durationMs: totalDuration,
        metadata: JSON.stringify({
          batchId,
          total: files.length,
          succeeded,
          failed,
          fileNames: files.map((f) => f.filename),
        }),
      },
    });

    logger.info('Batch conversion completed', {
      batchId,
      total: files.length,
      succeeded,
      failed,
      durationMs: totalDuration,
    });

    return {
      batchId,
      total: files.length,
      succeeded,
      failed,
      results,
      durationMs: totalDuration,
    };
  }

  /**
   * Validate a conversion by comparing original and converted buffers.
   * Checks for non-empty output, correct magic bytes, and reasonable size ratio.
   */
  async validateConversion(
    originalBuffer: Buffer,
    convertedBuffer: Buffer,
    sourceFormat: string,
    targetFormat: string
  ): Promise<{
    valid: boolean;
    checks: Array<{ name: string; passed: boolean; detail: string }>;
    sizeRatio: number;
    warnings: string[];
  }> {
    logger.info('Validating conversion', {
      sourceFormat,
      targetFormat,
      originalSize: originalBuffer.length,
      convertedSize: convertedBuffer.length,
    });

    const checks: Array<{ name: string; passed: boolean; detail: string }> = [];
    const warnings: string[] = [];

    const originalNonEmpty = originalBuffer.length > 0;
    checks.push({
      name: 'original_non_empty',
      passed: originalNonEmpty,
      detail: originalNonEmpty
        ? `Original file is ${originalBuffer.length} bytes`
        : 'Original file is empty',
    });

    const convertedNonEmpty = convertedBuffer.length > 0;
    checks.push({
      name: 'converted_non_empty',
      passed: convertedNonEmpty,
      detail: convertedNonEmpty
        ? `Converted file is ${convertedBuffer.length} bytes`
        : 'Converted file is empty',
    });

    const minimumSize = 10;
    const hasMinimumSize = convertedBuffer.length >= minimumSize;
    checks.push({
      name: 'minimum_size',
      passed: hasMinimumSize,
      detail: hasMinimumSize
        ? `Converted file meets minimum size requirement (${minimumSize} bytes)`
        : `Converted file is too small: ${convertedBuffer.length} bytes`,
    });

    const normalizedTarget = targetFormat.toLowerCase().replace('.', '');
    const expectedSignature = FILE_SIGNATURES[normalizedTarget];
    let signatureValid = true;

    if (expectedSignature && convertedBuffer.length >= expectedSignature.length) {
      const actualBytes = Array.from(convertedBuffer.subarray(0, expectedSignature.length));
      signatureValid = expectedSignature.every((byte, idx) => actualBytes[idx] === byte);
      checks.push({
        name: 'magic_bytes',
        passed: signatureValid,
        detail: signatureValid
          ? `File signature matches expected ${normalizedTarget} format`
          : `File signature mismatch: expected [${expectedSignature.map((b) => '0x' + b.toString(16)).join(', ')}], got [${actualBytes.map((b) => '0x' + b.toString(16)).join(', ')}]`,
      });
    } else if (expectedSignature) {
      signatureValid = false;
      checks.push({
        name: 'magic_bytes',
        passed: false,
        detail: 'File too small to check magic bytes',
      });
    } else {
      checks.push({
        name: 'magic_bytes',
        passed: true,
        detail: `No magic byte signature defined for format "${normalizedTarget}", skipping check`,
      });
    }

    const sizeRatio = convertedBuffer.length / Math.max(originalBuffer.length, 1);
    const sizeReasonable = sizeRatio > 0.001 && sizeRatio < 1000;
    checks.push({
      name: 'size_ratio',
      passed: sizeReasonable,
      detail: `Size ratio: ${sizeRatio.toFixed(4)} (converted/original)`,
    });

    if (sizeRatio > 50) {
      warnings.push(`Output is ${sizeRatio.toFixed(1)}x larger than input, which may indicate an issue`);
    }
    if (sizeRatio < 0.01) {
      warnings.push(`Output is ${(sizeRatio * 100).toFixed(2)}% of input size, potentially too small`);
    }

    const notCorrupted = convertedBuffer.length >= minimumSize && convertedNonEmpty;
    checks.push({
      name: 'integrity',
      passed: notCorrupted,
      detail: notCorrupted
        ? 'Basic integrity check passed'
        : 'File may be corrupted (too small or empty)',
    });

    const allPassed = checks.every((c) => c.passed);

    logger.info('Conversion validation completed', {
      valid: allPassed,
      checksPassed: checks.filter((c) => c.passed).length,
      checksFailed: checks.filter((c) => !c.passed).length,
      warningCount: warnings.length,
    });

    return {
      valid: allPassed,
      checks,
      sizeRatio: parseFloat(sizeRatio.toFixed(4)),
      warnings,
    };
  }

  /**
   * Create a multi-step conversion pipeline and store it in the database.
   */
  async createPipeline(
    name: string,
    steps: PipelineStep[],
    tenantId: string,
    userId: string
  ): Promise<{
    id: string;
    name: string;
    steps: PipelineStep[];
    createdAt: Date;
  }> {
    logger.info('Creating conversion pipeline', { name, stepCount: steps.length, tenantId });

    if (!name || name.trim().length === 0) {
      throw new Error('Pipeline name is required');
    }

    if (!steps || steps.length === 0) {
      throw new Error('Pipeline must have at least one step');
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step.fromFormat || !step.toFormat) {
        throw new Error(`Step ${i + 1} must have both fromFormat and toFormat`);
      }
      if (i > 0) {
        const previousStep = steps[i - 1];
        if (previousStep.toFormat !== step.fromFormat) {
          throw new Error(
            `Pipeline step mismatch: step ${i} outputs "${previousStep.toFormat}" but step ${i + 1} expects "${step.fromFormat}"`
          );
        }
      }
    }

    const pipeline = await prisma.conversionPipeline.create({
      data: {
        name: name.trim(),
        tenantId,
        userId,
        steps: JSON.stringify(steps),
        status: 'ACTIVE',
        metadata: JSON.stringify({
          inputFormat: steps[0].fromFormat,
          outputFormat: steps[steps.length - 1].toFormat,
          stepCount: steps.length,
        }),
      },
    });

    logger.info('Pipeline created successfully', {
      pipelineId: pipeline.id,
      name: pipeline.name,
      steps: steps.length,
    });

    return {
      id: pipeline.id,
      name: pipeline.name,
      steps,
      createdAt: pipeline.createdAt,
    };
  }

  /**
   * Execute a stored pipeline: load from DB, run each step sequentially,
   * feeding the output of one step as input to the next.
   */
  async executePipeline(
    pipelineId: string,
    file: Buffer,
    filename: string
  ): Promise<{
    pipelineId: string;
    pipelineName: string;
    stepsExecuted: number;
    finalBuffer: Buffer;
    finalFilename: string;
    finalMimeType: string;
    stepResults: Array<{ step: number; from: string; to: string; durationMs: number; outputSize: number }>;
    totalDurationMs: number;
  }> {
    const executionStart = Date.now();
    logger.info('Executing pipeline', { pipelineId, filename, inputSize: file.length });

    const pipeline = await prisma.conversionPipeline.findUnique({
      where: { id: pipelineId },
    });

    if (!pipeline) {
      throw new Error(`Pipeline "${pipelineId}" not found`);
    }

    if (pipeline.status !== 'ACTIVE') {
      throw new Error(`Pipeline "${pipeline.name}" is not active (status: ${pipeline.status})`);
    }

    const steps: PipelineStep[] = JSON.parse(pipeline.steps as string);
    logger.info('Pipeline loaded', { name: pipeline.name, steps: steps.length });

    let currentBuffer = file;
    let currentFilename = filename;
    const stepResults: Array<{ step: number; from: string; to: string; durationMs: number; outputSize: number }> = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepStart = Date.now();
      logger.info(`Executing pipeline step ${i + 1}/${steps.length}`, {
        pipelineId,
        from: step.fromFormat,
        to: step.toFormat,
        inputSize: currentBuffer.length,
      });

      const conversionKey = `${step.fromFormat}_to_${step.toFormat}`;

      switch (conversionKey) {
        case 'pdf_to_docx': {
          const r = await formatConverterService.convertPDFtoWord(
            currentBuffer, currentFilename, pipeline.tenantId || '', pipeline.userId || ''
          );
          currentBuffer = r.buffer;
          currentFilename = r.outputFilename;
          break;
        }
        case 'docx_to_pdf': {
          const r = await formatConverterService.convertWordToPDF(
            currentBuffer, currentFilename, pipeline.tenantId || '', pipeline.userId || ''
          );
          currentBuffer = r.buffer;
          currentFilename = r.outputFilename;
          break;
        }
        case 'xlsx_to_pdf': {
          const r = await formatConverterService.convertExcelToPDF(
            currentBuffer, currentFilename, pipeline.tenantId || '', pipeline.userId || ''
          );
          currentBuffer = r.buffer;
          currentFilename = r.outputFilename;
          break;
        }
        case 'csv_to_xlsx': {
          const r = await formatConverterService.convertCSVtoExcel(currentBuffer, currentFilename);
          currentBuffer = r.buffer;
          currentFilename = r.outputFilename;
          break;
        }
        case 'xlsx_to_csv': {
          const r = await formatConverterService.convertExcelToCSV(currentBuffer, step.options?.sheetIndex);
          currentBuffer = Buffer.from(r.csv, 'utf-8');
          currentFilename = r.outputFilename;
          break;
        }
        case 'png_to_jpg':
        case 'png_to_webp':
        case 'png_to_avif':
        case 'jpg_to_png':
        case 'jpg_to_webp':
        case 'jpg_to_avif':
        case 'webp_to_png':
        case 'webp_to_jpg':
        case 'avif_to_png':
        case 'avif_to_jpg': {
          const r = await formatConverterService.convertImageFormat(
            currentBuffer,
            step.toFormat as 'png' | 'jpg' | 'webp' | 'avif',
            step.options
          );
          currentBuffer = r.buffer;
          currentFilename = r.outputFilename;
          break;
        }
        case 'html_to_pdf': {
          const htmlContent = currentBuffer.toString('utf-8');
          const r = await formatConverterService.convertHTMLtoPDF(
            htmlContent, pipeline.tenantId || '', pipeline.userId || ''
          );
          currentBuffer = r.buffer;
          currentFilename = r.outputFilename;
          break;
        }
        case 'md_to_html': {
          const mdContent = currentBuffer.toString('utf-8');
          const r = await formatConverterService.convertMarkdownToHTML(mdContent);
          currentBuffer = Buffer.from(r.html, 'utf-8');
          currentFilename = 'converted.html';
          break;
        }
        default:
          throw new Error(`Unsupported pipeline step conversion: ${conversionKey} at step ${i + 1}`);
      }

      const stepDuration = Date.now() - stepStart;
      stepResults.push({
        step: i + 1,
        from: step.fromFormat,
        to: step.toFormat,
        durationMs: stepDuration,
        outputSize: currentBuffer.length,
      });

      logger.info(`Pipeline step ${i + 1} completed`, {
        pipelineId,
        from: step.fromFormat,
        to: step.toFormat,
        durationMs: stepDuration,
        outputSize: currentBuffer.length,
      });
    }

    const totalDuration = Date.now() - executionStart;

    await prisma.conversionPipeline.update({
      where: { id: pipelineId },
      data: {
        lastExecutedAt: new Date(),
        executionCount: { increment: 1 },
      },
    });

    const lastStep = steps[steps.length - 1];
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv',
      html: 'text/html',
      png: 'image/png',
      jpg: 'image/jpeg',
      webp: 'image/webp',
      avif: 'image/avif',
      json: 'application/json',
    };

    const finalMimeType = mimeMap[lastStep.toFormat] || 'application/octet-stream';

    logger.info('Pipeline execution completed', {
      pipelineId,
      pipelineName: pipeline.name,
      stepsExecuted: steps.length,
      totalDurationMs: totalDuration,
      finalOutputSize: currentBuffer.length,
    });

    return {
      pipelineId,
      pipelineName: pipeline.name,
      stepsExecuted: steps.length,
      finalBuffer: currentBuffer,
      finalFilename: currentFilename,
      finalMimeType,
      stepResults,
      totalDurationMs: totalDuration,
    };
  }
}

export const batchConverterService = new BatchConverterService();
