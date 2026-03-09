import { Request, Response, NextFunction } from 'express';
import { converterService } from '../services/converter.service';

export class ConverterController {
  async convert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file;
      if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }
      const tenantId = req.user?.tenantId;
      const { targetFormat } = req.body;
      if (!targetFormat) { res.status(400).json({ error: 'targetFormat is required' }); return; }

      const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
      let result;

      const key = `${ext}_to_${targetFormat}`;
      switch (key) {
        case 'pdf_to_docx': result = await converterService.convertPDFtoWord(file.buffer, tenantId); break;
        case 'docx_to_pdf': case 'doc_to_pdf': result = await converterService.convertWordToPDF(file.buffer, tenantId); break;
        case 'xlsx_to_pdf': case 'xls_to_pdf': result = await converterService.convertExcelToPDF(file.buffer, tenantId); break;
        case 'csv_to_xlsx': result = await converterService.convertCSVtoExcel(file.buffer, tenantId); break;
        default:
          if (['png', 'jpg', 'jpeg', 'webp', 'tiff'].includes(ext) && ['png', 'jpg', 'webp', 'tiff'].includes(targetFormat)) {
            result = await converterService.convertImageFormat(file.buffer, targetFormat as 'png' | 'jpg' | 'webp' | 'tiff', tenantId, req.body);
          } else {
            res.status(400).json({ error: `Unsupported conversion: ${ext} to ${targetFormat}` }); return;
          }
      }

      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.content);
    } catch (error) { next(error); }
  }

  async convertMarkdownToHTML(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { markdown } = req.body;
      if (!markdown) { res.status(400).json({ error: 'markdown content is required' }); return; }
      const result = await converterService.convertMarkdownToHTML(markdown, tenantId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async convertHTMLtoMarkdown(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { html } = req.body;
      if (!html) { res.status(400).json({ error: 'html content is required' }); return; }
      const result = await converterService.convertHTMLtoMarkdown(html, tenantId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async batchConvert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) { res.status(400).json({ error: 'No files uploaded' }); return; }
      const tenantId = req.user?.tenantId;
      const { targetFormat } = req.body;
      if (!targetFormat) { res.status(400).json({ error: 'targetFormat is required' }); return; }
      const result = await converterService.batchConvert(files, targetFormat, tenantId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async listConversions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { page, limit } = req.query;
      const result = await converterService.listConversions(tenantId, { page: Number(page) || 1, limit: Number(limit) || 20 });
      res.json({ success: true, ...result });
    } catch (error) { next(error); }
  }
}

export const converterController = new ConverterController();
