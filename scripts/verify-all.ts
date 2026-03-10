import { spawn } from 'child_process';

interface Step {
  name: string;
  command: string;
  args: string[];
}

const timeoutArg = process.argv.find((value) => value.startsWith('--timeout='));
const forwardedArgs = timeoutArg ? [timeoutArg] : [];

const STEPS: Step[] = [
  {
    name: 'Services verification',
    command: 'npx',
    args: ['tsx', 'scripts/verify-services.ts', ...forwardedArgs],
  },
  {
    name: 'API routes verification',
    command: 'npx',
    args: ['tsx', 'scripts/verify-api-routes.ts', ...forwardedArgs],
  },
  {
    name: 'Frontend routes verification',
    command: 'npx',
    args: ['tsx', 'scripts/verify-frontend.ts', ...forwardedArgs],
  },
];

function runStep(step: Step): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n=== ${step.name} ===`);
    const child = spawn(step.command, step.args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${step.name} exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function main(): Promise<void> {
  for (const step of STEPS) {
    await runStep(step);
  }

  console.log('\nAll verification stages completed successfully.');
}

main().catch((error) => {
  console.error('\nVerification pipeline failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
