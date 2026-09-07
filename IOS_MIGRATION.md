# Musee iOS Migration Plan

This document is the durable product and delivery plan for building Musee as a
production React Native + Expo iOS app. It answers three questions across coding
tasks and pull requests:

1. What is the long-term destination?
2. Which capabilities have reached a usable native baseline?
3. What should the team build next, and in what order?

This is a living milestone plan, not an implementation guide or work log. The
mobile architecture and development rules live in
[`frontend-mobile/README.md`](frontend-mobile/README.md). Detailed deferred
feature proposals live in [`BACKLOG_PLANS.md`](BACKLOG_PLANS.md), and pull
requests remain the implementation history.

## Goal

Deliver a production-ready native iOS app that covers Musee's active,
user-facing product capabilities while feeling intentionally designed for iOS.
The mature web app defines established product behavior and is the comparison
point for parity; its component tree and browser interaction model are not an
iOS implementation specification.

Completing the iOS app does not by itself retire the web app. Any decision to
deprecate the web product is separate from this migration.

## Scope

The migration includes more than React Native screens. It spans:

- native navigation, interaction, accessibility, and device integration;
- stable shared TypeScript contracts and parsers in `packages/client-core/`;
- mobile authentication, storage, networking, and image lifecycle;
- backend contracts required by both web and native clients;
- reliable persistence, recovery, caching, and error behavior;
- physical-device testing, distribution, privacy, and App Store readiness.

The target is parity with active product capabilities, not blind translation of
every web code path. Development-only screens, unreachable UI, and dormant
experiments require an explicit keep, redesign, or remove decision before they
become mobile commitments.

## Migration principles

1. **Share logic, never UI.** Web and iOS own their own components and
   navigation. Only device-agnostic TypeScript belongs in `client-core`.
2. **Use vertical slices.** Each milestone should produce a real end-to-end
   behavior that can be tested on a device.
3. **Promote stable contracts.** Interaction logic remains in its client until
   the behavior is stable and another client can genuinely reuse it.
4. **Keep the backend client-agnostic.** Prefer one JSON/SSE domain contract
   with small, explicit transport differences such as native auth headers.
5. **Persist before depending on transient UI.** Core user actions and completed
   AI responses must survive termination, token refresh, and cache eviction.
6. **Treat device behavior as product behavior.** Camera, Photos, permissions,
   backgrounding, network changes, and Keychain must be verified on an iPhone.
7. **Preserve web behavior while extracting shared logic.** Shared-core changes
   require both clients' automated checks; migration is not permission to break
   the mature client.

## Current position

Last reviewed: 2026-09-03.

The native app now has a functioning foundation and four usable product
slices:

- renewable email authentication with refresh credentials in Keychain and
  access credentials in memory;
- camera or Photos intake, cloud upload, streamed analysis, camera-roll saving,
  and retry behavior;
- artwork library and basic artwork detail;
- Sessions with persisted user/model events, streamed Markdown responses,
  retry behavior, cold-start restoration, and camera, Photos, or library
  artwork input.

The cloud thumbnail contract and shared Session prompt ownership are complete.
Session timelines render artwork cards durably, and camera, Photos, and existing
library artworks can participate in mixed artwork/text turns. The remaining
Phase 3 work is lifecycle-state vocabulary polish rather than a missing core
input or persistence path.

## Capability map

Status meanings:

- **Baseline complete** — the core path works end to end; later polish may remain.
- **Partial** — useful behavior exists, but material parity work remains.
- **Not started** — no supported native product path exists yet.
- **Decision required** — confirm the desired product behavior before porting it.

