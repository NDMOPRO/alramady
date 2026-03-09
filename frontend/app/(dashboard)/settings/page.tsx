"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BrainCircuit,
  Download,
  Flag,
  FileUp,
  Loader2,
  RefreshCw,
  Shield,
  Sparkles,
  Users,
  UsersRound,
} from "lucide-react";
import EmbeddedRasidAssistant, {
  type EmbeddedAssistantAction,
} from "@/components/assistant/EmbeddedRasidAssistant";
import CompactSurfaceHeader from "@/components/layout/CompactSurfaceHeader";
import AppearanceControlPanel from "@/components/settings/AppearanceControlPanel";
import Modal from "@/components/ui/Modal";
import {
  addFeatureFlagRule,
  addTeamMember,
  createFeatureFlag,
  createTeam,
  evaluateFeatureFlag,
  exportAuditLogs,
  getAuditLogs,
  getFeatureFlags,
  getTeamMembers,
  getTeams,
  getUserActivity,
  getUserById,
  getUserUsage,
  getUsers,
  removeTeamMember,
  updateFeatureFlag,
  updateUser,
  type AuditLogEntry,
  type FeatureFlag,
  type TeamMembersResponse,
  type TeamSummary,
  type UserDetails,
  type UserSummary,
  type UserUsageSummary,
} from "@/lib/api/governance";
import {
  createKnowledgeBase,
  createPromptTemplate,
  ingestKnowledgeBaseDocument,
  listKnowledgeBases,
  listPromptTemplates,
  queryKnowledgeBase,
  testPromptTemplate,
  versionPromptTemplate,
  type RasidKnowledgeBaseRecord,
  type RasidKnowledgeQueryResult,
  type RasidPromptTemplateRecord,
  type RasidPromptTestResult,
} from "@/lib/api/rasid-admin";

const blockedAdminCapabilities = [
  {
    title: "نشر نموذج مدرّب إلى production",
    reason: "مسارات /api/training الخاصة بالسجل والنشر ما زالت تعتمد جداول غير متاحة في schema الحالي لـ ai-service، لذلك لا تُفعّل من هذا السطح.",
    route: "/api/training/registry/* و /api/training/deploy*",
  },
  {
    title: "تصدير شامل لكل بيانات المنصة",
    reason: "المتاح فعليًا الآن هو تصدير سجل التدقيق فقط، ولا توجد خدمة bulk export/import شاملة لكل كيان إداري من Surface الإعدادات.",
    route: "/api/v1/governance/audit/export",
  },
];

