# Code Capability Reuse Audit

## 1. Active used capabilities
- ACTIVE_AND_USED
  file/module/service: `frontend/app/(dashboard)/home/page.tsx`, `frontend/app/(dashboard)/data/page.tsx`, `frontend/app/(dashboard)/analysis/page.tsx`, `frontend/app/(dashboard)/reports/page.tsx`, `frontend/app/(dashboard)/presentations/page.tsx`, `frontend/app/(dashboard)/library/page.tsx`, `frontend/app/(dashboard)/settings/page.tsx`
  what it does: implements the approved runtime surfaces and binds them to the real platform flows.
  overlap with current platform goals: direct core overlap.
  future reuse: continue as primary runtime path.
  merge into approved surfaces: already merged.
  isolate or remove: no.
  recommended action: keep as the only primary user-facing path.
- ACTIVE_AND_USED
  file/module/service: `frontend/components/layout/Sidebar.tsx`, `frontend/lib/navigation/routes.ts`, `frontend/lib/navigation/routes.config.cjs`
  what it does: defines and renders the approved navigation shell.
  overlap with current platform goals: direct.
  future reuse: core shell.
  merge into approved surfaces: already merged.
  isolate or remove: no.
  recommended action: keep, but continue preventing extra routes from appearing as primary navigation items.
- ACTIVE_AND_USED
  file/module/service: `frontend/components/assistant/EmbeddedRasidAssistant.tsx`
  what it does: embedded assistant entry inside approved surfaces.
  overlap with current platform goals: direct.
  future reuse: high.
  merge into approved surfaces: already merged.
  isolate or remove: no.
  recommended action: keep as the only approved assistant entry point.
- ACTIVE_AND_USED
  file/module/service: `frontend/components/settings/AppearanceControlPanel.tsx`, `frontend/components/ui/DataTable.tsx`, `frontend/components/ui/Toast.tsx`
  what it does: supports approved settings appearance flow, data inspection flow, and runtime feedback.
  overlap with current platform goals: direct.
  future reuse: high.
  merge into approved surfaces: already merged.
  isolate or remove: no.
  recommended action: keep.
- ACTIVE_AND_USED
  file/module/service: `services/data-service/src/routes/sources.routes.ts`, `services/data-service/src/routes/import.routes.ts`, `services/dashboard-service/src/routes/dashboard.routes.ts`, `services/reporting-service/src/routes/reporting.routes.ts`, `services/presentation-service/src/routes/presentation.routes.ts`, `services/library-service/src/routes/library.routes.ts`, `services/governance-service/src/routes/governance.routes.ts`, `services/governance-service/src/routes/feature-flags.ts`, `services/governance-service/src/routes/teamwork.ts`, `services/ai-service/src/routes/ai.routes.ts`
  what it does: real API and engine path for the approved runtime surfaces.
  overlap with current platform goals: direct.
  future reuse: core platform backbone.
  merge into approved surfaces: already merged.
  isolate or remove: no.
  recommended action: keep as authoritative runtime services.

## 2. Implemented but unbound capabilities
- IMPLEMENTED_BUT_UNBOUND
  file/module/service: `frontend/app/(dashboard)/templates/page.tsx`, `frontend/lib/api/template.ts`, `services/template-service/src/routes/template.routes.ts`
  what it does: real template gallery, CRUD, rating, duplication, rendering, and preview capabilities.
  overlap with current platform goals: high overlap with reports, presentations, dashboards, and reuse.
  future reuse: strong.
  should be merged into current approved surfaces: yes, through Library, Presentations, Reports, and Analysis rather than a separate top-level route.
  isolate or remove: no.
  recommended action: bind template selection and reuse into approved surfaces and retire the standalone route from primary runtime.
- IMPLEMENTED_BUT_UNBOUND
  file/module/service: `services/template-service/src/routes/templates-themes.ts`
  what it does: theme and template route family separate from the main template gallery path.
  overlap with current platform goals: high overlap with approved appearance and reusable design goals.
  future reuse: high.
  should be merged into current approved surfaces: yes, but only after consolidation with existing Library and Settings appearance flows.
  isolate or remove: no.
  recommended action: consolidate into one reusable theme/template contract before exposure.
