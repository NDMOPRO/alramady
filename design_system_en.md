# Design System

## Design Principles
- Arabic-first by default.
- RTL is a platform-level requirement across the approved surfaces.
- Each surface has a distinct visual identity while still inheriting shared platform appearance and theme settings.
- Visual design is tied to live operational behavior rather than static decorative mockups.

## Theme and Mode System
- The platform supports light and dark modes.
- Theme selection and appearance controls are backed by dashboard appearance/theme APIs.
- Reusable themes can also be persisted in Library and then applied in presentation-related reuse flows.
- The theme engine supports:
- theme creation
- dark/light variants
- RTL variants
- preview image generation
- CSS export
- brand-kit application

## Brand and Appearance Controls
- Current appearance controls support platform identity fields such as platform name, active theme, and other visual identity settings exposed by the appearance API.
- These are persisted through backend APIs rather than browser-only state.

## Surface-Level Visual Language
- Home uses a conversation-style smart-entry layout with drag-and-drop, dynamic action cards, and restrained motion.
- Data, Analysis, Reports, Presentations, Library, and Settings each use a tailored visual hierarchy while preserving consistent spacing, card treatment, and interaction states.
- The embedded assistant is intentionally small and contextual so it does not overwhelm the core workflow.

## Arabic Typography and RTL
- Layouts are written with RTL-aware containers and interaction alignment.
- Arabic labels, prompts, and assistant messaging are the default experience.
- English is retained only for unavoidable technical identifiers, format codes, or API-oriented labels.

## Dashboard Visual System
- The current dashboard/theme subsystem includes a large reusable element/style catalog in the theme engine path and is referenced by the approved surfaces where relevant.
- Analysis currently surfaces the active theme metadata and visual catalog count without reducing the experience to static theme galleries.

## Motion
- Motion is used conservatively for production safety: hover elevation, border/gradient state changes, execution indicators, and assistant/action feedback.
- The current implementation avoids heavy animation systems that would compromise clarity or runtime stability.

## Current Boundary
- Strict visual replication accuracy should not be conflated with the design system. Replication fidelity is a separate operational stack with known remaining blockers.