| Capability | iOS status | Migration target |
| --- | --- | --- |
| Workspace, Expo development client, shared core | Baseline complete | Maintain clean web/native boundaries and reproducible builds |
| Email sign-in, refresh, restore, sign-out | Baseline complete | Harden lifecycle and security behavior as release approaches |
| Social sign-in and account recovery | Not started | Define native providers and complete recovery/verification flows |
| Camera and single-photo intake | Baseline complete | Add production capture UX and preserve reliable permission fallbacks |
| Batch and multi-select intake | Baseline complete — Library intake and mixed Session composition; simulator recovery checks passed | Match the intentional web batch workflow where it fits native UX |
| Upload and streamed artwork analysis | Baseline complete | Preserve retry, status, and persisted-result behavior |
| Artwork thumbnails and image variants | Baseline complete | Preserve cloud derivatives, legacy fallback, and full-resolution detail/AI use |
| Artwork library and basic detail | Partial | Add complete metadata, actions, pagination, loading, and error states |
| Artwork editing, deletion, and re-identification | Partial — editing, Identify Again, and deletion implemented; device validation pending | Provide safe native actions with consistent persistence |
| Text-only Sessions | Baseline complete | Continue hardening long histories, interruption, and recovery |
| Artwork inputs and cards inside Sessions | Baseline complete | Harden lifecycle states and long-history behavior after the single-artwork paths |
| Session management | Partial | Complete history, titles, delete/archive behavior, and long-list UX |
| Artwork conversation / Ask Musee | Not started | Define whether it is a detail thread, Session entry, or both |
| Boards and collection organization | Implemented — native board management and membership; device validation pending | Bring over the active organization model with native interactions |
| Artist, museum, and movement browsing | Not started | Provide first-class discovery and detail paths |
| Journals, learning, and taste profile | Not started | Port validated learning and reflection experiences in later slices |
| Persona, language, usage, and account settings | Not started | Centralize durable preferences and account controls |
| Guest experience, conversion, and quotas | Not started | Preserve the backend trust model and native recovery behavior |
| Community/comments | Decision required | Confirm that the feature is active before creating native UI |
| Offline and degraded-network behavior | Not started | Define cached reading and queued-write guarantees explicitly |
| Notifications and deep links | Decision required | Add only for concrete retention and re-entry use cases |
| Distribution and App Store operations | Partial | Development signing works; TestFlight and production release remain |

This table tracks product-level parity, not component counts. A capability moves
to baseline complete only after its durable path works on a physical device when
device APIs are involved.

## Delivery phases

Phases describe dependency order. Work within adjacent phases may overlap when
the contract is already stable.

### Phase 1 — Native foundation

Status: baseline complete.

- establish npm workspaces and `packages/client-core`;
- create the Expo development client and native routing shell;
- inject platform networking and configuration;
- establish mobile UI tokens and small reusable primitives;
- verify Simulator and physical-device development workflows.

### Phase 2 — Identity and the core artwork loop

Status: baseline complete, with later hardening expected.

- implement native email authentication and credential rotation;
- keep refresh tokens in Keychain and access tokens in memory;
- capture or choose an image, upload it, stream analysis, and persist it;
- render the artwork library and a basic detail screen;
- handle permissions, authentication expiry, retry, and cold starts.

### Phase 3 — Persistent Sessions

Status: text and single-artwork baselines complete; lifecycle polish remains.

- start and reopen a text Session;
- persist user input before generation;
- stream and persist model responses with visible lifecycle states;
- add cloud thumbnails for efficient cards and timelines;
- accept artwork input from camera, Photos, and the existing library;
- persist artwork membership and event references;
- render artwork cards and mixed text/artwork turns after a cold start;
- converge equivalent web and iOS Session lifecycle states on one shared
  vocabulary while keeping displayed wording and platform-only details local;
- preserve the web Session semantics while using native composition and input UI.

### Phase 4 — Complete the artwork library

Status: in progress; detail, editing, Identify Again, deletion, and TanStack
Query cache/revalidation implemented. Multi-select Library intake now preserves
partial upload/analysis success with per-item retry; device validation pending.

- add pagination and intentional cache/revalidation behavior;
- complete artwork metadata and analysis presentation;
- support edit, delete, re-identify, and relevant artwork actions;
- add multi-select/batch intake where it improves the native workflow;
- verify image deletion, replacement, thumbnail, and legacy-record behavior.

**Phase 4 exit gate:** install a fresh development or preview build on a
physical iPhone and test authentication restoration, camera and Photos intake,
analysis, library actions, all three Session artwork sources, cold-start
restoration, permissions, background/foreground transitions, and network
failure recovery before beginning Phase 5.

The native navigation shell uses icon-only Home, Collection, and Profile tabs.
Home centers Session composition and opens history from the top-left. Collection
owns All Artworks, Artists, Museums, and Boards tabs with a persistent upload
action. Deeper routes use local controls and hide global navigation. Artists,
Museums, and Profile remain placeholders; the shell does not imply those
capabilities are implemented.

### Phase 5 — Organization and discovery

Status: Boards list/detail, create/rename/delete, and artwork membership implemented;
native validation pending. Discovery screens remain unimplemented.

- implement Boards and active collection-management workflows;
- add artist, museum, and movement indexes and detail screens;
- support search, filtering, and navigation between related entities;
- make large libraries usable without loading all data or images at once.

### Phase 6 — Conversation, learning, and personalization

Status: not started beyond Session conversation.

- define and implement Ask Musee from artwork detail;
- redesign the dormant web Explore angles as Session starters: selecting an
  angle should create a Session with the artwork and selected angle as the
  opening turn, rather than restoring the separate localStorage conversation;
