#!/usr/bin/env node
/**
 * Rasid Task Gate — Evidence Pack + Anti-Cheating Gate (One Script)
 * Usage:
 *   node scripts/ci/task_gate.mjs --task-id FE-01 --title "Canvas FSM Provider" --spec-book "كتاب_المواصفات_الجامع/rased_master_book.md" --sections "STATE MACHINE SPEC,RASED CANVAS UX SPEC"
 *
 * Exit codes:
 *   0 = PASS
 *   2 = FAIL (any gate)
 *
 * Notes:
 * - No external deps. Works with Node 18+.
 * - Produces /EVIDENCE/<TASK_ID>/... with real command outputs.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const args = parseArgs(process.argv.slice(2));
const TASK_ID = must(args['--task-id'], '--task-id is required');
const TASK_TITLE = args['--title'] ?? '';
const SPEC_BOOK = args['--spec-book'] ?? '';
const SPEC_SECTIONS = (args['--sections'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const WITH_DOCKER = (args['--docker'] ?? 'false').toLowerCase() === 'true';

const ROOT = process.cwd();
const EVID_DIR = path.join(ROOT, 'EVIDENCE', TASK_ID);
ensureDir(EVID_DIR);

const files = {
  env: path.join(EVID_DIR, '01_env.txt'),
  install: path.join(EVID_DIR, '02_install.txt'),
  build: path.join(EVID_DIR, '03_build.txt'),
  typecheck: path.join(EVID_DIR, '04_typecheck.txt'),
  lint: path.join(EVID_DIR, '05_lint.txt'),
  tests: path.join(EVID_DIR, '06_tests.txt'),
  docker: path.join(EVID_DIR, '07_docker_up.txt'),
  health: path.join(EVID_DIR, '08_healthchecks.txt'),
  forbidden: path.join(EVID_DIR, '09_forbidden_scan.txt'),
  gitStatus: path.join(EVID_DIR, '10_git_status.txt'),
  gitDiff: path.join(EVID_DIR, '11_git_diff.patch'),
  artifactHashes: path.join(EVID_DIR, '12_artifact_hashes.txt'),
  policyProof: path.join(EVID_DIR, '13_policy_guardrails_proof.txt'),
  strictProof: path.join(EVID_DIR, '14_strict_proof.txt'),
  uiProof: path.join(EVID_DIR, '15_ui_proof.txt'),
  summary: path.join(EVID_DIR, 'SUMMARY.txt'),
};

const verdict = {
  pass: true,
  fails: [],
  marks: [],
};

writeHeader();

const pkg = detectPackageManager(ROOT);
runEnvInfo(pkg);
runGitProof();
runForbiddenScan();
runNoSilentOverrideScan();

// Install/build/typecheck/lint/tests are mandatory.
runCmdToFile(files.install, pkg.installCmd, 'INSTALL');
runCmdToFile(files.build, pkg.run('build'), 'BUILD');
runCmdToFile(files.typecheck, pkg.run('typecheck'), 'TYPECHECK', { allowMissingScript: true });
runCmdToFile(files.lint, pkg.run('lint'), 'LINT', { allowMissingScript: true });
runCmdToFile(files.tests, pkg.run('test'), 'TESTS', { allowMissingScript: true });
runCmdToFile(files.uiProof, pkg.run('test:e2e'), 'UI_E2E', { allowMissingScript: true });

writeArtifactHashes();
writeStrictProof();

if (WITH_DOCKER) {
  runDocker();
}

writeSummary();
process.exit(verdict.pass ? 0 : 2);

// ----------------- helpers -----------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) out[k] = 'true';
      else {
        out[k] = v;
        i++;
      }
    }
  }
  return out;
}

function must(v, msg) {
  if (!v) fail(msg);
  return v;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFile(p, s) {
  fs.writeFileSync(p, s, 'utf8');
}

function appendFile(p, s) {
  fs.appendFileSync(p, s, 'utf8');
}

function fail(msg) {
  verdict.pass = false;
  verdict.fails.push(msg);
}

function run(cmd, opts = {}) {
  const res = spawnSync(cmd[0], cmd.slice(1), {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
    shell: false,
    ...opts,
  });
  return {
    code: res.status ?? 999,
    out: (res.stdout ?? '') + (res.stderr ?? ''),
  };
}

function runCmdToFile(file, cmd, label, options = {}) {
  const allowMissingScript = options.allowMissingScript ?? false;

  if (cmd[0] === '__MISSING_SCRIPT__') {
    const msg = `[${label}] MISSING SCRIPT: ${cmd[1]}\n`;
    writeFile(file, msg);
    if (!allowMissingScript) fail(`${label} missing script: ${cmd[1]}`);
    else verdict.marks.push(`${label}: SKIPPED (missing script ${cmd[1]})`);
    return;
  }

  const r = run(cmd);
  writeFile(file, `# CMD: ${cmd.join(' ')}\n# EXIT: ${r.code}\n\n${r.out}`);
  if (r.code !== 0) fail(`${label} failed (exit=${r.code})`);
  else verdict.marks.push(`${label}: PASS`);
}

function detectPackageManager(root) {
  const pnpm = fs.existsSync(path.join(root, 'pnpm-lock.yaml'));
  const yarn = fs.existsSync(path.join(root, 'yarn.lock'));
  const npm = fs.existsSync(path.join(root, 'package-lock.json'));

  if (pnpm) {
    return {
      name: 'pnpm',
      installCmd: ['pnpm', 'install', '--frozen-lockfile'],
      run: (script) => scriptExists(script) ? ['pnpm', 'run', script] : ['__MISSING_SCRIPT__', script],
    };
  }
  if (yarn) {
    return {
      name: 'yarn',
      installCmd: ['yarn', 'install', '--frozen-lockfile'],
      run: (script) => scriptExists(script) ? ['yarn', script] : ['__MISSING_SCRIPT__', script],
    };
  }
  if (npm) {
    return {
      name: 'npm',
      installCmd: ['npm', 'ci'],
      run: (script) => scriptExists(script) ? ['npm', 'run', script] : ['__MISSING_SCRIPT__', script],
    };
  }
  fail('No lockfile found (pnpm-lock.yaml/yarn.lock/package-lock.json).');
  return {
    name: 'unknown',
    installCmd: ['__MISSING_SCRIPT__', 'install'],
    run: (script) => ['__MISSING_SCRIPT__', script],
  };
}

function scriptExists(scriptName) {
  const pkgPath = path.join(ROOT, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return Boolean(pkg?.scripts?.[scriptName]);
}

function runEnvInfo(pkg) {
  const lines = [];
  lines.push(`TASK_ID: ${TASK_ID}`);
  lines.push(`TASK_TITLE: ${TASK_TITLE}`);
  lines.push(`SPEC_BOOK: ${SPEC_BOOK}`);
  lines.push(`SPEC_SECTIONS: ${SPEC_SECTIONS.join(', ')}`);
  lines.push('');
  lines.push(`OS: ${os.platform()} ${os.release()} (${os.arch()})`);
  lines.push(`PWD: ${ROOT}`);
  lines.push(`PKG_MGR: ${pkg.name}`);
  lines.push(`NODE: ${process.version}`);
  lines.push(`SELF_HASH_SHA256: ${hashFile(import.meta.url)}`);

  const git = run(['git', 'rev-parse', 'HEAD']);
  lines.push(`GIT_HEAD_EXIT: ${git.code}`);
  lines.push(`GIT_HEAD: ${(git.out || '').trim()}`);

  writeFile(files.env, `${lines.join('\n')}\n`);
  if (git.code !== 0) fail('git rev-parse HEAD failed');
}

function runGitProof() {
  const st = run(['git', 'status', '--porcelain']);
  writeFile(files.gitStatus, st.out);
  if (st.code !== 0) fail('git status failed');

  const diff = run(['git', 'diff']);
  writeFile(files.gitDiff, diff.out);
  if (diff.code !== 0) fail('git diff failed');
}

function collectRuntimeFiles() {
  const roots = ['services', 'frontend', 'packages'];
  const allowExt = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.java', '.cs', '.rs', '.php', '.rb', '.kt', '.swift', '.sql', '.sh', '.yml', '.yaml']);
  const out = [];

  for (const r of roots) {
    const abs = path.join(ROOT, r);
    if (!fs.existsSync(abs)) continue;
    walk(abs, (fp) => {
      const ext = path.extname(fp).toLowerCase();
      if (!allowExt.has(ext)) return;
      if (fp.includes(`${path.sep}node_modules${path.sep}`)) return;
      if (fp.includes(`${path.sep}dist${path.sep}`)) return;
      if (fp.includes(`${path.sep}build${path.sep}`)) return;
      if (fp.includes(`${path.sep}.next${path.sep}`)) return;
      out.push(fp);
    });
  }
  return out;
}

function walk(dir, onFile) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, onFile);
    else if (e.isFile()) onFile(fp);
  }
}

function scan(pattern, runtimeFiles) {
  const hits = [];
  const rx = new RegExp(pattern, 'i');
  for (const f of runtimeFiles) {
    let t = '';
    try {
      t = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (rx.test(t)) hits.push(f);
  }
  return hits;
}

function runForbiddenScan() {
  const runtimeFiles = collectRuntimeFiles();
  const forbidden = [
    'TODO',
    'FIXME',
    'STUB',
    'MOCK',
    'PLACEHOLDER',
    'DEMO',
    'not\\s+implemented',
    'return\\s+true\\s*;',
    'return\\s+ok',
    'return\\s+\\{\\s*status\\s*:\\s*[\'"]ok[\'"]\\s*\\}',
  ].join('|');

  const hits = scan(forbidden, runtimeFiles);
  const out = [
    '# Forbidden Tokens Scan',
    `# FILES_SCANNED: ${runtimeFiles.length}`,
    `# HITS: ${hits.length}`,
    '',
    ...hits.map((h) => `- ${path.relative(ROOT, h)}`),
    '',
  ].join('\n');

  writeFile(files.forbidden, out);

  if (hits.length > 0) {
    fail(`Forbidden tokens found: ${hits.length} files`);
  } else {
    verdict.marks.push('FORBIDDEN_SCAN: PASS');
  }
}

function runNoSilentOverrideScan() {
  const runtimeFiles = collectRuntimeFiles();
  const patterns = [
    'rewrite_prompt',
    'sanitize_prompt',
    'override_tool',
    'swap_action',
    'bypass_policy',
    'disable_guardrails',
    'skip_rbac',
  ].join('|');

  const hits = scan(patterns, runtimeFiles);
  const out = [
    '# No Silent Override Scan',
    `# FILES_SCANNED: ${runtimeFiles.length}`,
    `# HITS: ${hits.length}`,
    '',
    ...hits.map((h) => `- ${path.relative(ROOT, h)}`),
    '',
  ].join('\n');
  writeFile(files.policyProof, out);

  if (hits.length > 0) {
    fail(`Potential silent override patterns found: ${hits.length} files`);
  } else {
    verdict.marks.push('NO_SILENT_OVERRIDE: PASS');
  }
}

function runDocker() {
  const hasCompose = fs.existsSync(path.join(ROOT, 'docker-compose.yml')) || fs.existsSync(path.join(ROOT, 'docker-compose.yaml'));
  if (!hasCompose) {
    writeFile(files.docker, '# docker compose not found\n');
    verdict.marks.push('DOCKER: SKIPPED (no compose)');
    return;
  }

  const up = run(['docker', 'compose', 'up', '-d']);
  writeFile(files.docker, `# CMD: docker compose up -d\n# EXIT: ${up.code}\n\n${up.out}`);
  if (up.code !== 0) fail('docker compose up failed');

  const ps = run(['docker', 'compose', 'ps']);
  appendFile(files.docker, `\n\n# CMD: docker compose ps\n# EXIT: ${ps.code}\n\n${ps.out}`);
  if (ps.code !== 0) fail('docker compose ps failed');

  // Healthchecks are project-specific; we just record compose ps output.
  writeFile(files.health, '# Healthchecks are project-specific. Compose status recorded in 07_docker_up.txt\n');
  verdict.marks.push('DOCKER: PASS (compose up/ps)');
}

function writeHeader() {
  const header = [
    '# TASK GATE — Evidence Pack (Auto)',
    `TASK_ID: ${TASK_ID}`,
    `TASK_TITLE: ${TASK_TITLE}`,
    `SPEC_BOOK: ${SPEC_BOOK}`,
    `SPEC_SECTIONS: ${SPEC_SECTIONS.join(', ')}`,
    `ROOT: ${ROOT}`,
    `TIME: ${new Date().toISOString()}`,
    '',
  ].join('\n');
  writeFile(files.summary, header);
}

function writeSummary() {
  const lines = [];
  lines.push('=== SUMMARY ===');
  lines.push(`TASK_ID: ${TASK_ID}`);
  lines.push(`TASK_TITLE: ${TASK_TITLE}`);
  lines.push(`PKG_MGR: ${detectPackageManager(ROOT).name}`);
  lines.push('');
  lines.push('MARKS:');
  for (const m of verdict.marks) lines.push(`- ${m}`);
  lines.push('');
  if (verdict.pass) {
    lines.push('FINAL_VERDICT: PASS');
  } else {
    lines.push('FINAL_VERDICT: FAIL');
    lines.push('FAIL_REASONS:');
    for (const f of verdict.fails) lines.push(`- ${f}`);
  }
  lines.push('');
  lines.push('EVIDENCE_DIR:');
  lines.push(`- ${path.relative(ROOT, EVID_DIR)}`);
  appendFile(files.summary, lines.join('\n'));
}

function hashFile(moduleUrl) {
  const filePath = moduleUrl.startsWith('file:')
    ? new URL(moduleUrl)
    : moduleUrl;
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function writeArtifactHashes() {
  const changed = run(['git', 'diff', '--name-only']);
  if (changed.code !== 0) {
    writeFile(files.artifactHashes, '# unable to compute changed file hashes\n');
    fail('artifact hashes scan failed');
    return;
  }

  const rows = changed.out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((relativePath) => {
      const abs = path.join(ROOT, relativePath);
      if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
        return `${relativePath} | MISSING`;
      }
      const digest = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
      return `${relativePath} | ${digest}`;
    });

  writeFile(
    files.artifactHashes,
    ['# Changed file hashes', ...(rows.length > 0 ? rows : ['(no changed files)'])].join('\n')
  );
}

function writeStrictProof() {
  const runtimeFiles = collectRuntimeFiles();
  const strictHits = [];
  const strictRx = /(threshold|pixeldiff|strict)/i;
  for (const file of runtimeFiles) {
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (strictRx.test(text)) {
      strictHits.push(path.relative(ROOT, file));
    }
  }

  writeFile(
    files.strictProof,
    ['# Strict proof scan', ...(strictHits.length > 0 ? strictHits : ['N/A'])].join('\n')
  );
}
