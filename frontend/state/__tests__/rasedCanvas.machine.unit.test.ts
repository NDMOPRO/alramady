import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { rasedCanvasMachine } from "../rasedCanvas.machine";

function boot() {
  const actor = createActor(rasedCanvasMachine);
  actor.start();
  actor.send({ type: "APP/READY" });
  return actor;
}

function topValue(snap: { value: unknown }): string {
  return typeof snap.value === "string" ? snap.value : "running";
}

// ─── A.1  booting → running on APP/READY ────────────────────────────────────

describe("booting → running", () => {
  it("starts in booting state", () => {
    const actor = createActor(rasedCanvasMachine);
    actor.start();
    expect(topValue(actor.getSnapshot())).toBe("booting");
    actor.stop();
  });

  it("transitions to running on APP/READY", () => {
    const actor = createActor(rasedCanvasMachine);
    actor.start();
    actor.send({ type: "APP/READY" });
    expect(topValue(actor.getSnapshot())).toBe("running");
    actor.stop();
  });

  it("transitions to crashed on APP/CRASH", () => {
    const actor = createActor(rasedCanvasMachine);
    actor.start();
    actor.send({ type: "APP/CRASH", error: "fatal" });
    expect(topValue(actor.getSnapshot())).toBe("crashed");
    expect(actor.getSnapshot().context.bootError).toBe("fatal");
    actor.stop();
  });

  it("ignores non-boot events while booting", () => {
    const actor = createActor(rasedCanvasMachine);
    actor.start();
    actor.send({ type: "SIDEBAR/OPEN" });
    expect(topValue(actor.getSnapshot())).toBe("booting");
    actor.stop();
  });
});

// ─── A.2  MODAL/OPEN blocks NAV/GO and FOCUS/OPEN ──────────────────────────

describe("MODAL/OPEN blocks NAV/GO and FOCUS/OPEN", () => {
  it("NAV/GO is ignored when modal is open", () => {
    const actor = boot();
    actor.send({ type: "MODAL/OPEN", modalId: "export" });
    expect(actor.getSnapshot().context.modalId).toBe("export");

    // NAV/GO guarded by isModalClosed — should not crash, state stays running
    actor.send({ type: "NAV/GO", path: "/data" });
    expect(topValue(actor.getSnapshot())).toBe("running");
    expect(actor.getSnapshot().context.modalId).toBe("export");

    actor.stop();
  });

  it("FOCUS/OPEN is ignored when modal is open", () => {
    const actor = boot();
    actor.send({ type: "MODAL/OPEN", modalId: "share" });
    actor.send({ type: "FOCUS/OPEN", jobId: "j1" });
    expect(actor.getSnapshot().context.focusJobId).toBeNull();

    actor.stop();
  });

  it("NAV/GO works when modal is closed", () => {
    const actor = boot();
    // No modal open — NAV/GO should be accepted (transition fires)
    actor.send({ type: "NAV/GO", path: "/reports" });
    expect(topValue(actor.getSnapshot())).toBe("running");
    actor.stop();
  });

  it("FOCUS/OPEN works after MODAL/CLOSE", () => {
    const actor = boot();
    actor.send({ type: "MODAL/OPEN", modalId: "confirm" });
    actor.send({ type: "FOCUS/OPEN", jobId: "j1" });
    expect(actor.getSnapshot().context.focusJobId).toBeNull();

    actor.send({ type: "MODAL/CLOSE" });
    actor.send({ type: "FOCUS/OPEN", jobId: "j1" });
    expect(actor.getSnapshot().context.focusJobId).toBe("j1");

    actor.stop();
  });
});

// ─── A.3  SIDEBAR pin: CLOSE→peek, not hidden ──────────────────────────────