- port active journals, learning surfaces, and taste-profile experiences;
- expose persona, language, usage, and account preferences;
- preserve Markdown and structured content without inheriting browser rendering
  assumptions.

### Phase 7 — Account breadth and lifecycle resilience

Status: not started.

- complete supported social sign-in and account recovery;
- implement guest conversion and quota presentation if guest mode is retained;
- define offline reading, retry queues, and conflict behavior;
- handle foreground/background transitions and interrupted uploads/streams;
- add deep links and notifications only after their product contracts are clear.

### Phase 8 — Production readiness and release

Status: development-device builds work; production pipeline not complete.

- profile startup, scrolling, image memory, and long Session histories;
- complete accessibility, Dynamic Type, contrast, and reduced-motion review;
- add crash reporting, privacy-safe telemetry, and operational diagnostics;
- audit secrets, network security, permissions, privacy manifests, and data use;
- establish EAS or equivalent reproducible preview/production builds;
- run TestFlight, device/OS coverage, beta feedback, and regression testing;
- prepare App Store metadata, screenshots, privacy disclosures, and review notes.

## Active milestone

### Completed baseline: artwork-aware native Sessions

Build one complete Session artwork slice:

1. start or open a Session;
2. add an artwork from camera, Photos, or the existing library;
3. optionally include text with the artwork input;
4. persist Session membership and the user event;
5. show upload/analysis/model phases and actionable errors;
6. stream and persist the model response;
7. reopen the Session and reconstruct the same artwork/text timeline.

Do not attempt every advanced Session behavior in this slice. Batch semantics,
notifications, richer model-status UI, and offline queuing should follow only
after the single-artwork persistent path is solid.

### Now: complete the native artwork library

Phase 4 has started: native detail now presents analysis, available
metadata, and a top-right actions menu for Identify Again, Edit, and Delete.
Editing supports title, artist, date, medium, and tags. Identify Again follows
the web clue form and saved-image identification endpoint; deletion uses the
existing collection soft-delete contract. The Library keeps loaded pages and
scroll position on return, uses TanStack Query to revalidate cached records in
the background, and applies detail edits and deletions immediately. Returning
to a Session refreshes linked artwork records and its title, preserving
unavailable references.
Device validation of this slice remains required before calling it
baseline complete.

Mixed Session composition now supports up to five Camera, Photos, and Library
attachments in one turn through a typed shared context lifecycle and a native
artwork adapter. Failed entries retain successful work and support individual
retry; committed turns support interrupted-response recovery. Simulator checks for reopen, interruption/retry, and cold-start recovery passed
and PR #144 is merged. The Session composition baseline is complete. Future artist, tag, and document context needs
concrete backend contracts, not new UI-specific orchestration.

## Quality gates

Every product slice should satisfy the gates that apply to it before its
milestone is considered complete:

- **Contract:** backend and shared-core types have one explicit canonical shape;
  compatibility paths exist only when an active client requires them.
- **Persistence:** authoritative user work survives termination and reopening.
- **Failure:** network, auth, permission, timeout, and partial-save states are
  visible and recoverable.
- **Performance:** lists use bounded queries and appropriately sized images.
- **Accessibility:** controls have labels, usable hit targets, Dynamic Type
  behavior, and sensible screen-reader order.
- **Tests:** pure logic and transports have automated coverage; critical UI and
  physical-device behavior has a short manual checklist.
- **Cross-client safety:** shared/backend changes pass relevant web and mobile
  checks.
- **Device validation:** camera, Photos, Keychain, backgrounding, and local
  network behavior are exercised on a physical iPhone when touched.

## Definition of migration complete

The migration is complete when:

- every active web product capability is implemented on iOS or has an explicit,
  recorded decision to redesign or omit it;
- the primary capture, library, Session, organization, and account journeys pass
  on supported physical devices;
- persisted data and API contracts remain compatible across web and iOS;
- the app behaves safely through authentication expiry, network interruption,
  backgrounding, termination, and cache eviction;
- accessibility, performance, privacy, observability, and security reviews are
  complete;
- a repeatable production build has passed TestFlight and App Store submission.

## Keeping this plan current

Update this document when a PR changes milestone status, sequencing, scope, or a
cross-cutting product decision. Keep updates small: change the current position,
capability status, active milestone, or phase outcome instead of appending a
dated activity log.

Do not copy implementation details from PRs into this plan. If the code and this
document disagree about what is implemented, verify the behavior and correct
the status here in the next relevant PR.
