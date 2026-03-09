import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { LayoutGenerationController } from '../../services/replication-service/src/services/layout-generation-controller.service.ts';

const prisma = new PrismaClient();

async function main() {
  const controller = new LayoutGenerationController(prisma);
  const buffer = await fs.readFile('C:/DATA_AI/rasid/verification_run/phase3_test_input.png');
  const result = await controller.generateFromLayout({
    inputSource: { type: 'image', buffer },
    outputs: [
      { generator: 'dashboard', format: 'html' },
      { generator: 'report', format: 'html' },
      { generator: 'spreadsheet', format: 'html' },
    ],
    options: {
      pixelPerfectValidation: true,
      extractData: true,
      optimizeArabicTypography: false,
    },
  });

  console.log(JSON.stringify({
    graph: {
      sourceType: result.canonicalGraph.sourceType,
      dimensions: result.canonicalGraph.dimensions,
      childCount: result.canonicalGraph.pages[0]?.rootNode.children.length ?? 0,
      tableCount: result.canonicalGraph.metadata.tableCount,
      chartCount: result.canonicalGraph.metadata.chartCount,
      wordCount: result.canonicalGraph.metadata.wordCount,
    },
    extractedData: result.extractedData,
    artifacts: result.artifacts.map((artifact) => ({
      generator: artifact.generator,
      format: artifact.format,
      elementsRendered: artifact.elementsRendered,
      htmlLength: artifact.html.length,
      pixelValidation: artifact.pixelValidation,
    })),
    pipelineStages: result.pipelineStages,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
