/**
 * Rased Canvas Machine – Runtime Assertions
 *
 * Run: npx tsx state/__tests__/rasedCanvas.machine.test.ts
 * Validates core FSM invariants without a test framework dependency.
 */
import { createActor } from "xstate";
import { rasedCanvasMachine } from "../rasedCanvas.machine";

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function topValue(snap: { value: unknown }): string {
  const v = snap.value;
  return typeof v === "string" ? v : "running";
}

// ── Test 1: booting → running on APP/READY ──────────────────────────────────

console.log("\nTest 1: booting → running on APP/READY");
{
  const actor = createActor(rasedCanvasMachine);
  actor.start();

  assert("initial state is booting", topValue(actor.getSnapshot()) === "booting");

  actor.send({ type: "APP/READY" });
  assert("transitions to running", topValue(actor.getSnapshot()) === "running");

  actor.stop();
}

// ── Test 2: booting → crashed on APP/CRASH ──────────────────────────────────

console.log("\nTest 2: booting → crashed on APP/CRASH");
{
  const actor = createActor(rasedCanvasMachine);
  actor.start();

  actor.send({ type: "APP/CRASH", error: "test error" });
  assert("transitions to crashed", topValue(actor.getSnapshot()) === "crashed");
  assert("stores error in context", actor.getSnapshot().context.bootError === "test error");

  actor.stop();
}

// ── Test 3: MODAL/OPEN blocks NAV/GO ────────────────────────────────────────

console.log("\nTest 3: MODAL/OPEN blocks NAV/GO");
{
  const actor = createActor(rasedCanvasMachine);
  actor.start();
  actor.send({ type: "APP/READY" });

  actor.send({ type: "MODAL/OPEN", modalId: "confirm-delete" });
  assert("modal is open in context", actor.getSnapshot().context.modalId === "confirm-delete");

  // NAV/GO should be blocked by isModalClosed guard
  actor.send({ type: "NAV/GO", path: "/data" });
  assert("NAV/GO is ignored when modal open", topValue(actor.getSnapshot()) === "running");

  actor.stop();
}

// ── Test 4: MODAL/OPEN blocks FOCUS/OPEN ────────────────────────────────────

console.log("\nTest 4: MODAL/OPEN blocks FOCUS/OPEN");
{
  const actor = createActor(rasedCanvasMachine);
  actor.start();
  actor.send({ type: "APP/READY" });

  actor.send({ type: "MODAL/OPEN", modalId: "settings" });
  assert("modal is open", actor.getSnapshot().context.modalId === "settings");

  actor.send({ type: "FOCUS/OPEN", jobId: "job-1" });
  assert("FOCUS/OPEN ignored when modal open", actor.getSnapshot().context.focusJobId === null);

  actor.send({ type: "MODAL/CLOSE" });
  actor.send({ type: "FOCUS/OPEN", jobId: "job-1" });
  assert("FOCUS/OPEN works after modal close", actor.getSnapshot().context.focusJobId === "job-1");

  actor.stop();
}

// ── Test 5: One focus stage at a time ───────────────────────────────────────

console.log("\nTest 5: One focus stage at a time");
{
  const actor = createActor(rasedCanvasMachine);
  actor.start();
  actor.send({ type: "APP/READY" });

  actor.send({ type: "FOCUS/OPEN", jobId: "job-a" });
  assert("focus opens job-a", actor.getSnapshot().context.focusJobId === "job-a");

  actor.send({ type: "FOCUS/OPEN", jobId: "job-b" });
  assert("focus replaces with job-b", actor.getSnapshot().context.focusJobId === "job-b");

  actor.send({ type: "FOCUS/CLOSE" });
  assert("focus closes", actor.getSnapshot().context.focusJobId === null);

  actor.stop();
}

// ── Test 6: Sidebar open/close/pin ──────────────────────────────────────────

console.log("\nTest 6: Sidebar open/close/pin");
{
  const actor = createActor(rasedCanvasMachine);
  actor.start();
  actor.send({ type: "APP/READY" });

  assert("sidebar initially hidden", actor.getSnapshot().context.sidebarOpen === false);

  actor.send({ type: "SIDEBAR/CLOSE" });
  assert("sidebar closes", actor.getSnapshot().context.sidebarOpen === false);

  actor.send({ type: "SIDEBAR/OPEN" });
  assert("sidebar opens", actor.getSnapshot().context.sidebarOpen === true);

  actor.send({ type: "SIDEBAR/TOGGLE_PIN" });
  assert("sidebar pinned", actor.getSnapshot().context.sidebarPinned === true);

  actor.send({ type: "SIDEBAR/SET_TAB", tab: "files" });
  assert("sidebar tab set", actor.getSnapshot().context.sidebarTab === "files");

  actor.stop();
}

// ── Test 7: Theme toggle and reduceMotion ───────────────────────────────────

console.log("\nTest 7: Theme toggle and reduceMotion");
{
  const actor = createActor(rasedCanvasMachine);
  actor.start();
  actor.send({ type: "APP/READY" });

  assert("initial theme is dark", actor.getSnapshot().context.theme === "dark");

  actor.send({ type: "THEME/TOGGLE" });
  assert("theme toggled to light", actor.getSnapshot().context.theme === "light");

  actor.send({ type: "THEME/SET_REDUCE_MOTION", enabled: true });
  assert("reduceMotion enabled", actor.getSnapshot().context.reduceMotion === true);

  actor.stop();
}

// ── Test 8: Job lifecycle ───────────────────────────────────────────────────

console.log("\nTest 8: Job lifecycle");
{
  const actor = createActor(rasedCanvasMachine);
  actor.start();
  actor.send({ type: "APP/READY" });

  actor.send({ type: "JOB/CREATE", jobId: "j1", label: "Import CSV" });
  const job1 = actor.getSnapshot().context.jobs["j1"];
  assert("job created", job1 !== undefined);
  assert("job status running", job1?.status === "running");

  actor.send({ type: "JOB/PROGRESS", jobId: "j1", progress: 50 });
  assert("job progress updated", actor.getSnapshot().context.jobs["j1"]?.progress === 50);

  actor.send({ type: "JOB/RESULT_READY", jobId: "j1", result: { title: "Done", body: "ok", chips: [] } });
  assert("job done", actor.getSnapshot().context.jobs["j1"]?.status === "done");

  actor.stop();
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
