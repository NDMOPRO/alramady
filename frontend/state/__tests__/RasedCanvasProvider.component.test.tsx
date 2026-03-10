import { describe, expect, it, vi } from "vitest";
import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RasedCanvasProvider } from "../RasedCanvasProvider";
import { useRasedCanvas } from "../useRasedCanvas";

function TestConsumer() {
  const { state, phase, send } = useRasedCanvas();
  const activeJobId = state.jobs.activeJobIds[state.jobs.activeJobIds.length - 1] ?? null;
  const activeJob = activeJobId ? state.jobs.byId[activeJobId] : null;

  return (
    <div>
      <div data-testid="phase">{phase}</div>
      <div data-testid="theme">{state.theme}</div>
      <div data-testid="sidebarMode">{state.sidebar.mode}</div>
      <div data-testid="sidebarPin">{state.sidebar.pin}</div>
      <div data-testid="dragOver">{String(state.composer.dragOver)}</div>
      <div data-testid="focusOpen">{String(state.focus.open)}</div>
      <div data-testid="paletteOpen">{String(state.overlays.commandPaletteOpen)}</div>
      <div data-testid="reduceMotion">{String(state.uiEffects.reduceMotion)}</div>
      <div data-testid="messageCount">{state.conversation.messages.length}</div>
      <div data-testid="jobCount">{state.jobs.activeJobIds.length}</div>
      <div data-testid="jobStage">{activeJob?.stage ?? "none"}</div>
      <div data-testid="jobEvidence">{activeJob?.evidenceId ?? "none"}</div>

      <div
        data-testid="dropzone"
        onDragEnter={() => send({ type: "DROP/ENTER" })}
        onDragLeave={() => send({ type: "DROP/LEAVE" })}
      />

      <button data-testid="open-sidebar" onClick={() => send({ type: "SIDEBAR/OPEN" })}>sidebar</button>
      <button data-testid="pin-sidebar" onClick={() => send({ type: "SIDEBAR/TOGGLE_PIN" })}>pin</button>
      <button data-testid="close-sidebar" onClick={() => send({ type: "SIDEBAR/CLOSE" })}>close</button>
      <button data-testid="open-palette" onClick={() => send({ type: "PALETTE/OPEN" })}>palette</button>
      <button data-testid="close-palette" onClick={() => send({ type: "PALETTE/CLOSE" })}>close palette</button>
      <button data-testid="focus-open" onClick={() => send({ type: "FOCUS/OPEN", artifactId: "artifact-1", kind: "pdf", stageMode: "view" })}>focus</button>
      <button data-testid="reduce-motion" onClick={() => send({ type: "EFFECTS/SET_REDUCE_MOTION", value: true })}>motion</button>
      <button data-testid="send-message" onClick={() => { send({ type: "COMPOSER/SET_TEXT", text: "مرحبا" }); send({ type: "COMPOSER/SEND" }); send({ type: "JOB/CREATE", jobId: "job-1" }); }}>send</button>
      <button data-testid="job-create-2" onClick={() => send({ type: "JOB/CREATE", jobId: "job-2" })}>job-create-2</button>
      <button
        data-testid="job-result-2"
        onClick={() => send({ type: "JOB/RESULT_READY", jobId: "job-2", artifactIds: ["artifact-2"], resultCardId: "card.result.job-2" })}
      >
        job-result-2
      </button>
      <button
        data-testid="job-evidence-2"
        onClick={() => send({ type: "JOB/EVIDENCE_READY", jobId: "job-2", evidenceId: "evidence-2", evidenceCardId: "card.evidence.job-2" })}
      >
        job-evidence-2
      </button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <RasedCanvasProvider>
      <TestConsumer />
    </RasedCanvasProvider>
  );
}

describe("RasedCanvasProvider", () => {
  it("auto-boots into running", () => {
    renderWithProvider();
    expect(screen.getByTestId("phase").textContent).toBe("running");
  });

  it("opens and pins the sidebar without leaving the canvas", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByTestId("open-sidebar"));
    expect(screen.getByTestId("sidebarMode").textContent).toBe("peek");

    await user.click(screen.getByTestId("pin-sidebar"));
    await user.click(screen.getByTestId("close-sidebar"));
    expect(screen.getByTestId("sidebarPin").textContent).toBe("pinned");
    expect(screen.getByTestId("sidebarMode").textContent).toBe("peek");
  });

  it("tracks drag state and command palette state", async () => {
    const user = userEvent.setup();
    renderWithProvider();
    const dropzone = screen.getByTestId("dropzone");

    await act(async () => {
      dropzone.dispatchEvent(new Event("dragenter", { bubbles: true }));
    });
    expect(screen.getByTestId("dragOver").textContent).toBe("true");

    await act(async () => {
      dropzone.dispatchEvent(new Event("dragleave", { bubbles: true }));
    });
    expect(screen.getByTestId("dragOver").textContent).toBe("false");

    await user.click(screen.getByTestId("open-palette"));
    expect(screen.getByTestId("paletteOpen").textContent).toBe("true");

    await user.click(screen.getByTestId("close-palette"));
    expect(screen.getByTestId("paletteOpen").textContent).toBe("false");
  });

  it("opens focus stage and enables reduce motion", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByTestId("focus-open"));
    expect(screen.getByTestId("focusOpen").textContent).toBe("true");

    await user.click(screen.getByTestId("reduce-motion"));
    expect(screen.getByTestId("reduceMotion").textContent).toBe("true");
  });

  it("creates a user message and job on send", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByTestId("send-message"));
    expect(screen.getByTestId("messageCount").textContent).toBe("1");
    expect(screen.getByTestId("jobCount").textContent).toBe("1");
    expect(screen.getByTestId("jobStage").textContent).toBe("analyzing");
  });

  it("does not mark the job completed before evidence arrives", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByTestId("job-create-2"));
    await user.click(screen.getByTestId("job-result-2"));
    expect(screen.getByTestId("jobStage").textContent).toBe("exporting");
    expect(screen.getByTestId("jobEvidence").textContent).toBe("none");

    await user.click(screen.getByTestId("job-evidence-2"));
    expect(screen.getByTestId("jobStage").textContent).toBe("completed");
    expect(screen.getByTestId("jobEvidence").textContent).toBe("evidence-2");
  });
});

describe("useRasedCanvas outside provider", () => {
  it("throws with a clear error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow("useRasedCanvas must be used inside <RasedCanvasProvider>");
    spy.mockRestore();
  });
});
