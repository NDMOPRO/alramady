import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { WhatsAppIntegrationService } from '../services/whatsapp-integration.service';
import { SlackIntegrationService } from '../services/slack-integration.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();
const whatsappService = new WhatsAppIntegrationService(prisma);
const slackService = new SlackIntegrationService(prisma);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const WhatsAppSendBody = z.object({
  to: z.string().min(10, 'Valid phone number is required').max(20),
  message: z.string().min(1, 'Message body is required').max(4096),
});

const WhatsAppTemplateBody = z.object({
  to: z.string().min(10, 'Valid phone number is required').max(20),
  templateName: z.string().min(1, 'Template name is required'),
  params: z.record(z.string()).default({}),
});

const WhatsAppReportBody = z.object({
  to: z.string().min(10, 'Valid phone number is required').max(20),
  reportId: z.string().min(1, 'Report ID is required'),
});

const SlackSendBody = z.object({
  channel: z.string().min(1, 'Channel ID is required'),
  message: z.string().min(1, 'Message text is required').max(40000),
});

const SlackReportBody = z.object({
  channel: z.string().min(1, 'Channel ID is required'),
  reportId: z.string().min(1, 'Report ID is required'),
});

// ─── WhatsApp Routes ─────────────────────────────────────────────────────────

router.post(
  '/whatsapp/send',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { to, message } = WhatsAppSendBody.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.userId;
    const result = await whatsappService.sendMessage(to, message, tenantId);
    res.status(201).json({ success: true, data: result });
  }),
);

router.post(
  '/whatsapp/send-template',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { to, templateName, params } = WhatsAppTemplateBody.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.userId;
    const result = await whatsappService.sendTemplate(to, templateName, params, tenantId);
    res.status(201).json({ success: true, data: result });
  }),
);

router.post(
  '/whatsapp/send-report',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { to, reportId } = WhatsAppReportBody.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.userId;

    const report = await prisma.report.findUnique({ where: { id: reportId } });
    if (!report) {
      res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
      return;
    }

    const reportUrl = (report as Record<string, unknown>).exportUrl as string | undefined;
    if (reportUrl) {
      const caption = `تقرير: ${report.name || reportId}`;
      const result = await whatsappService.sendDocument(to, reportUrl, caption, tenantId);
      res.status(201).json({ success: true, data: result });
    } else {
      const summary = (report as Record<string, unknown>).summary as string || report.name || reportId;
      const messageText = `*تقرير راصد*\n\n${summary}`;
      const result = await whatsappService.sendMessage(to, messageText, tenantId);
      res.status(201).json({ success: true, data: result });
    }
  }),
);

router.post(
  '/whatsapp/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    await whatsappService.handleWebhook(req.body);
    res.status(200).json({ success: true });
  }),
);

// ─── Slack Routes ────────────────────────────────────────────────────────────

router.post(
  '/slack/send',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { channel, message } = SlackSendBody.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.userId;
    const result = await slackService.sendMessage(channel, message, tenantId);
    res.status(201).json({ success: true, data: result });
  }),
);

router.post(
  '/slack/send-report',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { channel, reportId } = SlackReportBody.parse(req.body);
    const tenantId = req.user!.organizationId || req.user!.userId;

    const report = await prisma.report.findUnique({ where: { id: reportId } });
    if (!report) {
      res.status(404).json({ success: false, error: 'Report not found', code: 'NOT_FOUND' });
      return;
    }

    const summary = (report as Record<string, unknown>).summary as string || report.name || reportId;
    const messageText = `:page_facing_up: *تقرير راصد*\n\n*${report.name || reportId}*\n\n${summary}`;
    const result = await slackService.sendMessage(channel, messageText, tenantId);
    res.status(201).json({ success: true, data: result });
  }),
);

router.post(
  '/slack/channels',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.organizationId || req.user!.userId;
    const result = await slackService.listChannels(tenantId);
    res.json({ success: true, data: result });
  }),
);

router.post(
  '/slack/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await slackService.handleWebhook(req.body);
    if (result.challenge) {
      res.status(200).json({ challenge: result.challenge });
      return;
    }
    res.status(200).json({ success: true });
  }),
);

export default router;
