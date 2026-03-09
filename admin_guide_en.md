# Administration Guide

## Administrative Scope
- Operational administration is centered in `/settings`.
- The Settings surface is backed by `governance-service`, `ai-service`, and dashboard appearance/theme APIs.
- The page is intended for real operational control and verification, not placeholder administration.

## User Administration
- List users through the governance API.
- Open a user profile and load:
- user details
- usage summary
- recent activity
- Update live user fields that are backed by the service, including role, status, locale, and timezone.

## Team Administration
- List teams.
- Create a new team.
- Load team membership details.
- Add the currently opened user to a team.
- Remove members from a team.

## Feature Control
- Create feature flags.
- Update flag state and default values.
- Evaluate a flag for a specific user.
- Add per-user rules, including disabling a feature for the selected user when supported by the current flag/rule model.

## Audit and Activity
- Browse audit records with filters for action, resource, user, and date.
- Export the audit log as CSV through `GET /api/v1/governance/audit/export`.
- Use user-specific activity endpoints to inspect recent user actions.

## Appearance and Identity
- The appearance control panel uses real appearance/theme APIs rather than browser-only state.
- Current appearance control includes platform-level visual identity fields and active theme assignment through dashboard appearance services.

## Rasid Admin Center
- Create knowledge bases in `ai-service`.
- Ingest real files into a selected knowledge base.
- Query a knowledge base and receive an answer plus scored source references.
- Create prompt templates for workflow/assistant behavior.
- Version prompt templates.
- Test prompt templates using the live AI stack and inspect latency, token usage, rendered prompt, and response content.

## Not Available in the Current Runtime
- Model registry and production deployment flows under `/api/training/registry/*` and `/api/training/deploy*` are blocked by missing backing schema/runtime support in the current project state.
- Platform-wide bulk import/export is not available as a complete administrative capability.
- Documentation in this suite does not describe those blocked flows as operational features.

## Administrative Good Practice
- Use audit export before and after sensitive administrative changes.
- Prefer feature flags for controlled rollout over code-level toggles.
- Treat knowledge-base and prompt-template changes as operational content changes and verify them with a query/test run after updates.