describe("SIDEBAR pin behaviour", () => {
  it("sidebar starts hidden", () => {
    const actor = boot();
    expect(actor.getSnapshot().context.sidebarOpen).toBe(false);
    expect(actor.getSnapshot().context.sidebarPinned).toBe(false);
    actor.stop();
  });

  it("TOGGLE_PIN sets pinned to true", () => {
    const actor = boot();
    actor.send({ type: "SIDEBAR/TOGGLE_PIN" });
    expect(actor.getSnapshot().context.sidebarPinned).toBe(true);
    actor.stop();
  });

  it("CLOSE while pinned sets sidebarOpen=false but pinned stays true (peek mode)", () => {
    const actor = boot();
    actor.send({ type: "SIDEBAR/TOGGLE_PIN" });
    expect(actor.getSnapshot().context.sidebarPinned).toBe(true);

    actor.send({ type: "SIDEBAR/CLOSE" });
    // Pinned remains true — the sidebar is in "peek" mode, not fully hidden
    expect(actor.getSnapshot().context.sidebarPinned).toBe(true);
    expect(actor.getSnapshot().context.sidebarOpen).toBe(false);

    actor.stop();
  });

  it("SET_TAB changes active tab", () => {
    const actor = boot();
    actor.send({ type: "SIDEBAR/SET_TAB", tab: "files" });
    expect(actor.getSnapshot().context.sidebarTab).toBe("files");
    actor.send({ type: "SIDEBAR/SET_TAB", tab: "recent" });
    expect(actor.getSnapshot().context.sidebarTab).toBe("recent");
    actor.stop();
  });
});

// ─── A.4  DROP/FILES produces files in context + ACTIONS/SHOW ───────────────

describe("DROP/FILES + ACTIONS/SHOW", () => {
  it("DROP/ENTER sets dropActive", () => {
    const actor = boot();
    expect(actor.getSnapshot().context.dropActive).toBe(false);
    actor.send({ type: "DROP/ENTER" });
    expect(actor.getSnapshot().context.dropActive).toBe(true);
    actor.stop();
  });

  it("DROP/LEAVE clears dropActive", () => {
    const actor = boot();
    actor.send({ type: "DROP/ENTER" });
    actor.send({ type: "DROP/LEAVE" });
    expect(actor.getSnapshot().context.dropActive).toBe(false);
    actor.stop();
  });

  it("DROP/FILES stores files and clears dropActive", () => {
    const actor = boot();
    const f1 = new File(["content"], "test.pdf", { type: "application/pdf" });
    const f2 = new File(["data"], "data.csv", { type: "text/csv" });

    actor.send({ type: "DROP/ENTER" });
    actor.send({ type: "DROP/FILES", files: [f1, f2] });

    const ctx = actor.getSnapshot().context;
    expect(ctx.dropActive).toBe(false);
    expect(ctx.droppedFiles).toHaveLength(2);
    expect(ctx.droppedFiles[0].name).toBe("test.pdf");
    expect(ctx.droppedFiles[1].name).toBe("data.csv");

    actor.stop();
  });

  it("ACTIONS/SHOW populates actions list after file drop", () => {
    const actor = boot();
    const f1 = new File(["content"], "report.pdf", { type: "application/pdf" });
    actor.send({ type: "DROP/FILES", files: [f1] });

    // Simulate actions being shown after file analysis
    actor.send({
      type: "ACTIONS/SHOW",
      actions: [
        { id: "strict", label: "مقارنة صارمة" },
        { id: "extract", label: "استخراج البيانات" },
      ],
    });

    const ctx = actor.getSnapshot().context;
    expect(ctx.actions).toHaveLength(2);
    expect(ctx.actions[0].id).toBe("strict");
    expect(ctx.selectedActionId).toBeNull();

    actor.stop();
  });

  it("ACTIONS/SELECT picks an action", () => {
    const actor = boot();
    actor.send({
      type: "ACTIONS/SHOW",
      actions: [{ id: "strict", label: "مقارنة صارمة" }],
    });
    actor.send({ type: "ACTIONS/SELECT", actionId: "strict" });

    expect(actor.getSnapshot().context.selectedActionId).toBe("strict");
    actor.stop();
  });

  it("ACTIONS/DISMISS clears actions", () => {
    const actor = boot();
    actor.send({
      type: "ACTIONS/SHOW",
      actions: [{ id: "a", label: "A" }],
    });
    actor.send({ type: "ACTIONS/DISMISS" });

    const ctx = actor.getSnapshot().context;
    expect(ctx.actions).toHaveLength(0);
    expect(ctx.selectedActionId).toBeNull();
    actor.stop();
  });
});

// ─── A.5  JOB lifecycle: CREATE→STAGE→PROGRESS→RESULT→EVIDENCE→COMPLETED ───