- IMPLEMENTED_BUT_UNBOUND
  file/module/service: `services/governance-service/src/routes/permissions-security.ts`, `services/governance-service/src/routes/product-levels.ts`, `services/governance-service/src/routes/messaging.routes.ts`, `services/governance-service/src/routes/versions.ts`, `services/governance-service/src/routes/advanced-compare.ts`, `services/governance-service/src/routes/audit-replay.ts`, `services/governance-service/src/routes/engine-integration.ts`, `services/governance-service/src/routes/one-click-ops.ts`
  what it does: exposes additional governance, policy, messaging, product, compare, replay, and operational control capabilities beyond the current Settings runtime.
  overlap with current platform goals: moderate to high.
  future reuse: high for enterprise administration.
  should be merged into current approved surfaces: selectively yes, inside Settings only after real UX binding and permissions review.
  isolate or remove: no.
  recommended action: keep unbound until each capability is connected to a real approved Settings workflow.
- IMPLEMENTED_BUT_UNBOUND
  file/module/service: `frontend/components/ui/Tabs.tsx`
  what it does: generic tabs component with approved design tokens.
  overlap with current platform goals: low functional overlap, moderate UI reuse value.
  future reuse: moderate.
  should be merged into current approved surfaces: only if a surface needs this exact interaction.
  isolate or remove: no immediate need.
  recommended action: either reuse in approved pages or remove once confirmed unused across runtime.
- IMPLEMENTED_BUT_UNBOUND
  file/module/service: `frontend/app/(dashboard)/localization/page.tsx`, `frontend/lib/api/localization.ts`, `services/localization-service/src/routes/localization.routes.ts`, `services/localization-service/src/routes/language-intelligence.ts`, `services/localization-service/src/routes/arabic-typography.ts`, `services/localization-service/src/routes/data-localization.ts`, `services/localization-service/src/routes/rtl-layout.ts`, `services/localization-service/src/routes/quality-gate.ts`, `services/localization-service/src/routes/quality-metrics.routes.ts`
  what it does: real Arabic localization, glossary, document translation, platform content localization, RTL processing, and linguistic QA.
  overlap with current platform goals: very high.
  future reuse: very high.
  should be merged into current approved surfaces: yes, as contextual actions in Home, Reports, Presentations, Analysis, and Settings rather than as a separate top-level route.
  isolate or remove: no.
  recommended action: keep service stack, fold the standalone page behavior into approved surface workflows.

## 3. Reusable future capabilities
- REUSABLE_FUTURE_CAPABILITY
  file/module/service: `frontend/app/(dashboard)/convert/page.tsx`, `frontend/lib/api/conversion.ts`, `services/conversion-service/src/routes/conversion.routes.ts`, `services/conversion-service/src/routes/converter.routes.ts`, `services/conversion-service/src/routes/core.routes.ts`, `services/conversion-service/src/routes/universal.routes.ts`, `services/conversion-service/src/routes/matrix.routes.ts`
  what it does: real document and format conversion, supported-format discovery, history, download, and binary conversion flows.
  overlap with current platform goals: high for Home, Library, Reports, and Presentations.
  future reuse: very high.
  should be merged into current approved surfaces: yes, as contextual conversion actions and Library/Home actions.
  isolate or remove: no.
  recommended action: keep the backend and move exposure to contextual approved-surface actions instead of a dedicated route.
- REUSABLE_FUTURE_CAPABILITY
  file/module/service: `services/conversion-service/src/routes/document-extraction.routes.ts`, `services/conversion-service/src/routes/social-media.routes.ts`, `services/conversion-service/src/routes/udr.routes.ts`
  what it does: extends conversion service into extraction and specialized route families.
  overlap with current platform goals: moderate to high.
  future reuse: high.
  should be merged into current approved surfaces: selectively, once exact business path is defined.
  isolate or remove: no.
  recommended action: keep as future capability inventory; do not surface until mapped to approved runtime actions.
