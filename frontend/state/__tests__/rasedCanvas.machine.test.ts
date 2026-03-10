import { createActor } from "xstate";
import { rasedCanvasMachine } from "../rasedCanvas.machine";

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed += 1;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed += 1;
  }
}

function boot() {
  const actor = createActor(rasedCanvasMachine);
  actor.start();
  actor.send({ type: "APP/READY" });
  return actor;
}

console.log("\nFSM runtime checks");

{
  const actor = boot();
  assert("starts in running after APP/READY", actor.getSnapshot().matches("running"));
  actor.stop();
}

{
  const actor = boot();
  actor.send({ type: "EFFECTS/SET_REDUCE_MOTION", value: true });
  const effects = actor.getSnapshot().context.uiEffects;
  assert("reduce motion enabled", effects.reduceMotion === true);
  assert("particles disabled with reduce motion", effects.particlesEnabled === false);
  actor.stop();
}

{
  const actor = boot();
  actor.send({ type: "MODAL/OPEN", modal: "confirm" });
  actor.send({ type: "FOCUS/OPEN", artifactId: "artifact-1", kind: "pdf", stageMode: "view" });
  actor.send({ type: "NAV/GO", view: "reports" });
  assert("modal blocks focus opening", actor.getSnapshot().context.focus.open === false);
  assert("modal blocks navigation", actor.getSnapshot().context.nav.activeView === "chat");
  actor.stop();
}

{
  const actor = boot();
  actor.send({ type: "JOB/CREATE", jobId: "job-1" });
  actor.send({ type: "JOB/STAGE", jobId: "job-1", stage: "running" });
  actor.send({ type: "JOB/RESULT_READY", jobId: "job-1", artifactIds: ["artifact-1"], resultCardId: "card.result.job-1" });
  actor.send({ type: "JOB/EVIDENCE_READY", jobId: "job-1", evidenceId: "evidence-1", evidenceCardId: "card.evidence.job-1" });
  const job = actor.getSnapshot().context.jobs.byId["job-1"];
  assert("job reaches completed after evidence", job.stage === "completed");
  assert("job carries evidence id", job.evidenceId === "evidence-1");
  actor.stop();
}

{
  const actor = boot();
  actor.send({ type: "SIDEBAR/TOGGLE_PIN" });
  actor.send({ type: "SIDEBAR/CLOSE" });
  assert("pinned sidebar closes to peek", actor.getSnapshot().context.sidebar.mode === "peek");
  actor.stop();
}

{
  const actor = boot();
  actor.send({ type: "FOCUS/OPEN", artifactId: "artifact-1", kind: "pdf", stageMode: "view" });
  actor.send({ type: "NAV/GO", view: "reports" });
  assert("navigation closes focus stage", actor.getSnapshot().context.focus.open === false);
  assert("navigation switches active view", actor.getSnapshot().context.nav.activeView === "reports");
  actor.stop();
}

{
  const actor = boot();
  actor.send({ type: "JOB/CREATE", jobId: "job-2" });
  actor.send({ type: "JOB/RESULT_READY", jobId: "job-2", artifactIds: ["artifact-2"], resultCardId: "card.result.job-2" });
  const job = actor.getSnapshot().context.jobs.byId["job-2"];
  assert("job stays non-completed before evidence", job.stage !== "completed");
  actor.stop();
}

{
  const actor = boot();
  actor.send({ type: "DROP/ENTER" });
  assert("drop enter opens sidebar peek", actor.getSnapshot().context.sidebar.mode === "peek");
  actor.stop();
}

console.log(`\n${"═".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
