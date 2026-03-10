import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pdfToExcelService } from '../services/pdf-to-excel.service';
import { wordToPowerPointService } from '../services/word-to-powerpoint.service';
import { imageToStructuredDataService } from '../services/image-to-structured-data.service';
import { formatPreservationService } from '../services/format-preservation.service';
import { arabicRtlConversionService } from '../services/arabic-rtl-conversion.service';
import { presentationToVideoService } from '../services/presentation-to-video.service';
import { logger } from '../utils/logger';

export class ExtendedConverterController {

  async convertPdfToExcel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      const tenantId = req.user!.organizationId || req.body.tenantId;
      const userId = req.user!.id! || req.body.userId;

      if (!tenantId || !userId) {
        res.status(400).json({ success: false, error: 'tenantId and userId are required' });
        return;
      }

      const options = {
        detectTables: req.body.detectTables !== 'false',
        useAiExtraction: req.body.useAiExtraction === 'true',
        mergeSheets: req.body.mergeSheets === 'true',
        preserveFormatting: req.body.preserveFormatting !== 'false',
        headerDetection: req.body.headerDetection || 'auto',
      };

      const result = await pdfToExcelService.convert(file.buffer, file.originalname, tenantId, userId, options);

      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.outputFilename}"`);
      res.setHeader('X-Job-Id', result.jobId);
      res.setHeader('X-Tables-Detected', String(result.tablesDetected));
      res.setHeader('X-Total-Rows', String(result.totalRows));
      res.send(result.buffer);
    } catch (error) {
      next(error);
    }
  }

  async convertWordToPowerPoint(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      const tenantId = req.user!.organizationId || req.body.tenantId;
      const userId = req.user!.id! || req.body.userId;

      if (!tenantId || !userId) {
        res.status(400).json({ success: false, error: 'tenantId and userId are required' });
        return;
      }

      const options = {
        theme: req.body.theme || 'professional',
        slideSize: req.body.slideSize || 'LAYOUT_16x9',
        maxBulletsPerSlide: parseInt(req.body.maxBulletsPerSlide, 10) || 6,
        autoSplit: req.body.autoSplit !== 'false',
        includeTableOfContents: req.body.includeTableOfContents !== 'false',
        rtlSupport: req.body.rtlSupport === 'true',
      };

      const result = await wordToPowerPointService.convert(file.buffer, file.originalname, tenantId, userId, options);

      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.outputFilename}"`);
      res.setHeader('X-Job-Id', result.jobId);
      res.setHeader('X-Slides-Created', String(result.slidesCreated));
      res.send(result.buffer);
    } catch (error) {
      next(error);
    }
  }

  async extractStructuredData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      const tenantId = req.user!.organizationId || req.body.tenantId;
      const userId = req.user!.id! || req.body.userId;

      if (!tenantId || !userId) {
        res.status(400).json({ success: false, error: 'tenantId and userId are required' });
        return;
      }

      const request = {
        tenantId,
        userId,
        outputFormat: req.body.outputFormat || 'json',
        language: req.body.language || 'auto',
        extractionType: req.body.extractionType || 'auto',
        customSchema: req.body.customSchema ? JSON.parse(req.body.customSchema) : undefined,
      };

      const result = await imageToStructuredDataService.extract(file.buffer, file.originalname, request);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, error: error.errors });
        return;
      }
      next(error);
    }
  }

  async extractStructuredDataAsCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      const tenantId = req.user!.organizationId || req.body.tenantId;
      const userId = req.user!.id! || req.body.userId;

      if (!tenantId || !userId) {
        res.status(400).json({ success: false, error: 'tenantId and userId are required' });
        return;
      }

      const result = await imageToStructuredDataService.extractToCSV(file.buffer, file.originalname, { tenantId, userId });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${file.originalname.replace(/\.[^.]+$/, '.csv')}"`);
      res.setHeader('X-Job-Id', result.jobId);
      res.send(result.csv);
    } catch (error) {
      next(error);
    }
  }

  async validateFormatPreservation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length !== 2) {
        res.status(400).json({ success: false, error: 'Two files required: source and converted' });
        return;
      }

      const tenantId = req.user!.organizationId || req.body.tenantId;
      const userId = req.user!.id! || req.body.userId;
      const sourceFormat = req.body.sourceFormat;
      const targetFormat = req.body.targetFormat;

      if (!tenantId || !userId || !sourceFormat || !targetFormat) {
        res.status(400).json({ success: false, error: 'tenantId, userId, sourceFormat, and targetFormat are required' });
        return;
      }

      const report = await formatPreservationService.validatePreservation(
        files[0].buffer,
        files[1].buffer,
        sourceFormat,
        targetFormat,
        tenantId,
        userId
      );

      res.status(200).json({ success: true, data: report });
    } catch (error) {
      next(error);
    }
  }

  async extractFormatMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      const format = req.body.format || file.originalname.split('.').pop()?.toLowerCase() || 'unknown';
      const metadata = await formatPreservationService.extractFormatMetadata(file.buffer, format, file.originalname);

      res.status(200).json({ success: true, data: metadata });
    } catch (error) {
      next(error);
    }
  }

  async analyzeRtl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { text } = req.body;
      if (!text || typeof text !== 'string') {
        res.status(400).json({ success: false, error: 'text field is required' });
        return;
      }

      const analysis = await arabicRtlConversionService.analyzeText(text);
      res.status(200).json({ success: true, data: analysis });
    } catch (error) {
      next(error);
    }
  }

  async transformRtl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { text } = req.body;
      if (!text || typeof text !== 'string') {
        res.status(400).json({ success: false, error: 'text field is required' });
        return;
      }

      const tenantId = req.user!.organizationId || req.body.tenantId;
      const userId = req.user!.id! || req.body.userId;

      if (!tenantId || !userId) {
        res.status(400).json({ success: false, error: 'tenantId and userId are required' });
        return;
      }

      const options = {
        tenantId,
        userId,
        enforceRtl: req.body.enforceRtl !== false,
        bidirectionalSupport: req.body.bidirectionalSupport !== false,
        numberHandling: req.body.numberHandling || 'preserve',
        fontSubstitution: req.body.fontSubstitution !== false,
        mirrorLayout: req.body.mirrorLayout !== false,
        preserveTashkeel: req.body.preserveTashkeel !== false,
      };

      const result = await arabicRtlConversionService.transformForRtl(text, options);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, error: error.errors });
        return;
      }
      next(error);
    }
  }

  async transformHtmlRtl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { html } = req.body;
      if (!html || typeof html !== 'string') {
        res.status(400).json({ success: false, error: 'html field is required' });
        return;
      }

      const tenantId = req.user!.organizationId || req.body.tenantId;
      const userId = req.user!.id! || req.body.userId;

      if (!tenantId || !userId) {
        res.status(400).json({ success: false, error: 'tenantId and userId are required' });
        return;
      }

      const result = await arabicRtlConversionService.transformHtmlForRtl(html, {
        tenantId,
        userId,
        enforceRtl: req.body.enforceRtl !== false,
        fontSubstitution: req.body.fontSubstitution !== false,
        mirrorLayout: req.body.mirrorLayout !== false,
        numberHandling: req.body.numberHandling || 'preserve',
      });

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async convertPresentationToVideo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ success: false, error: 'No slide images uploaded' });
        return;
      }

      const tenantId = req.user!.organizationId || req.body.tenantId;
      const userId = req.user!.id! || req.body.userId;

      if (!tenantId || !userId) {
        res.status(400).json({ success: false, error: 'tenantId and userId are required' });
        return;
      }

      const slideImages = files.map(f => f.buffer);
      const filename = req.body.filename || 'presentation.pptx';

      const options = {
        tenantId,
        userId,
        resolution: req.body.resolution || '1080p',
        fps: parseInt(req.body.fps, 10) || 30,
        slideDurationSec: parseInt(req.body.slideDurationSec, 10) || 5,
        transitionType: req.body.transitionType || 'fade',
        transitionDurationSec: parseFloat(req.body.transitionDurationSec) || 1,
        outputFormat: req.body.outputFormat || 'mp4',
        quality: req.body.quality || 'high',
      };

      const result = await presentationToVideoService.queueConversion(slideImages, filename, options);

      res.status(202).json({
        success: true,
        data: {
          jobId: result.jobId,
          status: result.status,
          message: 'Video conversion queued. Use the job ID to check progress.',
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, error: error.errors });
        return;
      }
      next(error);
    }
  }

  async getVideoConversionProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.params;
      if (!jobId) {
        res.status(400).json({ success: false, error: 'jobId parameter is required' });
        return;
      }

      const progress = presentationToVideoService.getJobProgress(jobId);
      if (!progress) {
        res.status(404).json({ success: false, error: `Job ${jobId} not found` });
        return;
      }

      res.status(200).json({ success: true, data: progress });
    } catch (error) {
      next(error);
    }
  }
}

export const extendedConverterController = new ExtendedConverterController();