- REUSABLE_FUTURE_CAPABILITY
  file/module/service: `services/excel-service/src/routes/excel.routes.ts`
  what it does: full workbook engine with formulas, ranges, formatting, charts, pivoting, comparison, protection, and sheet operations.
  overlap with current platform goals: high for Data, Analysis, and Library reuse.
  future reuse: very high.
  should be merged into current approved surfaces: yes, through Data and Home contextual spreadsheet actions.
  isolate or remove: no.
  recommended action: keep as reusable engine and surface only approved subsets contextually.
- REUSABLE_FUTURE_CAPABILITY
  file/module/service: `services/infographic-service/src/routes/infographic.routes.ts`
  what it does: infographic generation, render, export, AI generation from data or text, and section builders.
  overlap with current platform goals: moderate to high for Reports and Presentations.
  future reuse: high.
  should be merged into current approved surfaces: yes, if exposed through Reports or Presentations and not as a separate top-level page.
  isolate or remove: no.
  recommended action: keep as a future creative-output engine.

## 4. Legacy conflicting capabilities
- LEGACY_CONFLICTING
  file/module/service: `frontend/lib/stores/source-library-store.ts`
  what it does: local browser store for cross-page source reuse with persisted local state and fallback ID generation.
  overlap with current platform goals: conceptually overlaps with Library, but implementation conflicts with real persistence requirements.
  future reuse: low in its current form.
  should be merged into current approved surfaces: no, not in local-store form.
  isolate or remove: isolate or remove.
  recommended action: replace runtime usage with Library service backed persistence only.
- LEGACY_CONFLICTING
  file/module/service: `frontend/lib/workspaces/bootstrap-engine.ts`
  what it does: stores generated workspace drafts in `localStorage` and rehydrates local-only downstream workspaces.
  overlap with current platform goals: overlaps with generation pipelines but conflicts with approved real execution rules.
  future reuse: low in current form.
  should be merged into current approved surfaces: no.
  isolate or remove: isolate or remove.
  recommended action: retire from approved runtime and replace with persisted backend job/result contracts.
- LEGACY_CONFLICTING
  file/module/service: `frontend/components/workspaces/ArtifactQuickApplyPanel.tsx`, `frontend/components/workspaces/WorkspaceBootstrapNotice.tsx`, `frontend/components/workspaces/WorkspaceGeneratedDraftPanel.tsx`, `frontend/components/workspaces/SourceContextBanner.tsx`
  what it does: uses local bootstrap drafts, local source store, and non-approved route jumps to apply generated artifacts.
  overlap with current platform goals: overlaps conceptually with cross-surface reuse, but current path conflicts with real persistence and approved routing.
  future reuse: moderate only after redesign.
  should be merged into current approved surfaces: not as-is.
  isolate or remove: isolate from approved runtime.
  recommended action: keep only as reference for UX ideas or refactor against Library-backed persisted artifacts.
- LEGACY_CONFLICTING
  file/module/service: `frontend/app/(dashboard)/ai/page.tsx`
  what it does: writes pending prompt and source data into `localStorage` and redirects to extra AI pages instead of staying inside approved surfaces.
  overlap with current platform goals: partial overlap.
  future reuse: low as implemented.
  should be merged into current approved surfaces: no, because Home and embedded assistant already own this responsibility.
  isolate or remove: isolate.
  recommended action: keep out of approved runtime and migrate any useful intent-routing logic into Home or embedded assistant only.
- LEGACY_CONFLICTING
  file/module/service: `frontend/app/(dashboard)/dashboard/page.tsx`
  what it does: mixes real dashboard listing with local bootstrap panels, local source library state, and extra dashboard workspaces.
  overlap with current platform goals: high conceptually, but conflicts with approved Analysis runtime.
  future reuse: moderate after decomposition.
  should be merged into current approved surfaces: only selected real listing and edit affordances.
  isolate or remove: isolate current page from approved runtime.
  recommended action: keep backend dashboard engine, retire this mixed workspace page from primary use.
