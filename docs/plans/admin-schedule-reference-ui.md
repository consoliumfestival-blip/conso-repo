# Admin Schedule Reference UI

## Goal

Update the Admin Schedules page to the supplied compact reference-table style. This is a presentation change. Preserve schedule behavior, data, authorization, filters, ordering, actions, and API/database contracts.

## UI requirements

- Desktop and tablet use compact, low-height table rows with fine dividers and a neutral surface. Phone keeps its current card composition.
- Table columns show competition name, venue/stage and category, date/time, status, and actions. Do not display item codes or other code values.
- Status is plain text with no badge/background: show the existing lifecycle label, or `Postponed` when the existing manual-postponed state takes precedence. Show at most one additional existing workflow label: check-in complete/pending, based on the current workflow summary. Keep the existing 30-second refresh and mutation-driven refresh behavior.
- Keep the public visibility control separate from lifecycle status. Preserve all existing row actions and handlers, including Check-in, Codes, Marks, Results, sharing, edit, delete, and lifecycle/postponed controls. The Codes action remains a workflow action; code values are not displayed in the table.
- Show postponed rows first in a clearly labeled, expandable/collapsible section. Start expanded so postponed rows remain visible; preserve the existing backend order within each group. The section reflects postponed rows on the current server-paginated page; existing pagination reaches the rest. The current backend ordering already puts eligible manual-postponed rows first, so do not add time sorting, an RPC, or a migration.
- Keep search and all existing filters immediately above the table. Replace large venue/event statistic cards with compact text counts. Keep Export, Manage venues, Import JSON, Bulk Create, and Add New accessible.
- Preserve loading, error, empty, filtered-empty, and pagination states. Avoid page-level horizontal overflow; action controls may wrap in narrower tablet layouts.

## Scope and invariants

- Edit the Admin Schedules page and this plan only.
- No schedule lifecycle, manual-postponed, visibility, permission, filter, export, or mutation semantics change. Postponed grouping is presentation-only and follows the existing backend order.
- No API, database, schema, migration, or realtime changes.
- Do not commit, push, or deploy in this task.

## Validation

- Inspect the focused diff and run `git diff --check`.
- If available without installing dependencies, run the existing focused lint/type-check for the changed source.
- Browser/device runtime checks are not represented as completed unless actually performed.
