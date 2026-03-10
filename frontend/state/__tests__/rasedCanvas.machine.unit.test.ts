import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { rasedCanvasMachine } from "../rasedCanvas.machine";
import type { Attachment } from "../rasedCanvas.types";

function boot() {
  const actor = createActor(rasedCanvasMachine);
  actor.start();
  actor.send({ type: "APP/READY" });
  return actor;
}

function sampleAttachment(name = "sample.pdf"): Attachment {
  return {
    assetId: `asset-${name}`,
    name,
    mime: "application/pdf",
    sizeBytes: 2048,
    sha256: "a".repeat(64),
  };
}

describe("rasedCanvasMachine", () => {
  it("boots into running and crashes on APP/FAIL", () => {
    const actor = createActor(rasedCanvasMachine);
    actor.start();
    expect(actor.getSnapshot().value).toBe("booting");

    actor.send({ type: "APP/READY" });
    expect(actor.getSnapshot().matches("running")).toBe(true);

    actor.send({ type: "APP/FAIL", error: { code: "fatal", message: "boom" } });
    expect(actor.getSnapshot().value).toBe("crashed");
    expect(actor.getSnapshot().context.appError?.code).toBe("fatal");
  });

  it("keeps sidebar in peek when pinned and closed", () => {
    const actor = boot();

    actor.send({ type: "SIDEBAR/TOGGLE_PIN" });
    actor.send({ type: "SIDEBAR/CLOSE" });

    expect(actor.getSnapshot().context.sidebar.pin).toBe("pinned");
    expect(actor.getSnapshot().context.sidebar.mode).toBe("peek");
  });

  it("disables particles and premium motion when reduce motion is enabled", () => {
    const actor = boot();

    actor.send({ type: "EFFECTS/SET_REDUCE_MOTION", value: true });

    const { uiEffects } = actor.getSnapshot().context;
    expect(uiEffects.reduceMotion).toBe(true);
    expect(uiEffects.particlesEnabled).toBe(false);
    expect(uiEffects.premiumMotionEnabled).toBe(false);
  });

  it("blocks NAV/GO and FOCUS/OPEN while a blocking modal is open", () => {
    const actor = boot();

    actor.send({ type: "MODAL/OPEN", modal: "export" });
    actor.send({ type: "NAV/GO", view: "reports" });
    actor.send({ type: "FOCUS/OPEN", artifactId: "artifact-1", kind: "pdf", stageMode: "view" });

    expect(actor.getSnapshot().context.nav.activeView).toBe("chat");
    expect(actor.getSnapshot().context.focus.open).toBe(false);
  });

  it("creates a file message on drop and actions card after ACTIONS/SHOW", () => {
    const actor = boot();

    actor.send({ type: "DROP/FILES", files: [sampleAttachment()] });
    actor.send({ type: "ACTIONS/SHOW", forAssetIds: ["asset-sample.pdf"] });

    const messages = actor.getSnapshot().context.conversation.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].attachments?.[0]?.name).toBe("sample.pdf");
    expect(messages[1].cards?.[0]).toContain("card.actions.");
  });

  it("runs the strict job sequence Plan -> Run -> Preview -> Result -> Evidence", () => {
    const actor = boot();

    actor.send({ type: "ACTIONS/SELECT", actionId: "convert-strict" });
    actor.send({ type: "JOB/CREATE", jobId: "job-1" });
    actor.send({ type: "JOB/STAGE", jobId: "job-1", stage: "running" });
    actor.send({ type: "JOB/PREVIEW_READY", jobId: "job-1", previewCardId: "card.preview.job-1.1" });
    actor.send({
      type: "JOB/RESULT_READY",
      jobId: "job-1",
      artifactIds: ["artifact-1"],
      resultCardId: "card.result.job-1",
    });
    actor.send({
      type: "JOB/EVIDENCE_READY",
      jobId: "job-1",
      evidenceId: "evidence-1",
      evidenceCardId: "card.evidence.job-1",
    });

    const job = actor.getSnapshot().context.jobs.byId["job-1"];
    expect(job.runCards).toHaveLength(1);
    expect(job.previewCards).toEqual(["card.preview.job-1.1"]);
    expect(job.resultCards).toEqual(["card.result.job-1"]);
    expect(job.evidenceId).toBe("evidence-1");
    expect(job.stage).toBe("completed");
  });

  it("closes focus stage on NAV/GO without route-level navigation state leaks", () => {
    const actor = boot();

    actor.send({ type: "FOCUS/OPEN", artifactId: "artifact-1", kind: "pptx", stageMode: "edit" });
    expect(actor.getSnapshot().context.focus.open).toBe(true);

    actor.send({ type: "NAV/GO", view: "reports" });

    expect(actor.getSnapshot().context.focus.open).toBe(false);
    expect(actor.getSnapshot().context.nav.activeView).toBe("reports");
  });

  it("creates a retry job with a new id after failure", () => {
    const actor = boot();

    actor.send({ type: "JOB/CREATE", jobId: "job-1" });
    actor.send({ type: "JOB/FAIL", jobId: "job-1", error: { code: "failed", message: "bad" } });
    actor.send({ type: "JOB/RETRY", jobId: "job-1" });

    const jobIds = actor.getSnapshot().context.jobs.activeJobIds;
    expect(jobIds).toContain("job-1");
    expect(jobIds.some((jobId) => jobId.startsWith("job-1::retry::"))).toBe(true);
  });
});