- LEGACY_CONFLICTING
  file/module/service: `frontend/app/(dashboard)/excel/page.tsx`
  what it does: spreadsheet-oriented workspace that depends on local source library and non-approved downstream workspaces.
  overlap with current platform goals: moderate.
  future reuse: moderate after rebinding to real persistence.
  should be merged into current approved surfaces: only as contextual spreadsheet actions inside Data/Home.
  isolate or remove: isolate.
  recommended action: do not expose as independent runtime path until local-only dependencies are removed.
- LEGACY_CONFLICTING
  file/module/service: `frontend/app/(dashboard)/replication/page.tsx`, `frontend/app/(dashboard)/replicate/page.tsx`
  what it does: promotes strict replication through extra routes and local library/bootstrap behavior.
  overlap with current platform goals: high.
  future reuse: high only after hardening around the real replication backend.
  should be merged into current approved surfaces: yes, contextually via Home and approved outputs, not as separate route families.
  isolate or remove: isolate current pages.
  recommended action: keep the backend capability path, isolate the legacy page shell.
- LEGACY_CONFLICTING
  file/module/service: `frontend/app/(dashboard)/observer/page.tsx`
  what it does: command center page built around extra observer API routes plus `useSourceLibraryStore` and local pending prompt/source flow.
  overlap with current platform goals: partial overlap with assistant and Home.
  future reuse: low as currently wired.
  should be merged into current approved surfaces: no, functionality should live in embedded assistant or Home.
  isolate or remove: isolate.
  recommended action: retire from approved runtime and salvage only intent-detection ideas if needed.
- LEGACY_CONFLICTING
  file/module/service: `frontend/app/(dashboard)/automation/page.tsx`
  what it does: standalone automation UI calling `/automation/rules` through governance API without approved surface binding.
  overlap with current platform goals: moderate.
  future reuse: moderate.
  should be merged into current approved surfaces: only if it becomes a real Settings capability with verified governance support and Arabic-first UX parity.
  isolate or remove: isolate until then.
  recommended action: keep hidden from approved runtime until fully bound and verified.
- LEGACY_CONFLICTING
  file/module/service: `frontend/lib/navigation/routes.config.cjs`
  what it does: still maps many extra route prefixes such as `/ai`, `/dashboard`, `/observer`, `/replicate`, `/replication`, `/literal-match`, `/automation`, `/convert`, `/excel`, `/infographics`, `/templates`, and `/admin` under approved navigation buckets.
  overlap with current platform goals: low in current form.
  future reuse: low as prefix mapping.
  should be merged into current approved surfaces: no.
  isolate or remove: yes, progressively tighten to approved routes only.
  recommended action: reduce prefix-based masking so non-approved route families cannot appear as implicit runtime continuations.

## 5. Obsolete removable items
- OBSOLETE_SAFE_TO_REMOVE
  file/module/service: `frontend/app/api/replication/artifact/[id]/download`, `frontend/app/api/replication/artifact/[id]`, `frontend/app/api/replication/intake`, `frontend/app/api/replication/literal-match`, `frontend/app/api/replication/session/[id]/dispatch`, `frontend/app/api/replication/session/[id]`
  what it does: currently empty route directory skeletons with no active route handlers.
  overlap with current platform goals: none in present state.
  future reuse: none unless rebuilt.
  should be merged into current approved surfaces: no.
  isolate or remove: remove safely.
  recommended action: delete empty shells to reduce false expectations and route confusion.
- OBSOLETE_SAFE_TO_REMOVE
  file/module/service: `frontend/components/ui/Tabs.tsx`
  what it does: generic UI helper with no confirmed active binding in the approved runtime path.
  overlap with current platform goals: low.
  future reuse: moderate only if later adopted.
  should be merged into current approved surfaces: only if actually imported.
  isolate or remove: safe to remove after one final import scan.
  recommended action: remove if confirmed unreferenced in the build graph.

