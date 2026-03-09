import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

const mailTransport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

export class WorkflowService {

  async createWorkflow(
    name: string,
    steps: Array<{ name: string; approverRole: string; order: number }>,
    tenantId: string,
    userId: string
  ): Promise<Record<string, unknown>> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Workflow name is required');
    }

    if (!steps || steps.length === 0) {
      throw new Error('At least one workflow step must be defined');
    }

    const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

    for (let i = 0; i < sortedSteps.length; i++) {
      const step = sortedSteps[i];
      if (!step.name || !step.name.trim()) {
        throw new Error(`Step at order ${step.order} must have a name`);
      }
      if (!step.approverRole || !step.approverRole.trim()) {
        throw new Error(`Step '${step.name}' must have an approverRole`);
      }
    }

    const workflowId = crypto.randomUUID();

    const workflowRecord = await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'workflow.created',
        entityType: 'workflow',
        entityId: workflowId,
        detailsJson: {
          workflowId,
          name: trimmedName,
          steps: sortedSteps.map(s => ({
            name: s.name,
            approverRole: s.approverRole,
            order: s.order,
          })),
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          createdBy: userId,
        },
      },
    });

    logger.info('Workflow created', {
      workflowId,
      name: trimmedName,
      stepCount: sortedSteps.length,
      tenantId,
      createdBy: userId,
    });

    return {
      id: workflowId,
      name: trimmedName,
      tenantId,
      createdBy: userId,
      status: 'ACTIVE',
      steps: sortedSteps.map((s, index) => ({
        id: `${workflowId}_step_${index}`,
        name: s.name,
        approverRole: s.approverRole,
        order: s.order,
        status: 'pending',
      })),
      totalSteps: sortedSteps.length,
      createdAt: workflowRecord.createdAt,
    };
  }

  async submitForApproval(
    resourceId: string,
    resourceType: string,
    workflowId: string,
    userId: string
  ): Promise<Record<string, unknown>> {
    if (!resourceId || !resourceType) {
      throw new Error('Resource ID and type are required');
    }

    const workflowLogs = await prisma.auditLog.findMany({
      where: {
        entityId: workflowId,
        action: 'workflow.created',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (workflowLogs.length === 0) {
      throw new Error(`Workflow with id '${workflowId}' not found`);
    }

    const workflowData = workflowLogs[0].detailsJson as Record<string, unknown>;
    const instanceId = crypto.randomUUID();

    const steps = ((workflowData.steps as Array<Record<string, unknown>>) || []).map((step: Record<string, unknown>, index: number) => ({
      id: `${instanceId}_step_${index}`,
      name: step.name,
      approverRole: step.approverRole,
      order: step.order,
      status: index === 0 ? 'awaiting_approval' : 'pending',
      assignedAt: index === 0 ? new Date().toISOString() : null,
      decision: null,
      decidedBy: null,
      decidedAt: null,
      comment: null,
    }));

    const instanceRecord = await prisma.auditLog.create({
      data: {
        tenantId: workflowLogs[0].tenantId,
        userId,
        action: 'workflow.submitted',
        entityType: 'workflow_instance',
        entityId: instanceId,
        detailsJson: {
          instanceId,
          workflowId,
          workflowName: workflowData.name,
          resourceId,
          resourceType,
          submittedBy: userId,
          status: 'in_progress',
          currentStep: 0,
          steps,
          submittedAt: new Date().toISOString(),
        },
      },
    });

    const firstStep = steps[0];
    if (firstStep) {
      const approvers = await prisma.user.findMany({
        where: {
          role: firstStep.approverRole,
          tenantId: workflowLogs[0].tenantId,
          status: 'ACTIVE',
        },
        select: { id: true, email: true, name: true },
      });

      for (const approver of approvers) {
        try {
          await mailTransport.sendMail({
            from: process.env.SMTP_FROM || 'noreply@rasid.ai',
            to: approver.email,
            subject: `RASID - Approval Required: ${workflowData.name}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px;">
                <h2>Approval Required</h2>
                <p>Hello ${approver.name},</p>
                <p>A new ${resourceType} requires your approval as part of the "${workflowData.name}" workflow.</p>
                <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
                  <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Resource</td><td style="padding: 8px; border: 1px solid #ddd;">${resourceType} (${resourceId})</td></tr>
                  <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Step</td><td style="padding: 8px; border: 1px solid #ddd;">${firstStep.name}</td></tr>
                  <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Submitted By</td><td style="padding: 8px; border: 1px solid #ddd;">${userId}</td></tr>
                </table>
                <p>Please review and approve or reject this request.</p>
              </div>
            `,
          });
          logger.info('Approval notification sent', {
            approverEmail: approver.email,
            instanceId,
          });
        } catch (mailErr: unknown) {
          logger.warn('Failed to send approval notification', {
            approverEmail: approver.email,
            error: mailErr instanceof Error ? mailErr.message : String(mailErr),
          });
        }
      }
    }

    logger.info('Workflow submitted for approval', {
      instanceId,
      workflowId,
      resourceId,
      resourceType,
      submittedBy: userId,
    });

    return {
      instanceId,
      workflowId,
      workflowName: workflowData.name,
      resourceId,
      resourceType,
      submittedBy: userId,
      status: 'in_progress',
      currentStep: firstStep ? firstStep.name : null,
      totalSteps: steps.length,
      steps,
      submittedAt: instanceRecord.createdAt,
    };
  }

  async approveStep(
    instanceId: string,
    stepId: string,
    userId: string,
    decision: 'approved' | 'rejected',
    comment: string
  ): Promise<Record<string, unknown>> {
    const instanceLogs = await prisma.auditLog.findMany({
      where: {
        entityId: instanceId,
        entityType: 'workflow_instance',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (instanceLogs.length === 0) {
      throw new Error(`Workflow instance '${instanceId}' not found`);
    }

    const instanceData = instanceLogs[0].detailsJson as Record<string, unknown>;
    if (instanceData.status === 'completed' || instanceData.status === 'rejected') {
      throw new Error(`Workflow instance is already '${instanceData.status}'`);
    }

    const steps = instanceData.steps as Array<Record<string, unknown>>;
    const stepIndex = steps.findIndex((s: Record<string, unknown>) => s.id === stepId);
    if (stepIndex === -1) {
      throw new Error(`Step '${stepId}' not found in workflow instance`);
    }

    const currentStep = steps[stepIndex];
    if (currentStep.status !== 'awaiting_approval') {
      throw new Error(`Step '${currentStep.name}' is not awaiting approval (current status: ${currentStep.status})`);
    }

    const approver = await prisma.user.findUnique({ where: { id: userId } });
    if (!approver) {
      throw new Error(`User '${userId}' not found`);
    }

    if (approver.role !== currentStep.approverRole && approver.role !== 'admin') {
      throw new Error(
        `User role '${approver.role}' does not match required approver role '${currentStep.approverRole}'`
      );
    }

    currentStep.status = decision;
    currentStep.decidedBy = userId;
    currentStep.decidedAt = new Date().toISOString();
    currentStep.comment = comment || '';

    let workflowStatus = instanceData.status;
    let nextStepName: string | null = null;

    if (decision === 'rejected') {
      workflowStatus = 'rejected';
      for (let i = stepIndex + 1; i < steps.length; i++) {
        steps[i].status = 'cancelled';
      }
    } else if (decision === 'approved') {
      const nextIndex = stepIndex + 1;
      if (nextIndex < steps.length) {
        steps[nextIndex].status = 'awaiting_approval';
        steps[nextIndex].assignedAt = new Date().toISOString();
        nextStepName = steps[nextIndex].name;
        workflowStatus = 'in_progress';

        const nextApprovers = await prisma.user.findMany({
          where: {
            role: steps[nextIndex].approverRole,
            tenantId: instanceLogs[0].tenantId,
            status: 'ACTIVE',
          },
          select: { id: true, email: true, name: true },
        });

        for (const nextApprover of nextApprovers) {
          try {
            await mailTransport.sendMail({
              from: process.env.SMTP_FROM || 'noreply@rasid.ai',
              to: nextApprover.email,
              subject: `RASID - Approval Required: ${instanceData.workflowName} - Step: ${steps[nextIndex].name}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px;">
                  <h2>Approval Required - Next Step</h2>
                  <p>Hello ${nextApprover.name},</p>
                  <p>The previous step "${currentStep.name}" has been approved. Your review is now needed for step "${steps[nextIndex].name}".</p>
                  <p><strong>Resource:</strong> ${instanceData.resourceType} (${instanceData.resourceId})</p>
                  <p>Please review and take action.</p>
                </div>
              `,
            });
          } catch (mailErr: unknown) {
            logger.warn('Failed to notify next approver', {
              email: nextApprover.email,
              error: mailErr instanceof Error ? mailErr.message : String(mailErr),
            });
          }
        }
      } else {
        workflowStatus = 'completed';
      }
    }

    await prisma.auditLog.create({
      data: {
        tenantId: instanceLogs[0].tenantId,
        userId,
        action: `workflow.step_${decision}`,
        entityType: 'workflow_instance',
        entityId: instanceId,
        detailsJson: {
          ...instanceData,
          steps,
          status: workflowStatus,
          lastDecision: {
            stepId,
            stepName: currentStep.name,
            decision,
            decidedBy: userId,
            comment,
            decidedAt: new Date().toISOString(),
          },
        },
      },
    });

    logger.info('Workflow step decision recorded', {
      instanceId,
      stepId,
      stepName: currentStep.name,
      decision,
      decidedBy: userId,
      workflowStatus,
      nextStep: nextStepName,
    });

    return {
      instanceId,
      stepId,
      stepName: currentStep.name,
      decision,
      comment,
      decidedBy: userId,
      decidedAt: currentStep.decidedAt,
      workflowStatus,
      nextStep: nextStepName,
      steps: steps.map((s: Record<string, unknown>) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        approverRole: s.approverRole,
        decidedBy: s.decidedBy,
        decidedAt: s.decidedAt,
        comment: s.comment,
      })),
    };
  }
}

export const workflowService = new WorkflowService();
