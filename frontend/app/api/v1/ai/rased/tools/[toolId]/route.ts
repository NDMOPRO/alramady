import { NextRequest, NextResponse } from "next/server";
import { createId, isLocalE2ERuntime, jsonTool, proxyToBackend } from "@/app/api/v1/_shared/e2e-runtime";

type ToolBody = {
  request_id?: string;
  tool_id?: string;
  inputs?: Record<string, unknown>;
  params?: Record<string, unknown>;
};

function buildIntent(prompt: string) {
  const lowered = prompt.toLowerCase();
  const isGuide = /علمني|ارشدني|أرشدني|guide|tour|coach/.test(prompt);
  const isStrict = /strict|صارم|مطابقة/.test(prompt);
  const targets = /لوحة|dashboard/.test(prompt)
    ? ["dashboard-service"]
    : /تفريغ|video|audio/.test(prompt)
      ? ["conversion-service"]
      : /عرض|powerpoint|ppt/.test(prompt)
        ? ["presentation-service"]
        : ["canvas"];

  return {
    goal: prompt,
    engine_targets: targets,
    exports: isStrict ? ["png", "json"] : ["json"],
    controls: {
      guided_tour_requested: isGuide,
      strict_requested: isStrict,
    },
    risk_level: "low" as const,
  };
}

function buildPlan(goal: string) {
  return {
    graph_id: createId("graph"),
    goal,
    steps: [
      { step_id: createId("step"), label: "التقاط السياق" },
      { step_id: createId("step"), label: "تنفيذ المسار" },
      { step_id: createId("step"), label: "قفل الإثبات" },
    ],
  };
}

export async function POST(
  request: NextRequest,
  context: { params: { toolId: string } }
) {
  const { toolId } = context.params;

  if (!isLocalE2ERuntime()) {
    return proxyToBackend(request, `/api/v1/ai/rased/tools/${toolId}`);
  }

  const raw = await request.text();
  const body = (raw ? JSON.parse(raw) : {}) as ToolBody;
  const requestId = body.request_id ?? createId("req");

  switch (toolId) {
    case "rased.preference.get":
      return jsonTool(requestId, toolId, {
        preferences: {
          reduce_motion: false,
          evidence_visibility: true,
        },
      });

    case "rased.preference.set":
      return jsonTool(requestId, toolId, {
        preferences: body.inputs?.values ?? {},
      });

    case "rased.intent_parse": {
      const prompt = String(body.inputs?.prompt ?? "");
      return jsonTool(requestId, toolId, {
        intent_manifest: buildIntent(prompt),
      });
    }

    case "rased.plan_action_graph": {
      const intent = (body.inputs?.intent_manifest as { goal?: string } | undefined) ?? {};
      return jsonTool(requestId, toolId, {
        action_graph: buildPlan(String(intent.goal ?? "تنفيذ مباشر")),
      });
    }

    case "rased.evidence.pack":
      return jsonTool(requestId, toolId, {
        evidence_id: createId("evidence"),
        artifact: Array.isArray(body.inputs?.artifacts) ? body.inputs?.artifacts[0] : undefined,
      });

    case "rased.ui_action.dispatch":
      return jsonTool(requestId, toolId, {
        applied: Array.isArray(body.inputs?.actions) ? body.inputs.actions.length : 0,
      });

    case "rased.ui_tour.start":
      return jsonTool(requestId, toolId, {
        tour_session_id: createId("tour"),
      });

    case "rased.ui_tour.step":
      return jsonTool(requestId, toolId, {
        acknowledged: true,
        progress: Math.max(0, Number(body.inputs?.step_index ?? 0) + 1),
      });

    case "rased.ui_tour.end":
      return jsonTool(requestId, toolId, {
        ended: true,
        completion_rate: 1,
      });

    case "rased.observe_ui_state":
      return jsonTool(requestId, toolId, {
        ui_state: {
          selection: { kind: "none" },
          open_panels: [],
          focus_stage: {},
          running_jobs: [],
        },
      });

    case "rased.policy.check":
      return jsonTool(requestId, toolId, {
        allow: true,
        deny: false,
        reason: "local-e2e-allow",
      });

    case "rased.execute_action_graph":
      return jsonTool(requestId, toolId, {
        action_ids: [createId("action")],
        artifacts: [],
        evidence_id: createId("evidence"),
      });

    default:
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported local tool: ${toolId}`,
        },
        { status: 404 }
      );
  }
}