## 6. Obsolete items needing isolation
- OBSOLETE_NEEDS_ISOLATION
  file/module/service: `frontend/components/workspaces/RasidCommandCenter.tsx`
  what it does: standalone chat-like workspace using local source library state, local chat state, local actions, local output staging, and replication-side fetches outside the approved assistant path.
  overlap with current platform goals: partial.
  future reuse: low in current form.
  should be merged into current approved surfaces: no.
  isolate or remove: isolate now.
  recommended action: keep out of runtime and do not mount it inside approved pages.
- OBSOLETE_NEEDS_ISOLATION
  file/module/service: `frontend/components/workspaces/StartFromHomeNotice.tsx`
  what it does: cross-workspace notice for starting from Home, tied to the older workspace model.
  overlap with current platform goals: low.
  future reuse: low.
  should be merged into current approved surfaces: no.
  isolate or remove: isolate or remove.
  recommended action: remove if not actively imported; otherwise isolate from approved pages.
- OBSOLETE_NEEDS_ISOLATION
  file/module/service: `frontend/app/(dashboard)/dashboard/advanced-mode/legacy.tsx`, `frontend/app/(dashboard)/dashboard/drag-elements/legacy.tsx`, `frontend/app/(dashboard)/dashboard/easy-mode/legacy.tsx`, `frontend/app/(dashboard)/dashboard/editor/legacy.tsx`, `frontend/app/(dashboard)/dashboard/performance/legacy.tsx`, `frontend/app/(dashboard)/dashboard/post-edit/legacy.tsx`, `frontend/app/(dashboard)/dashboard/simulation/legacy.tsx`, `frontend/app/(dashboard)/dashboard/templates/legacy.tsx`, `frontend/app/(dashboard)/reports/advanced-mode/legacy.tsx`, `frontend/app/(dashboard)/reports/compare/legacy.tsx`, `frontend/app/(dashboard)/reports/easy-mode/legacy.tsx`, `frontend/app/(dashboard)/reports/templates/legacy.tsx`, `frontend/app/(dashboard)/replicate/legacy.tsx`
  what it does: preserved legacy entry files under extra workspaces.
  overlap with current platform goals: low in present state.
  future reuse: low unless mined selectively.
  should be merged into current approved surfaces: no as standalone legacy files.
  isolate or remove: isolate first, remove when import graph confirms dead status.
  recommended action: keep out of runtime resolution and schedule for deletion after final import verification.

## 7. Partial capabilities worth completing
- PARTIAL_CAPABILITY_WORTH_COMPLETING
  file/module/service: `services/replication-service/src/routes/replication.routes.ts`, `services/replication-service/src/routes/strict-replication.routes.ts`, `services/replication-service/src/routes/visual-replication.routes.ts`, `services/replication-service/src/routes/pixel-validation.routes.ts`, `services/replication-service/src/routes/generate-from-layout.routes.ts`, `services/replication-service/src/routes/advanced-capabilities.routes.ts`, `services/replication-service/src/routes/canonical-pipeline.routes.ts`, `services/replication-service/src/routes/image-matching.ts`, `services/replication-service/src/routes/dual-verify.ts`, `services/replication-service/src/routes/match-phases.ts`, `services/replication-service/src/routes/match-scope.ts`, `services/replication-service/src/routes/print-lock.ts`, `services/replication-service/src/routes/core-principle.ts`
  what it does: substantial strict replication and visual matching backend surface aimed at canonical pipelines, validation, and layout-derived generation.
  overlap with current platform goals: very high.
  future reuse: very high.
  should be merged into current approved surfaces: yes, through Home contextual actions and approved output generation only.
  isolate or remove: keep backend, isolate legacy frontend shells.
  recommended action: finish the runtime contract between Home and replication-service instead of maintaining separate replication workspaces.