describe("JOB lifecycle", () => {
  it("full lifecycle: CREATE → STAGE → PROGRESS → PREVIEW → RESULT → EVIDENCE", () => {
    const actor = boot();

    // CREATE
    actor.send({ type: "JOB/CREATE", jobId: "job-1", label: "Import CSV" });
    let job = actor.getSnapshot().context.jobs["job-1"];
    expect(job).toBeDefined();
    expect(job!.status).toBe("running");
    expect(job!.stage).toBe("created");
    expect(job!.progress).toBe(0);
    expect(actor.getSnapshot().context.activeJobId).toBe("job-1");

    // STAGE
    actor.send({ type: "JOB/STAGE", jobId: "job-1", stage: "parsing" });
    job = actor.getSnapshot().context.jobs["job-1"];
    expect(job!.stage).toBe("parsing");

    // PROGRESS
    actor.send({ type: "JOB/PROGRESS", jobId: "job-1", progress: 35 });
    job = actor.getSnapshot().context.jobs["job-1"];
    expect(job!.progress).toBe(35);

    actor.send({ type: "JOB/PROGRESS", jobId: "job-1", progress: 70 });
    job = actor.getSnapshot().context.jobs["job-1"];
    expect(job!.progress).toBe(70);

    // PREVIEW_READY
    actor.send({ type: "JOB/PREVIEW_READY", jobId: "job-1", previewUrl: "/preview/job-1.png" });
    job = actor.getSnapshot().context.jobs["job-1"];
    expect(job!.status).toBe("preview");
    expect(job!.previewUrl).toBe("/preview/job-1.png");

    // RESULT_READY
    actor.send({
      type: "JOB/RESULT_READY",
      jobId: "job-1",
      result: {
        title: "Import Complete",
        body: "1,234 rows imported",
        chips: ["CSV", "1234 rows"],
        outputs: [{ kind: "route", label: "View Dataset", href: "/data/ds-1" }],
      },
    });
    job = actor.getSnapshot().context.jobs["job-1"];
    expect(job!.status).toBe("done");
    expect(job!.result).toBeDefined();
    expect(job!.result!.title).toBe("Import Complete");
    expect(job!.result!.outputs).toHaveLength(1);

    // EVIDENCE_READY
    actor.send({
      type: "JOB/EVIDENCE_READY",
      jobId: "job-1",
      evidence: { sources: [{ label: "Original CSV", url: "/files/original.csv" }] },
    });
    job = actor.getSnapshot().context.jobs["job-1"];
    expect(job!.evidence).toBeDefined();
    expect(job!.evidence!.sources).toHaveLength(1);

    actor.stop();
  });

  it("JOB/FAIL sets error and failed status", () => {
    const actor = boot();
    actor.send({ type: "JOB/CREATE", jobId: "job-2", label: "Parse PDF" });
    actor.send({ type: "JOB/PROGRESS", jobId: "job-2", progress: 20 });
    actor.send({ type: "JOB/FAIL", jobId: "job-2", error: "Corrupt PDF" });

    const job = actor.getSnapshot().context.jobs["job-2"];
    expect(job!.status).toBe("failed");
    expect(job!.error).toBe("Corrupt PDF");
    expect(job!.progress).toBe(20);

    actor.stop();
  });

  it("multiple jobs can coexist", () => {
    const actor = boot();
    actor.send({ type: "JOB/CREATE", jobId: "a", label: "Job A" });
    actor.send({ type: "JOB/CREATE", jobId: "b", label: "Job B" });

    const ctx = actor.getSnapshot().context;
    expect(Object.keys(ctx.jobs)).toHaveLength(2);
    expect(ctx.jobs["a"]).toBeDefined();
    expect(ctx.jobs["b"]).toBeDefined();
    expect(ctx.activeJobId).toBe("b"); // last created

    actor.stop();
  });

  it("ignores events for non-existent jobs", () => {
    const actor = boot();
    actor.send({ type: "JOB/CREATE", jobId: "x", label: "X" });
    actor.send({ type: "JOB/PROGRESS", jobId: "nonexistent", progress: 50 });

    // Should not crash, job x unchanged
    expect(actor.getSnapshot().context.jobs["x"]!.progress).toBe(0);
    actor.stop();
  });
});

// ─── A.6  ReduceMotion: disables particles + premium motion ─────────────────