function formatDate(value?: string | null): string {
  if (!value) return "غير متاح";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatFileSize(size: number): string {
  if (!size) return "0 B";
  const units = ["B", "KB", "MB"];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const normalized = size / Math.pow(1024, index);
  return `${normalized.toFixed(normalized >= 10 ? 0 : 1)} ${units[index]}`;
}

export default function SettingsPage() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<RasidKnowledgeBaseRecord[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<RasidPromptTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedUsage, setSelectedUsage] = useState<UserUsageSummary | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<AuditLogEntry[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamMembersResponse | null>(null);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [userRole, setUserRole] = useState("viewer");
  const [userStatus, setUserStatus] = useState("ACTIVE");
  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [flagKey, setFlagKey] = useState("rasid_assistant_enabled");
  const [flagDescription, setFlagDescription] = useState("التحكم في تشغيل مساعد راصد");
  const [flagDefaultValue, setFlagDefaultValue] = useState(true);
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditResourceFilter, setAuditResourceFilter] = useState("");
  const [evaluations, setEvaluations] = useState<Record<string, boolean>>({});
  const [knowledgeBaseName, setKnowledgeBaseName] = useState("مكتبة سياسات راصد");
  const [knowledgeBaseDescription, setKnowledgeBaseDescription] = useState("مرجع إداري عربي لسياسات التشغيل والحوكمة.");
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState("");
  const [knowledgeUploadFile, setKnowledgeUploadFile] = useState<File | null>(null);
  const [knowledgeQuestion, setKnowledgeQuestion] = useState("ما الذي تتضمنه هذه المعرفة؟");
  const [knowledgeQueryResult, setKnowledgeQueryResult] = useState<RasidKnowledgeQueryResult | null>(null);
  const [promptName, setPromptName] = useState("سير عمل تقريري");
  const [promptTemplate, setPromptTemplate] = useState("حوّل {{topic}} إلى خطوات تشغيلية عربية واضحة، ثم اذكر المخرجات والمخاطر والاعتماد المطلوب.");
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [promptVariableValue, setPromptVariableValue] = useState("إطلاق تقرير شهري تنفيذي");
  const [promptTestResult, setPromptTestResult] = useState<RasidPromptTestResult | null>(null);

  const loadData = useCallback(async () => {
    const [usersResult, auditResult, teamsResult, flagsResult] = await Promise.all([
      getUsers({ page: 1, limit: 8 }),
      getAuditLogs({ page: 1, limit: 6, action: auditActionFilter || undefined, resource: auditResourceFilter || undefined }),
      getTeams({ page: 1, limit: 8 }),
      getFeatureFlags(),
    ]);
    setUsers(usersResult.data);
    setAuditLogs(auditResult.data);
    setTeams(teamsResult.data);
    setFlags(flagsResult);
    return {
      users: usersResult.data,
      auditLogs: auditResult.data,
      teams: teamsResult.data,
      flags: flagsResult,
    };
  }, [auditActionFilter, auditResourceFilter]);

  const loadTrainingCenter = useCallback(async () => {
    const [knowledgeResult, promptsResult] = await Promise.all([
      listKnowledgeBases(),
      listPromptTemplates("workflow"),
    ]);
    setKnowledgeBases(knowledgeResult);
    setPromptTemplates(promptsResult);
    setSelectedKnowledgeBaseId((current) => current || knowledgeResult[0]?.id || "");
    setSelectedPromptId((current) => current || promptsResult[0]?.id || "");
    return {
      knowledgeBases: knowledgeResult,
      promptTemplates: promptsResult,
    };
  }, []);

  useEffect(() => {
    async function bootstrap() {
      setLoading(true);
      setErrorMessage(null);
      try {
        await Promise.all([loadData(), loadTrainingCenter()]);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "تعذر تحميل الإعدادات.");
      } finally {
        setLoading(false);
      }
    }
    void bootstrap();
  }, [loadData, loadTrainingCenter]);

  const refreshData = useCallback(async () => {
    setBusy("refresh");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const [governanceSnapshot, trainingSnapshot] = await Promise.all([
        loadData(),
        loadTrainingCenter(),
      ]);
      setStatusMessage("تم تحديث الإعدادات ومركز راصد من الخدمات الحقيقية.");
      return {
        ...governanceSnapshot,
        ...trainingSnapshot,
      };
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر تحديث الإعدادات.");
      return {
        users: [] as UserSummary[],
        auditLogs: [] as AuditLogEntry[],
        teams: [] as TeamSummary[],
        flags: [] as FeatureFlag[],
        knowledgeBases: [] as RasidKnowledgeBaseRecord[],
        promptTemplates: [] as RasidPromptTemplateRecord[],
      };
    } finally {
      setBusy(null);
    }
  }, [loadData, loadTrainingCenter]);

  const inspectUser = useCallback(async (userId: string) => {
    setBusy(`user-${userId}`);
    setErrorMessage(null);
    try {
      const [user, usage, activity] = await Promise.all([
        getUserById(userId),
        getUserUsage(userId),
        getUserActivity(userId),
      ]);
      setSelectedUser(user);
      setSelectedUsage(usage);
      setSelectedActivity(activity.slice(0, 8));
      setUserRole(user.role || "viewer");
      setUserStatus(user.status || "ACTIVE");
      setIsUserModalOpen(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر فتح ملف المستخدم.");
    } finally {
      setBusy(null);
    }
  }, []);

  const saveUser = useCallback(async () => {
    if (!selectedUser) return;
    setBusy("save-user");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const updated = await updateUser(selectedUser.id, {
        role: userRole,
        status: userStatus,
        locale: "AR",
        timezone: "Asia/Riyadh",
      });
      setSelectedUser(updated);
      setUsers((current) => current.map((item) => (item.id === updated.id ? { ...item, role: updated.role, status: updated.status } : item)));
      setStatusMessage(`تم تحديث المستخدم ${updated.name || updated.email}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر حفظ المستخدم.");
    } finally {
      setBusy(null);
    }
  }, [selectedUser, userRole, userStatus]);

  const openTeam = useCallback(async (teamId: string) => {
    setBusy(`team-${teamId}`);
    setErrorMessage(null);
    try {
      setSelectedTeam(await getTeamMembers(teamId));
      setIsTeamModalOpen(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر قراءة أعضاء الفريق.");
    } finally {
      setBusy(null);
    }
  }, []);

  const handleCreateTeam = useCallback(async () => {
    if (!teamName.trim()) return;
    setBusy("create-team");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const team = await createTeam({
        name: teamName.trim(),
        description: teamDescription.trim() || undefined,
        type: "project",
      });
      setTeams((current) => [team, ...current]);
      setTeamName("");
      setTeamDescription("");
      setStatusMessage(`تم إنشاء الفريق ${team.name} فعليًا.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر إنشاء الفريق.");
    } finally {
      setBusy(null);
    }
  }, [teamDescription, teamName]);

  const addCurrentUserToTeam = useCallback(async (teamId: string) => {
    if (!selectedUser) {
      setErrorMessage("افتح مستخدمًا أولًا قبل إضافته إلى فريق.");
      return;
    }
    setBusy(`team-add-${teamId}`);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await addTeamMember(teamId, selectedUser.id, "member");
      await openTeam(teamId);
      setStatusMessage(`تمت إضافة ${selectedUser.name || selectedUser.email} إلى الفريق.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر إضافة المستخدم إلى الفريق.");
    } finally {
      setBusy(null);
    }
  }, [openTeam, selectedUser]);

  const handleRemoveMember = useCallback(async (teamId: string, userId: string) => {
    setBusy(`team-remove-${teamId}-${userId}`);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await removeTeamMember(teamId, userId);
      await openTeam(teamId);
      setStatusMessage("تمت إزالة العضو.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر إزالة العضو.");
    } finally {
      setBusy(null);
    }
  }, [openTeam]);

  const handleCreateFlag = useCallback(async () => {
    if (!flagKey.trim()) return;
    setBusy("create-flag");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const created = await createFeatureFlag({
        key: flagKey.trim(),
        description: flagDescription.trim(),
        defaultValue: flagDefaultValue,
      });
      setFlags((current) => [...current, created].sort((a, b) => a.key.localeCompare(b.key)));
      setStatusMessage(`تم إنشاء العلم ${created.key}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر إنشاء العلم.");
    } finally {
      setBusy(null);
    }
  }, [flagDefaultValue, flagDescription, flagKey]);

  const toggleFlag = useCallback(async (flag: FeatureFlag, patch: Partial<Pick<FeatureFlag, "enabled" | "defaultValue">>) => {
    setBusy(`flag-${flag.id}`);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const updated = await updateFeatureFlag(flag.id, patch);
      setFlags((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setStatusMessage(`تم تحديث العلم ${updated.key}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر تحديث العلم.");
    } finally {
      setBusy(null);
    }
  }, []);

  const disableFlagForUser = useCallback(async (flag: FeatureFlag) => {
    if (!selectedUser) {
      setErrorMessage("افتح مستخدمًا أولًا لتطبيق قاعدة تعطيل خاصة به.");
      return;
    }
    setBusy(`flag-rule-${flag.id}`);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await addFeatureFlagRule(flag.id, { userIds: [selectedUser.id], resultValue: false, priority: 0 });
      const result = await evaluateFeatureFlag(flag.key, selectedUser.id);
      setEvaluations((current) => ({ ...current, [flag.id]: result.enabled }));
      setStatusMessage(`تم تعطيل ${flag.key} للمستخدم المفتوح.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر إنشاء قاعدة المستخدم.");
    } finally {
      setBusy(null);
    }
  }, [selectedUser]);

  const handleExportAudit = useCallback(async () => {
    setBusy("export-audit");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const file = await exportAuditLogs({
        format: "csv",
        action: auditActionFilter || undefined,
        resource: auditResourceFilter || undefined,
      });
      const href = window.URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = href;
      link.download = `settings-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(href);
      setStatusMessage(`تم تصدير السجل بحجم ${formatFileSize(file.size)}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر تصدير السجل.");
    } finally {
      setBusy(null);
    }
  }, [auditActionFilter, auditResourceFilter]);

  const handleCreateKnowledgeBase = useCallback(async () => {
    if (!knowledgeBaseName.trim()) return;
    setBusy("create-kb");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const created = await createKnowledgeBase({
        name: knowledgeBaseName.trim(),
        description: knowledgeBaseDescription.trim(),
      });
      setKnowledgeBases((current) => [created, ...current]);
      setSelectedKnowledgeBaseId(created.id);
      setStatusMessage(`تم إنشاء قاعدة المعرفة ${created.name}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر إنشاء قاعدة المعرفة.");
    } finally {
      setBusy(null);
    }
  }, [knowledgeBaseDescription, knowledgeBaseName]);

  const handleIngestKnowledge = useCallback(async () => {
    if (!selectedKnowledgeBaseId || !knowledgeUploadFile) {
      setErrorMessage("اختر قاعدة معرفة وملفًا أولًا.");
      return;
    }
    setBusy("ingest-kb");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const result = await ingestKnowledgeBaseDocument(selectedKnowledgeBaseId, knowledgeUploadFile);
      const refreshed = await loadTrainingCenter();
      const activeKb = refreshed.knowledgeBases.find((item) => item.id === selectedKnowledgeBaseId);
      setStatusMessage(
        `تم استيراد الملف إلى ${activeKb?.name || "قاعدة المعرفة"} بعدد ${result.chunkCount} مقطعًا وفهرسة ${result.indexedCount} عنصرًا.`
      );
      setKnowledgeUploadFile(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر استيراد الملف إلى المعرفة.");
    } finally {
      setBusy(null);
    }
  }, [knowledgeUploadFile, loadTrainingCenter, selectedKnowledgeBaseId]);

  const handleQueryKnowledge = useCallback(async () => {
    if (!selectedKnowledgeBaseId || !knowledgeQuestion.trim()) {
      setErrorMessage("اختر قاعدة معرفة واكتب سؤالًا عربيًا.");
      return;
    }
    setBusy("query-kb");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const result = await queryKnowledgeBase({
        knowledgeBaseId: selectedKnowledgeBaseId,
        question: knowledgeQuestion.trim(),
        topK: 4,
      });
      setKnowledgeQueryResult(result);
      setStatusMessage(`تم تنفيذ الاستعلام على قاعدة المعرفة وإرجاع ${result.sources.length} مصدرًا.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر الاستعلام عن قاعدة المعرفة.");
    } finally {
      setBusy(null);
    }
  }, [knowledgeQuestion, selectedKnowledgeBaseId]);

  const handleCreatePrompt = useCallback(async () => {
    if (!promptName.trim() || !promptTemplate.trim()) return;
    setBusy("create-prompt");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const created = await createPromptTemplate({
        name: promptName.trim(),
        template: promptTemplate.trim(),
        variables: ["topic"],
        category: "workflow",
      });
      setSelectedPromptId(created.id);
      await loadTrainingCenter();
      setStatusMessage(`تم إنشاء قالب راصد ${created.name} بالإصدار ${created.version}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر إنشاء قالب راصد.");
    } finally {
      setBusy(null);
    }
  }, [loadTrainingCenter, promptName, promptTemplate]);

  const handleVersionPrompt = useCallback(async () => {
    if (!selectedPromptId) {
      setErrorMessage("اختر قالبًا أولًا قبل إنشاء إصدار جديد.");
      return;
    }
    setBusy("version-prompt");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const result = await versionPromptTemplate(
        selectedPromptId,
        "إصدار إداري محدث من Surface الإعدادات"
      );
      await loadTrainingCenter();
      setStatusMessage(`تم إنشاء إصدار جديد للقالب المختار: ${result.version}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر إصدار القالب.");
    } finally {
      setBusy(null);
    }
  }, [loadTrainingCenter, selectedPromptId]);

  const handleTestPrompt = useCallback(async () => {
    if (!selectedPromptId || !promptVariableValue.trim()) {
      setErrorMessage("اختر قالبًا واكتب قيمة حقيقية للمتغير.");
      return;
    }
    setBusy("test-prompt");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const result = await testPromptTemplate(selectedPromptId, {
        topic: promptVariableValue.trim(),
      });
      setPromptTestResult(result);
      await loadTrainingCenter();
      setStatusMessage(`تم اختبار القالب وإرجاع استجابة حقيقية باستهلاك ${result.tokensUsed} رمزًا.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر اختبار القالب.");
    } finally {
      setBusy(null);
    }
  }, [loadTrainingCenter, promptVariableValue, selectedPromptId]);

  const latestUser = users[0] ?? null;
  const assistantActions = useMemo<EmbeddedAssistantAction[]>(
    () => [
      {
        id: "refresh-settings",
        label: "حدّث الإعدادات",
        description: "يعيد تحميل المستخدمين والفرق والأعلام وسجل التدقيق.",
        keywords: ["حدث الاعدادات", "تحديث الاعدادات", "اعد التحميل"],
        run: async () => {
          const snapshot = await refreshData();
          return {
            message: `تم تحديث الإعدادات. يوجد ${snapshot.users.length} مستخدم و${snapshot.teams.length} فريق و${snapshot.flags.length} علم و${snapshot.knowledgeBases.length} قاعدة معرفة و${snapshot.promptTemplates.length} قالب راصد.`,
            chips: [
              `المستخدمون ${snapshot.users.length}`,
              `الفرق ${snapshot.teams.length}`,
              `الأعلام ${snapshot.flags.length}`,
              `المعرفة ${snapshot.knowledgeBases.length}`,
              `القوالب ${snapshot.promptTemplates.length}`,
            ],
          };
        },
      },
      {
        id: "open-first-user",
        label: "افتح أول مستخدم",
        description: "يفتح ملف الاستخدام والنشاط لأول مستخدم ظاهر.",
        keywords: ["اول مستخدم", "افتح مستخدم", "ملف المستخدم"],
        run: async () => {
          if (!latestUser) throw new Error("لا يوجد مستخدمون ظاهرون.");
          await inspectUser(latestUser.id);
          return { message: `تم فتح ملف ${latestUser.name || latestUser.email}.`, chips: [latestUser.email, latestUser.role] };
        },
      },
      {
        id: "export-audit",
        label: "صدّر سجل التدقيق",
        description: "يطلب CSV حقيقي من governance-service.",
        keywords: ["صدر التدقيق", "تصدير السجل", "audit csv"],
        run: async () => {
          await handleExportAudit();
          return { message: "تم تمرير طلب تصدير سجل التدقيق." };
        },
      },
    ],
    [handleExportAudit, inspectUser, latestUser, refreshData]
  );

  return (
    <div className="rased-surface-page" dir="rtl">
      <CompactSurfaceHeader
        badge="الإعدادات"
        title="أدر المهمة الإدارية الحالية فقط"
        description="المستخدم المفتوح أو الفريق الجاري تحريره أو علم المزايا النشط هو محور الصفحة. بقية الإدارة تظهر عند الحاجة فقط."
        accentClassName="border-slate-200 bg-slate-100 text-slate-800"
        metrics={[
          { label: "المستخدمون", value: loading ? "..." : String(users.length) },
          { label: "الفرق", value: loading ? "..." : String(teams.length) },
          { label: "الأعلام", value: loading ? "..." : String(flags.length) },
          { label: "التدقيق", value: loading ? "..." : String(auditLogs.length) },
        ]}
      />

      <EmbeddedRasidAssistant
        surfaceId="settings"
        surfaceName="الإعدادات"
        route="/settings"
        intro="أعمل فوق المستخدمين والفرق والمزايا والهوية وقاعدة معرفة راصد وقوالبه المتاحة فعليًا."
        contextSummary={
          latestUser
            ? `يوجد ${users.length} مستخدم و${teams.length} فريق و${flags.length} علم و${knowledgeBases.length} قاعدة معرفة و${promptTemplates.length} قالب. أول مستخدم ظاهر هو ${latestUser.name || latestUser.email}.`
            : `لا توجد بيانات ظاهرة الآن، ويمكنني تحديث السطح أو تصدير التدقيق أو قراءة مركز راصد.`
        }
        contextItems={[
          { label: "المستخدمون", value: String(users.length) },
          { label: "الفرق", value: String(teams.length) },
          { label: "المعرفة", value: String(knowledgeBases.length) },
          { label: "القوالب", value: String(promptTemplates.length) },
        ]}
        actions={assistantActions}
        suggestedPrompts={["ماذا يمكنك أن تفعل هنا؟", "حدّث الإعدادات", "افتح أول مستخدم", "صدّر سجل التدقيق"]}
      />

      <details className="rased-details rased-motion-stagger-1">
        <summary className="rased-summary">
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">الهوية والمظهر</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">إعدادات العرض الثانوية تبقى مطوية حتى تحتاجها.</p>
          </div>
          <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-bold text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">ثانوي</span>
        </summary>
        <div className="mt-4">
          <AppearanceControlPanel />
        </div>
      </details>

      <section className="rased-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">التشغيل الحالي</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">المستخدمون + التدقيق + الفرق + أعلام المزايا</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void refreshData()} className="rased-action-secondary" data-testid="settings-refresh">{busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}<span>تحديث</span></button>
            <button type="button" onClick={() => void handleExportAudit()} className="rased-action-accent" data-testid="settings-export-audit">{busy === "export-audit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}<span>تصدير التدقيق</span></button>
          </div>
        </div>
        {statusMessage && <div className="rased-status-success mt-4">{statusMessage}</div>}
        {errorMessage && <div className="rased-status-error mt-4">{errorMessage}</div>}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rased-panel">
            <div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-emerald-600" /><h2 className="text-base font-bold text-gray-900 dark:text-white">المستخدمون</h2></div>
            {loading ? (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-300 px-4 py-12 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400"><Loader2 className="ml-2 h-4 w-4 animate-spin" /><span>جار تحميل المستخدمين...</span></div>
            ) : (
              <div className="space-y-3">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-600 dark:bg-gray-700/40" data-testid={`settings-user-${user.id}`}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{user.name || user.email}</p>
                      <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{user.role} • {user.status} • {formatDate(user.updatedAt)}</p>
                    </div>
                    <button type="button" onClick={() => void inspectUser(user.id)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800" data-testid={`settings-open-user-${user.id}`}>{busy === `user-${user.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}<span>افتح الملف</span></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rased-panel">
            <div className="mb-4 flex items-center gap-2"><UsersRound className="h-5 w-5 text-indigo-600" /><h2 className="text-base font-bold text-gray-900 dark:text-white">الفرق والمجموعات</h2></div>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="اسم الفريق" className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="settings-team-name" />
              <input value={teamDescription} onChange={(event) => setTeamDescription(event.target.value)} placeholder="وصف الفريق" className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="settings-team-description" />
              <button type="button" onClick={() => void handleCreateTeam()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700" data-testid="settings-create-team">{busy === "create-team" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UsersRound className="h-4 w-4" />}<span>إنشاء</span></button>
            </div>
            <div className="mt-4 space-y-3">
              {teams.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">لا توجد فرق محفوظة حاليًا.</div> : teams.map((team) => (
                <div key={team.id} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-600 dark:bg-gray-700/40" data-testid={`settings-team-${team.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{team.name}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{team.description || "بدون وصف"} • {formatDate(team.createdAt)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void openTeam(team.id)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800" data-testid={`settings-open-team-${team.id}`}>{busy === `team-${team.id}` ? "..." : "الأعضاء"}</button>
                      <button type="button" onClick={() => void addCurrentUserToTeam(team.id)} disabled={!selectedUser} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-900/40 dark:bg-indigo-950/20 dark:text-indigo-200" data-testid={`settings-team-add-user-${team.id}`}>{busy === `team-add-${team.id}` ? "..." : "أضف المستخدم المفتوح"}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rased-panel">
            <div className="mb-4 flex items-center gap-2"><Flag className="h-5 w-5 text-amber-600" /><h2 className="text-base font-bold text-gray-900 dark:text-white">التحكم الدقيق بالمزايا</h2></div>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <input value={flagKey} onChange={(event) => setFlagKey(event.target.value)} placeholder="مفتاح العلم" className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-amber-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="settings-flag-key" />
              <input value={flagDescription} onChange={(event) => setFlagDescription(event.target.value)} placeholder="وصف العلم" className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-amber-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="settings-flag-description" />
              <button type="button" onClick={() => void handleCreateFlag()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600" data-testid="settings-create-flag">{busy === "create-flag" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}<span>إنشاء</span></button>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={flagDefaultValue} onChange={(event) => setFlagDefaultValue(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500" data-testid="settings-flag-default" />
              <span>القيمة الافتراضية مفعلة</span>
            </label>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              المستخدم المحدد للتحكم الدقيق: {selectedUser ? selectedUser.name || selectedUser.email : "لا يوجد مستخدم محدد بعد"}
            </p>
            <div className="mt-4 space-y-3">
              {flags.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">لا توجد أعلام مفعلة حاليًا.</div> : flags.map((flag) => (
                <div key={flag.id} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-600 dark:bg-gray-700/40" data-testid={`settings-flag-${flag.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{flag.key}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{flag.description || "بدون وصف"} • افتراضي: {flag.defaultValue ? "نعم" : "لا"} • الحالة: {flag.enabled ? "مفعل" : "موقوف"}</p>
                      {selectedUser && evaluations[flag.id] !== undefined && (
                        <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">نتيجة المستخدم المفتوح: {evaluations[flag.id] ? "مفعلة" : "معطلة"}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void toggleFlag(flag, { enabled: !flag.enabled })} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800" data-testid={`settings-toggle-flag-${flag.id}`}>{busy === `flag-${flag.id}` ? "..." : flag.enabled ? "إيقاف" : "تفعيل"}</button>
                      <button type="button" onClick={() => void toggleFlag(flag, { defaultValue: !flag.defaultValue })} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200" data-testid={`settings-default-flag-${flag.id}`}>{busy === `flag-${flag.id}` ? "..." : "اعكس الافتراضي"}</button>
                      <button type="button" onClick={() => void disableFlagForUser(flag)} disabled={!selectedUser} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200" data-testid={`settings-disable-user-flag-${flag.id}`}>{busy === `flag-rule-${flag.id}` ? "..." : "تعطيل للمستخدم المفتوح"}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <details className="rased-details" open>
            <summary className="rased-summary mb-4">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-cyan-600" />
                <h2 className="text-base font-bold text-gray-900 dark:text-white">مركز راصد الإداري</h2>
              </div>
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-bold text-cyan-700 dark:border-cyan-900/40 dark:bg-cyan-950/20 dark:text-cyan-200">تشغيلي</span>
            </summary>
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 dark:border-cyan-900/40 dark:bg-cyan-950/20">
              <p className="text-sm font-semibold text-cyan-900 dark:text-cyan-100">المتوفر فعليًا الآن</p>
              <p className="mt-2 text-sm leading-7 text-cyan-800 dark:text-cyan-200">
                إنشاء قواعد معرفة حقيقية، واستيراد ملفات إليها، والاستعلام عنها، وإنشاء قوالب سلوك تشغيلية لراصد، ثم اختبارها وإصدار نسخ جديدة منها.
              </p>
            </div>
            <div className="mt-4 grid gap-4">
              <div className="rounded-xl border border-cyan-100 bg-white px-4 py-4 dark:border-cyan-900/30 dark:bg-gray-900">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">قواعد المعرفة</p>
                <div className="mt-3 grid gap-3">
                  <input value={knowledgeBaseName} onChange={(event) => setKnowledgeBaseName(event.target.value)} placeholder="اسم قاعدة المعرفة" className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-cyan-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="settings-kb-name" />
                  <input value={knowledgeBaseDescription} onChange={(event) => setKnowledgeBaseDescription(event.target.value)} placeholder="وصف قاعدة المعرفة" className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-cyan-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="settings-kb-description" />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void handleCreateKnowledgeBase()} className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700" data-testid="settings-create-kb">
                      {busy === "create-kb" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
                      <span>إنشاء قاعدة معرفة</span>
                    </button>
                    <select value={selectedKnowledgeBaseId} onChange={(event) => setSelectedKnowledgeBaseId(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-cyan-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="settings-select-kb">
                      <option value="">اختر قاعدة معرفة</option>
                      {knowledgeBases.map((kb) => (
                        <option key={kb.id} value={kb.id}>{kb.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <label className="flex items-center gap-2 rounded-lg border border-dashed border-cyan-200 px-3 py-2 text-sm text-cyan-800 dark:border-cyan-900/40 dark:text-cyan-200">
                      <FileUp className="h-4 w-4" />
                      <span className="truncate">{knowledgeUploadFile?.name || "اختر ملفًا معرفيًا للاستيراد"}</span>
                      <input type="file" className="hidden" accept=".txt,.md,.pdf,.docx,.csv,.json,.xml,.html" onChange={(event) => setKnowledgeUploadFile(event.target.files?.[0] || null)} data-testid="settings-kb-file" />
                    </label>
                    <button type="button" onClick={() => void handleIngestKnowledge()} className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-900/40 dark:bg-cyan-950/20 dark:text-cyan-200" data-testid="settings-ingest-kb">
                      {busy === "ingest-kb" ? "..." : "استيراد الملف"}
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <input value={knowledgeQuestion} onChange={(event) => setKnowledgeQuestion(event.target.value)} placeholder="اسأل قاعدة المعرفة" className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-cyan-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="settings-kb-question" />
                    <button type="button" onClick={() => void handleQueryKnowledge()} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800" data-testid="settings-query-kb">
                      {busy === "query-kb" ? "..." : "استعلام"}
                    </button>
                  </div>
                  {knowledgeQueryResult && (
                    <div className="rounded-xl border border-cyan-100 bg-cyan-50/70 px-4 py-3 dark:border-cyan-900/40 dark:bg-cyan-950/20" data-testid="settings-kb-result">
                      <p className="text-sm font-semibold text-cyan-900 dark:text-cyan-100">نتيجة الاستعلام</p>
                      <p className="mt-2 text-sm leading-7 text-cyan-800 dark:text-cyan-200">{knowledgeQueryResult.answer}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {knowledgeQueryResult.sources.map((source, index) => (
                          <span key={`${source.filename}-${index}`} className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-[11px] font-semibold text-cyan-700 dark:border-cyan-900/40 dark:bg-gray-900 dark:text-cyan-200">
                            {source.filename} • {source.score.toFixed(2)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    {knowledgeBases.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">لا توجد قواعد معرفة محفوظة بعد.</div> : knowledgeBases.map((kb) => (
                      <div key={kb.id} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-600 dark:bg-gray-700/40" data-testid={`settings-kb-${kb.id}`}>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{kb.name}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{kb.description || "بدون وصف"} • مستندات {kb.documentCount} • مقاطع {kb.chunkCount}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-cyan-100 bg-white px-4 py-4 dark:border-cyan-900/30 dark:bg-gray-900">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">قوالب السلوك وسير العمل</p>
                <div className="mt-3 grid gap-3">
                  <input value={promptName} onChange={(event) => setPromptName(event.target.value)} placeholder="اسم القالب" className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-cyan-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="settings-prompt-name" />
                  <textarea value={promptTemplate} onChange={(event) => setPromptTemplate(event.target.value)} rows={4} placeholder="قالب سلوك راصد" className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-cyan-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="settings-prompt-template" />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void handleCreatePrompt()} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800" data-testid="settings-create-prompt">
                      {busy === "create-prompt" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      <span>إنشاء قالب</span>
                    </button>
                    <select value={selectedPromptId} onChange={(event) => setSelectedPromptId(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-cyan-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="settings-select-prompt">
                      <option value="">اختر قالبًا</option>
                      {promptTemplates.map((prompt) => (
                        <option key={prompt.id} value={prompt.id}>{prompt.name}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => void handleVersionPrompt()} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800" data-testid="settings-version-prompt">
                      {busy === "version-prompt" ? "..." : "إصدار جديد"}
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <input value={promptVariableValue} onChange={(event) => setPromptVariableValue(event.target.value)} placeholder="قيمة المتغير topic" className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-cyan-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="settings-prompt-topic" />
                    <button type="button" onClick={() => void handleTestPrompt()} className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-900/40 dark:bg-cyan-950/20 dark:text-cyan-200" data-testid="settings-test-prompt">
                      {busy === "test-prompt" ? "..." : "اختبر القالب"}
                    </button>
                  </div>
                  {promptTestResult && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-600 dark:bg-gray-800" data-testid="settings-prompt-result">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">نتيجة الاختبار</p>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">الزمن {promptTestResult.latencyMs} ms • الرموز {promptTestResult.tokensUsed}</p>
                      <p className="mt-2 text-sm leading-7 text-gray-700 dark:text-gray-200">{promptTestResult.response}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    {promptTemplates.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">لا توجد قوالب محفوظة بعد.</div> : promptTemplates.map((prompt) => (
                      <div key={prompt.id} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-600 dark:bg-gray-700/40" data-testid={`settings-prompt-${prompt.id}`}>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{prompt.name}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{prompt.category} • الإصدار {prompt.version} • الاستخدام {prompt.usageCount}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {blockedAdminCapabilities.map((capability) => (
                <div key={capability.title} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">{capability.title}</p>
                      <p className="mt-1 text-xs leading-6 text-amber-800 dark:text-amber-200">{capability.reason}</p>
                      <p className="mt-2 text-[11px] font-mono text-amber-700 dark:text-amber-300">{capability.route}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>

          <details className="rased-details">
            <summary className="rased-summary mb-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-slate-700 dark:text-slate-200" />
                <h2 className="text-base font-bold text-gray-900 dark:text-white">التدقيق والنشاط</h2>
              </div>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-bold text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">{auditLogs.length}</span>
            </summary>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
              <input value={auditActionFilter} onChange={(event) => setAuditActionFilter(event.target.value)} placeholder="فلترة حسب الإجراء" className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-slate-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="settings-audit-action-filter" />
              <input value={auditResourceFilter} onChange={(event) => setAuditResourceFilter(event.target.value)} placeholder="فلترة حسب المورد" className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-slate-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="settings-audit-resource-filter" />
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">اضغط تحديث لتطبيق الفلاتر على القراءة الحقيقية من سجل الحوكمة.</p>
            <div className="mt-4 space-y-3">
              {auditLogs.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">لا توجد سجلات مطابقة.</div> : auditLogs.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-600 dark:bg-gray-700/40" data-testid={`settings-audit-${entry.id}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{entry.action}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{entry.userName || entry.userId} • {entry.resource || "غير محدد"} • {formatDate(entry.createdAt)}</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-gray-500 shadow-sm dark:bg-gray-800 dark:text-gray-300">{entry.resourceId || "بدون معرف"}</span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      </section>

      <Modal
        isOpen={isUserModalOpen}
        onClose={() => {
          setIsUserModalOpen(false);
        }}
        titleAr={selectedUser ? `ملف المستخدم: ${selectedUser.name || selectedUser.email}` : "ملف المستخدم"}
        size="xl"
      >
        {selectedUser && (
          <div className="space-y-6" dir="rtl">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/40">
                <p className="text-xs text-gray-500 dark:text-gray-400">البيانات</p>
                <p className="mt-2 text-lg font-black text-gray-900 dark:text-white">{selectedUser.name || selectedUser.email}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{selectedUser.email}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/40">
                <p className="text-xs text-gray-500 dark:text-gray-400">المشاريع</p>
                <p className="mt-2 text-lg font-black text-gray-900 dark:text-white">{selectedUsage?.usage.projectsTotal ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/40">
                <p className="text-xs text-gray-500 dark:text-gray-400">سجل النشاط</p>
                <p className="mt-2 text-lg font-black text-gray-900 dark:text-white">{selectedUsage?.usage.auditEventsTotal ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/40">
                <p className="text-xs text-gray-500 dark:text-gray-400">الملفات المتتبعة</p>
                <p className="mt-2 text-lg font-black text-gray-900 dark:text-white">{selectedUsage?.availability.filesTracked ? String(selectedUsage?.usage.filesTracked ?? 0) : "غير مدعوم"}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                <span>الدور</span>
                <select value={userRole} onChange={(event) => setUserRole(event.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="settings-user-role">
                  <option value="admin">admin</option>
                  <option value="manager">manager</option>
                  <option value="editor">editor</option>
                  <option value="viewer">viewer</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                <span>الحالة</span>
                <select value={userStatus} onChange={(event) => setUserStatus(event.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" data-testid="settings-user-status">
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-600 dark:bg-gray-900">
                <p className="text-xs text-gray-500 dark:text-gray-400">مجموعات البيانات</p>
                <p className="mt-2 text-lg font-black text-gray-900 dark:text-white">{selectedUsage?.usage.datasetsCreated ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-600 dark:bg-gray-900">
                <p className="text-xs text-gray-500 dark:text-gray-400">لوحات المؤشرات</p>
                <p className="mt-2 text-lg font-black text-gray-900 dark:text-white">{selectedUsage?.usage.dashboardsCreated ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-600 dark:bg-gray-900">
                <p className="text-xs text-gray-500 dark:text-gray-400">التقارير</p>
                <p className="mt-2 text-lg font-black text-gray-900 dark:text-white">{selectedUsage?.usage.reportsCreated ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-600 dark:bg-gray-900">
                <p className="text-xs text-gray-500 dark:text-gray-400">العروض</p>
                <p className="mt-2 text-lg font-black text-gray-900 dark:text-white">{selectedUsage?.usage.presentationsCreated ?? 0}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/40">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">آخر النشاط</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">مصدره `GET /api/v1/governance/users/:id/usage` و`GET /api/v1/governance/audit/user/:id`</p>
                </div>
                <button type="button" onClick={() => void saveUser()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700" data-testid="settings-save-user">{busy === "save-user" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}<span>حفظ فعلي</span></button>
              </div>
              <div className="mt-4 space-y-3">
                {selectedActivity.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">لا توجد أحداث حديثة لهذا المستخدم.</p> : selectedActivity.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-600 dark:bg-gray-900">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{entry.action}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{entry.resource || "مورد غير محدد"} • {formatDate(entry.createdAt)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isTeamModalOpen}
        onClose={() => setIsTeamModalOpen(false)}
        titleAr={selectedTeam ? `أعضاء الفريق: ${selectedTeam.teamName}` : "أعضاء الفريق"}
        size="lg"
      >
        {selectedTeam && (
          <div className="space-y-4" dir="rtl">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/40">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">إجمالي الأعضاء: {selectedTeam.totalMembers}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">مصدره `GET /api/v1/governance/teamwork/:id/members`</p>
            </div>
            {selectedTeam.members.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">لا يوجد أعضاء داخل هذا الفريق حتى الآن.</p> : selectedTeam.members.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-600 dark:bg-gray-900">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{member.name || member.email}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{member.email} • دور الفريق: {member.teamRole || "member"} • انضم في {formatDate(member.joinedAt)}</p>
                </div>
                <button type="button" onClick={() => void handleRemoveMember(selectedTeam.teamId, member.userId)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200" data-testid={`settings-remove-member-${member.userId}`}>{busy === `team-remove-${selectedTeam.teamId}-${member.userId}` ? "..." : "إزالة"}</button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
