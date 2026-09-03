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

Last reviewed: 2026-09-02.

The native app now has a functioning foundation and three usable product
slices:

- renewable email authentication with refresh credentials in Keychain and
  access credentials in memory;
- camera or Photos intake, cloud upload, streamed analysis, camera-roll saving,
  and retry behavior;
- artwork library and basic artwork detail;
- text-only Sessions with persisted user/model events, streamed Markdown
  responses, retry behavior, and cold-start restoration.

The next dependency is the artwork thumbnail contract. Once that is in place,
the active product slice is full artwork intake and rendering inside Sessions.

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
| Batch and multi-select intake | Not started | Match the intentional web batch workflow where it fits native UX |
| Upload and streamed artwork analysis | Baseline complete | Preserve retry, status, and persisted-result behavior |
| Artwork thumbnails and image variants | Not started — current focus | Add a durable cloud thumbnail contract with legacy fallback |
| Artwork library and basic detail | Partial | Add complete metadata, actions, pagination, loading, and error states |
| Artwork editing, deletion, and re-identification | Not started | Provide safe native actions with consistent persistence |
| Text-only Sessions | Baseline complete | Continue hardening long histories, interruption, and recovery |
| Artwork inputs and cards inside Sessions | Not started — next | Support capture, Photos, and library artworks in persistent mixed turns |
| Session management | Partial | Complete history, titles, delete/archive behavior, and long-list UX |
| Artwork conversation / Ask Musee | Not started | Define whether it is a detail thread, Session entry, or both |
| Boards and collection organization | Not started | Bring over the active organization model with native interactions |
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

Status: text baseline complete; artwork participation is active work.

- start and reopen a text Session;
- persist user input before generation;
- stream and persist model responses with visible lifecycle states;
- add cloud thumbnails for efficient cards and timelines;
- accept artwork input from camera, Photos, and the existing library;
- persist artwork membership and event references;
- render artwork cards and mixed text/artwork turns after a cold start;
- preserve the web Session semantics while using native composition and input UI.

### Phase 4 — Complete the artwork library

Status: not started beyond the basic library/detail baseline.

- add pagination and intentional cache/revalidation behavior;
- complete artwork metadata and analysis presentation;
- support edit, delete, re-identify, and relevant artwork actions;
- add multi-select/batch intake where it improves the native workflow;
- verify image deletion, replacement, thumbnail, and legacy-record behavior.

### Phase 5 — Organization and discovery

Status: not started.

- implement Boards and active collection-management workflows;
- add artist, museum, and movement indexes and detail screens;
- support search, filtering, and navigation between related entities;
- make large libraries usable without loading all data or images at once.

### Phase 6 — Conversation, learning, and personalization

Status: not started beyond Session conversation.

- define and implement Ask Musee from artwork detail;
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

### Now: cloud thumbnail foundation

The first implementation after this plan should establish one durable thumbnail
contract rather than adding client-only image shortcuts.

Expected outcome:

- artwork storage and API records expose a nullable `thumbnail_uri`;
- new uploads create a smaller cloud derivative suitable for list and timeline
  presentation;
- library and Session cards prefer the thumbnail and fall back to `photo_uri`;
- detail, zoom, and AI analysis continue using the primary artwork image;
- deletion/replacement lifecycle covers both image variants;
- existing artwork rows remain valid, with backfill handled separately if useful.

### Next: artwork-aware native Sessions

After the thumbnail contract is proven by the library, build one complete
Session intake slice:

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

## Quality gates

Every product slice should satisfy the gates that apply to it before its
milestone is considered complete:

- **Contract:** backend and shared-core types have explicit compatibility and
  legacy fallback behavior.
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