describe("ReduceMotion", () => {
  it("reduceMotion defaults to false", () => {
    const actor = boot();
    expect(actor.getSnapshot().context.reduceMotion).toBe(false);
    actor.stop();
  });

  it("THEME/SET_REDUCE_MOTION enables reduceMotion", () => {
    const actor = boot();
    actor.send({ type: "THEME/SET_REDUCE_MOTION", enabled: true });
    const ctx = actor.getSnapshot().context;
    expect(ctx.reduceMotion).toBe(true);
    // When reduceMotion=true, UI layer should disable particles and premium motion.
    // The FSM stores the flag; rendering layer reads it.
    actor.stop();
  });

  it("THEME/SET_REDUCE_MOTION can toggle back to false", () => {
    const actor = boot();
    actor.send({ type: "THEME/SET_REDUCE_MOTION", enabled: true });
    expect(actor.getSnapshot().context.reduceMotion).toBe(true);

    actor.send({ type: "THEME/SET_REDUCE_MOTION", enabled: false });
    expect(actor.getSnapshot().context.reduceMotion).toBe(false);

    actor.stop();
  });

  it("theme toggle works independently of reduceMotion", () => {
    const actor = boot();
    actor.send({ type: "THEME/SET_REDUCE_MOTION", enabled: true });
    actor.send({ type: "THEME/TOGGLE" });

    const ctx = actor.getSnapshot().context;
    expect(ctx.theme).toBe("light");
    expect(ctx.reduceMotion).toBe(true);

    actor.stop();
  });
});

// ─── Focus Stage ─────────────────────────────────────────────────────────────

describe("Focus Stage", () => {
  it("one focus at a time — replacing", () => {
    const actor = boot();
    actor.send({ type: "FOCUS/OPEN", jobId: "a" });
    expect(actor.getSnapshot().context.focusJobId).toBe("a");

    actor.send({ type: "FOCUS/OPEN", jobId: "b" });
    expect(actor.getSnapshot().context.focusJobId).toBe("b");

    actor.stop();
  });

  it("FOCUS/CLOSE resets focusJobId", () => {
    const actor = boot();
    actor.send({ type: "FOCUS/OPEN", jobId: "a" });
    actor.send({ type: "FOCUS/CLOSE" });
    expect(actor.getSnapshot().context.focusJobId).toBeNull();
    actor.stop();
  });
});

// ─── Conversation ────────────────────────────────────────────────────────────

describe("Conversation", () => {
  it("COMPOSER/SEND adds user message and clears text", () => {
    const actor = boot();
    actor.send({ type: "COMPOSER/SET_TEXT", text: "ما هي البيانات؟" });
    expect(actor.getSnapshot().context.composerText).toBe("ما هي البيانات؟");

    actor.send({ type: "COMPOSER/SEND" });
    const ctx = actor.getSnapshot().context;
    expect(ctx.composerText).toBe("");
    expect(ctx.conversation).toHaveLength(1);
    expect(ctx.conversation[0].role).toBe("user");

    actor.stop();
  });

  it("streaming: chunks accumulate then flush on STREAM_END", () => {
    const actor = boot();
    actor.send({ type: "CONVERSATION/STREAM_CHUNK", chunk: "Hello " });
    actor.send({ type: "CONVERSATION/STREAM_CHUNK", chunk: "world" });

    expect(actor.getSnapshot().context.streamBuffer).toBe("Hello world");
    expect(actor.getSnapshot().context.conversation).toHaveLength(0);

    actor.send({ type: "CONVERSATION/STREAM_END" });
    const ctx = actor.getSnapshot().context;
    expect(ctx.streamBuffer).toBe("");
    expect(ctx.conversation).toHaveLength(1);
    expect(ctx.conversation[0].content).toBe("Hello world");
    expect(ctx.conversation[0].role).toBe("assistant");

    actor.stop();
  });
});

// ─── APP/CRASH from running ──────────────────────────────────────────────────

describe("APP/CRASH from running", () => {
  it("running → crashed on APP/CRASH", () => {
    const actor = boot();
    expect(topValue(actor.getSnapshot())).toBe("running");

    actor.send({ type: "APP/CRASH", error: "Runtime failure" });
    expect(topValue(actor.getSnapshot())).toBe("crashed");
    expect(actor.getSnapshot().context.bootError).toBe("Runtime failure");

    actor.stop();
  });
});