- PARTIAL_CAPABILITY_WORTH_COMPLETING
  file/module/service: `services/excel-service/src/routes/excel-to-system.routes.ts`
  what it does: transforms spreadsheet inputs into dashboards, reports, datasets, KPI registries, and workflows.
  overlap with current platform goals: very high.
  future reuse: very high.
  should be merged into current approved surfaces: yes, especially Home and Data.
  isolate or remove: no.
  recommended action: complete binding into approved ingestion and generation paths.
- PARTIAL_CAPABILITY_WORTH_COMPLETING
  file/module/service: `services/infographic-service/src/routes/professional.ts`
  what it does: advanced infographic operations overlapping with the main infographic route family.
  overlap with current platform goals: moderate to high.
  future reuse: high.
  should be merged into current approved surfaces: only after route consolidation and a single business contract.
  isolate or remove: keep isolated from current runtime until unified.
  recommended action: merge overlapping infographic route families into one stable API before surfacing.
- PARTIAL_CAPABILITY_WORTH_COMPLETING
  file/module/service: `frontend/app/(dashboard)/localization/page.tsx`, `frontend/lib/api/localization.ts`, `services/localization-service/src/routes/*`
  what it does: already substantial localization capability, but still lives as a separate unapproved surface rather than a fully contextual approved capability.
  overlap with current platform goals: very high.
  future reuse: very high.
  should be merged into current approved surfaces: yes.
  isolate or remove: do not remove.
  recommended action: complete contextual activation from Home, Reports, Presentations, Analysis, and Library.
- PARTIAL_CAPABILITY_WORTH_COMPLETING
  file/module/service: `frontend/app/(dashboard)/automation/page.tsx`, `services/governance-service/src/routes/teamwork.ts`, `services/governance-service/src/routes/one-click-ops.ts`
  what it does: hints at operational automation and coordinated governance actions, but current surface binding remains incomplete and outside approved runtime.
  overlap with current platform goals: moderate.
  future reuse: moderate to high.
  should be merged into current approved surfaces: yes, only inside Settings after real end-to-end validation.
  isolate or remove: isolate current standalone page until completion.
  recommended action: finish as a governed Settings capability or remove from runtime exposure.

## 8. Recommended action for each item
- Keep the approved seven surfaces and their current backend service chain as the only authoritative runtime path.
- Fold `template-service`, `localization-service`, `conversion-service`, `excel-service`, and selected `infographic-service` capabilities into approved contextual actions instead of reviving extra top-level routes.
- Remove empty `frontend/app/api/replication/*` skeleton directories.
- Remove or permanently isolate `source-library-store`, `bootstrap-engine`, and the workspace panels that depend on them from any approved runtime path.
- Isolate or retire extra standalone pages that duplicate Home, Analysis, Reports, Presentations, Library, or Settings responsibilities: `ai`, `observer`, `automation`, `dashboard`, `excel`, `replication`, `replicate`.
- Verify the import graph for `Tabs.tsx`, `StartFromHomeNotice.tsx`, and all `legacy.tsx` files; remove confirmed dead files and isolate any file still reachable only through non-approved routes.
- Keep `replication-service` and `excel-to-system` as high-value backend assets and complete them through approved contextual flows instead of preserving legacy frontends.
- Consolidate duplicated theme/template and infographic route families before re-exposure.
- Tighten `frontend/lib/navigation/routes.config.cjs` so hidden extra route prefixes no longer masquerade as part of approved navigation groups.

## 9. Final judgment on how much hidden value exists in the current project
- The project contains high hidden value.
- The largest real reusable value sits in `localization-service`, `conversion-service`, `excel-service`, `template-service`, `replication-service`, and `infographic-service`.
- Most of the hidden value is backend-heavy and genuinely reusable.
- The largest source of waste is not missing capability; it is the presence of legacy frontend shells and local-only workspace patterns that split execution away from the approved runtime.
- The strongest future path is consolidation: reuse the real engines, retire the conflicting local/browser workspaces, and bind the hidden capabilities contextually into the approved seven surfaces only.
