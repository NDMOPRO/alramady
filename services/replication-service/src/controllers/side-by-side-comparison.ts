import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { generateSideBySideComparison } from '../services/side-by-side-comparison.service';

export async function generateComparison(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { originalDocumentId, replicaDocumentId, outputWidth, highlightDifferences, diffOverlayOpacity, includeAnnotations, includeMetrics } = req.body;

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const originalFile = files?.originalImage?.[0];
    const replicaFile = files?.replicaImage?.[0];

    if (!originalFile || !replicaFile) {
      res.status(400).json({
        success: false,
        error: 'Both originalImage and replicaImage files are required',
      });
      return;
    }

    const result = await generateSideBySideComparison({
      originalDocumentId,
      replicaDocumentId,
      tenantId: req.user!.tenantId! || '',
      userId: req.user!.userId || '',
      originalImageBuffer: originalFile.buffer,
      replicaImageBuffer: replicaFile.buffer,
      outputWidth: outputWidth ? parseInt(outputWidth, 10) : 1920,
      highlightDifferences: highlightDifferences !== 'false',
      diffOverlayOpacity: diffOverlayOpacity ? parseFloat(diffOverlayOpacity) : 0.4,
      includeAnnotations: includeAnnotations !== 'false',
      includeMetrics: includeMetrics !== 'false',
    });

    res.json({
      success: true,
      data: {
        id: result.id,
        originalDocumentId: result.originalDocumentId,
        replicaDocumentId: result.replicaDocumentId,
        compositeImage: result.compositeImageBuffer.toString('base64'),
        diffOverlay: result.diffOverlayBuffer.toString('base64'),
        diffRegions: result.diffRegions,
        metrics: result.metrics,
        dimensions: result.dimensions,
        generatedAt: result.generatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
}
