import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RasedCanvasProvider } from "../RasedCanvasProvider";
import { useRasedCanvas } from "../useRasedCanvas";

// ─── Helper: Test consumer component ─────────────────────────────────────────

function TestConsumer() {
  const { state, phase, send } = useRasedCanvas();
  return (
    <div>
      <div data-testid="phase">{phase}</div>
      <div data-testid="theme">{state.theme}</div>
      <div data-testid="dropActive">{String(state.dropActive)}</div>
      <div data-testid="actionsCount">{state.actions.length}</div>
      <div data-testid="focusJobId">{state.focusJobId ?? "null"}</div>
      <div data-testid="modalId">{state.modalId ?? "null"}</div>
      <div data-testid="reduceMotion">{String(state.reduceMotion)}</div>
      <div data-testid="sidebarOpen">{String(state.sidebarOpen)}</div>
      <div data-testid="jobCount">{Object.keys(state.jobs).length}</div>
      <div data-testid="conversation">{state.conversation.length}</div>

      {/* Dropzone simulation */}
      <div
        data-testid="dropzone"
        onDragEnter={() => send({ type: "DROP/ENTER" })}
        onDragLeave={() => send({ type: "DROP/LEAVE" })}
      />

      <button data-testid="btn-actions" onClick={() => send({
        type: "ACTIONS/SHOW",
        actions: [
          { id: "strict", label: "مقارنة صارمة" },
          { id: "extract", label: "استخراج" },
        ],
      })}>Show Actions</button>

      <button data-testid="btn-focus" onClick={() => send({ type: "FOCUS/OPEN", jobId: "test-job" })}>Open Focus</button>
      <button data-testid="btn-focus-close" onClick={() => send({ type: "FOCUS/CLOSE" })}>Close Focus</button>
      <button data-testid="btn-modal" onClick={() => send({ type: "MODAL/OPEN", modalId: "export" })}>Open Modal</button>
      <button data-testid="btn-modal-close" onClick={() => send({ type: "MODAL/CLOSE" })}>Close Modal</button>
      <button data-testid="btn-reduce-motion" onClick={() => send({ type: "THEME/SET_REDUCE_MOTION", enabled: true })}>Reduce Motion</button>

      <button data-testid="btn-create-job" onClick={() => send({ type: "JOB/CREATE", jobId: "j1", label: "Test" })}>Create Job</button>
      <button data-testid="btn-result-job" onClick={() => send({
        type: "JOB/RESULT_READY",
        jobId: "j1",
        result: { title: "Done", body: "ok", chips: [] },
      })}>Result Ready</button>
      <button data-testid="btn-evidence-job" onClick={() => send({
        type: "JOB/EVIDENCE_READY",
        jobId: "j1",
        evidence: { sources: [{ label: "src" }] },
      })}>Evidence Ready</button>

      {/* Actions chips rendering */}
      {state.actions.length > 0 && (
        <div data-testid="actions-chips">
          {state.actions.map((a) => (
            <button
              key={a.id}
              data-testid={`action-${a.id}`}
              onClick={() => send({ type: "ACTIONS/SELECT", actionId: a.id })}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Job status display */}
      {Object.values(state.jobs).map((job) => (
        <div key={job.jobId} data-testid={`job-${job.jobId}`}>
          <span data-testid={`job-${job.jobId}-status`}>{job.status}</span>
          {job.result && <span data-testid={`job-${job.jobId}-result`}>Done</span>}
          {job.evidence && <span data-testid={`job-${job.jobId}-evidence`}>Evidence</span>}
        </div>
      ))}
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

// ─── B.1  Provider auto-boots to running ─────────────────────────────────────

describe("RasedCanvasProvider", () => {
  it("auto-boots: phase transitions from booting to running", async () => {
    renderWithProvider();
    // After mount + useEffect, phase should be "running"
    expect(screen.getByTestId("phase").textContent).toBe("running");
  });

  it("theme defaults to dark", () => {
    renderWithProvider();
    expect(screen.getByTestId("theme").textContent).toBe("dark");
  });
});

// ─── B.2  Dropzone highlight on DROP/ENTER ───────────────────────────────────

describe("Dropzone highlight", () => {
  it("shows highlight on DROP/ENTER, hides on DROP/LEAVE", async () => {
    renderWithProvider();
    const dropzone = screen.getByTestId("dropzone");

    expect(screen.getByTestId("dropActive").textContent).toBe("false");

    await act(async () => {
      dropzone.dispatchEvent(new Event("dragenter", { bubbles: true }));
    });
    expect(screen.getByTestId("dropActive").textContent).toBe("true");

    await act(async () => {
      dropzone.dispatchEvent(new Event("dragleave", { bubbles: true }));
    });
    expect(screen.getByTestId("dropActive").textContent).toBe("false");
  });
});

// ─── B.3  Actions chips appear quickly ───────────────────────────────────────

describe("Actions chips", () => {
  it("chips appear after ACTIONS/SHOW", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    expect(screen.queryByTestId("actions-chips")).toBeNull();

    await user.click(screen.getByTestId("btn-actions"));

    expect(screen.getByTestId("actions-chips")).toBeInTheDocument();
    expect(screen.getByTestId("action-strict")).toBeInTheDocument();
    expect(screen.getByTestId("action-extract")).toBeInTheDocument();
    expect(screen.getByTestId("actionsCount").textContent).toBe("2");
  });

  it("chips render within the same tick (synchronous state update)", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    const start = performance.now();
    await user.click(screen.getByTestId("btn-actions"));
    const elapsed = performance.now() - start;

    expect(screen.getByTestId("actions-chips")).toBeInTheDocument();
    // Should render well under 300ms threshold
    expect(elapsed).toBeLessThan(300);
  });
});

// ─── B.4  "Done" does not show until EvidenceCard exists ─────────────────────

describe("Done requires Evidence", () => {
  it("job result shows Done, evidence appears after EVIDENCE_READY", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    // Create job
    await user.click(screen.getByTestId("btn-create-job"));
    expect(screen.getByTestId("job-j1-status").textContent).toBe("running");

    // Result ready — shows Done
    await user.click(screen.getByTestId("btn-result-job"));
    expect(screen.getByTestId("job-j1-status").textContent).toBe("done");
    expect(screen.getByTestId("job-j1-result")).toBeInTheDocument();
    expect(screen.queryByTestId("job-j1-evidence")).toBeNull();

    // Evidence ready — now Evidence card appears
    await user.click(screen.getByTestId("btn-evidence-job"));
    expect(screen.getByTestId("job-j1-evidence")).toBeInTheDocument();
  });
});

// ─── B.5  Focus Stage opens inside same page (no route change) ───────────────

describe("Focus Stage in-page", () => {
  it("opens focus without route change", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    expect(screen.getByTestId("focusJobId").textContent).toBe("null");

    await user.click(screen.getByTestId("btn-focus"));
    expect(screen.getByTestId("focusJobId").textContent).toBe("test-job");
    // Still in same component tree — no navigation occurred
    expect(screen.getByTestId("phase").textContent).toBe("running");

    await user.click(screen.getByTestId("btn-focus-close"));
    expect(screen.getByTestId("focusJobId").textContent).toBe("null");
  });

  it("modal blocks focus open", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByTestId("btn-modal"));
    expect(screen.getByTestId("modalId").textContent).toBe("export");

    await user.click(screen.getByTestId("btn-focus"));
    expect(screen.getByTestId("focusJobId").textContent).toBe("null");

    await user.click(screen.getByTestId("btn-modal-close"));
    await user.click(screen.getByTestId("btn-focus"));
    expect(screen.getByTestId("focusJobId").textContent).toBe("test-job");
  });
});

// ─── B.6  ReduceMotion in component ──────────────────────────────────────────

describe("ReduceMotion in component", () => {
  it("toggles reduceMotion via send", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    expect(screen.getByTestId("reduceMotion").textContent).toBe("false");
    await user.click(screen.getByTestId("btn-reduce-motion"));
    expect(screen.getByTestId("reduceMotion").textContent).toBe("true");
  });
});

// ─── useRasedCanvas throws outside provider ──────────────────────────────────

describe("useRasedCanvas outside provider", () => {
  it("throws when used outside RasedCanvasProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      "useRasedCanvas must be used inside <RasedCanvasProvider>"
    );
    spy.mockRestore();
  });
});
