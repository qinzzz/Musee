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

Last reviewed: 2026-09-08.

The native app now has a functioning foundation and four usable product
slices:

- renewable email authentication with refresh credentials in Keychain and
  access credentials in memory;
- custom camera or Photos intake with a required artwork and optional label,
  cloud upload, identification, camera-roll saving, and retry behavior;
- artwork library and basic artwork detail;
- Sessions with persisted user/model events, streamed Markdown responses,
  retry behavior, cold-start restoration, and camera, Photos, or library
  artwork input.

The cloud thumbnail contract and shared Session prompt ownership are complete.
Session timelines render artwork cards durably, and camera, Photos, and existing
library artworks can participate in mixed artwork/text turns. The remaining
Phase 3 work is lifecycle-state vocabulary polish rather than a missing core
input or persistence path. New Sessions adopt their saved identity without opening
another screen; the user confirmed the navigation jump is fixed on-device.

Artwork-plus-label capture is implemented for Library and Sessions. Camera UI
has been iterated on a physical iPhone, but the complete permission, failure,
and interruption matrix remains unverified. This is the closeout work for capture;
native account access is the next feature milestone.

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
| Apple and Google sign-in, account linking, and recovery | Not started | Support both native providers alongside email, with consistent account linking, restoration, and recovery/verification flows |
| Camera and single-photo intake | Baseline complete — custom capture UI refined on iPhone | Validate framing, permissions, and lifecycle recovery on the final layout |
| Artwork with optional label in one identification flow | Implemented — Library and Sessions; full device recovery validation pending | Preserve one required artwork and one temporary optional label, using web identification semantics |
| Batch and multi-select intake | Baseline complete — Library intake and mixed Session composition; simulator recovery checks passed | Match the intentional web batch workflow where it fits native UX |
| Upload and streamed artwork analysis | Baseline complete | Preserve retry, status, and persisted-result behavior |
| Artwork thumbnails and image variants | Baseline complete | Preserve cloud derivatives, legacy fallback, and full-resolution detail/AI use |
| Artwork library and basic detail | Partial | Add complete metadata, actions, pagination, loading, and error states |
| Artwork editing, deletion, and re-identification | Partial — editing, Identify Again, and deletion implemented; device validation pending | Provide safe native actions with consistent persistence |
| Text-only Sessions | Baseline complete | Continue hardening long histories, interruption, and recovery |
| Artwork inputs and cards inside Sessions | Baseline complete | Harden lifecycle states and long-history behavior after the single-artwork paths |
| Session management | Partial — native name/goal editing and confirmed deletion implemented; device validation pending | Validate management actions, history, and long-list UX; decide archive behavior |
| Artwork conversation / Ask Musee | Not started | Define whether it is a detail thread, Session entry, or both |
| Boards and collection organization | Implemented — native board management and membership; device validation pending | Bring over the active organization model with native interactions |
| Artist, museum, and movement browsing | Artists and Museums implemented; device validation pending. Movements not started | Provide first-class discovery and detail paths |
| Personal section: journals, learning, and taste profile | Not started — Profile is a placeholder | Implement native journal and taste-profile experiences based on active web behavior |
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
- verify image deletion, replacement, thumbnail, and legacy-record behavior;
- validate the completed artwork-plus-label capture flow in Library and Sessions.

Native capture supports a required artwork and one optional label, with Photos
selection, review, and consistent one-tap retake. The bounded camera preview
ends above opaque controls; the shutter row sits above the artwork/label tabs.
Label-assisted identification uses the web endpoint: the label is supporting
evidence, not a saved image or a separate transcript. Artwork-only identification
streams; label-assisted identification returns a complete result. Only the artwork
is saved to Photos. Additional supporting images are outside this slice.

Pending labels remain in memory for retry and do not survive termination before
identification completes. Completed metadata and analysis are durable. This is an
explicit recovery limitation, not an offline draft guarantee.

**Phase 4 exit gate:** install a fresh development or preview build on a
physical iPhone and test authentication restoration, camera and Photos intake,
analysis, library actions, all three Session artwork sources, cold-start
restoration, permissions, background/foreground transitions, and network
failure recovery before marking the integrated baseline complete. Boards, Artists,
and Museums have overlapped this validation gate; further discovery waits for
the integrated device pass.

The native navigation shell uses icon-only Home, Collection, and Profile tabs.
Home centers Session composition and opens history from the top-left. Collection
owns All Artworks, Artists, Museums, and Boards tabs with a persistent upload
action. Deeper routes use local controls and hide global navigation. Profile remains a placeholder; its shell does not imply account and
personalization capabilities are implemented.

### Phase 5 — Organization and discovery

Status: Boards list/detail, create/rename/delete, and artwork membership implemented;
native validation pending. Artists now includes search, profiles, and paginated
saved works with artwork-to-artist navigation; native validation pending.
Museums now supports search, existing venue metadata, and paginated captured artworks; device validation pending. Movement discovery remains unimplemented.

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
- replace the Profile placeholder with native journals and taste-profile views,
  including the active web creation, reading, update, loading, and recovery paths;
- port other active learning surfaces;
- expose persona, language, usage, and account preferences;
- preserve Markdown and structured content without inheriting browser rendering
  assumptions.

### Phase 7 — Account breadth and lifecycle resilience

Status: not started.

- implement both Apple and Google sign-in alongside email authentication;
- preserve one account identity across providers, including account linking,
  cancellation/error recovery, sign-out, and cold-start credential restoration;
- complete account recovery and verification flows;
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

### Implemented library baseline: validation pending

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

### Active closeout: capture and physical-iPhone validation

The development app is running on a physical iPhone, and the user reports that
most features work. This establishes an initial device pass, not sign-off on
every capability or the full failure-recovery checklist. Device testing surfaced
camera dismissal, keyboard handling, Session management, and collection-search
reliability work. Those fixes are implemented. The user confirmed the new-Session navigation fix;
other fixes still need the focused regression pass.
Session goals now reach the canonical chat prompt; collection searches have
bounded AI ranking and concise outcome logs for diagnosing failures.

The next checkpoint is to confirm these fixes on-device and complete the remaining
permission, cold-start, interruption, degraded-network, and cross-client checks.
TestFlight and production release readiness remain separate, unfinished milestones.

Pause additional discovery features after Museums for a dedicated build-and-test
session. The navigation shell, artwork library, Boards, Artists, Museums, shared services,
and Session composition now form a useful integrated baseline to validate.
Further discovery follows this checkpoint; a successful simulator build alone does not
establish physical-device or release readiness.

- The physical-iPhone development build is installed. Verify cold launch, sign-in
  restoration, and backend configuration through a complete restart.
- Validate Home/history, Collection sub-tabs, local back navigation, and Profile
  placeholder behavior, including camera/Photos permission paths.
- Exercise upload, edit, Identify Again, delete, Boards membership, and Artists
  search/profile/artwork navigation, plus Museums search/detail/artwork navigation. Check pagination and return-to-list state.
- Verify the final capture viewport against the saved photo, artwork-only and
  artwork-plus-label intake in Library and Sessions, label-first capture, both
  retake actions, Photos fallback, and denial of camera/Photos permissions. Confirm
  that labels do not become Library artworks or camera-roll copies.
- Verify failed label identification retries without uploading a second artwork;
  distinguish in-app retry from the documented termination limitation.
- Repeat Session multi-attachment, streamed-response, interruption/retry, reopen,
  and cross-client persistence checks on the integrated build.
- Test background/foreground and degraded-network recovery with web and native
  open together. Artists and Boards refresh failures improved after moving
  synchronous artist database reads off the API event loop, but the user reports
  only partial recovery; resolving remaining timeouts is a gate before further discovery work.
- Review per-card artist preview request fan-out if load remains high; consider
  batched previews based on measured request timings.

Agents run automated checks and builds; the user operates simulator/device UI
checks by default. Record confirmed outcomes and remaining blockers before
advancing the milestone. Artist browsing currently links existing artist entity
IDs; it does not backfill legacy links or generate biographies on navigation.

### Next build: native account access

Build Apple and Google sign-in alongside email before starting the Personal
section. This gives existing web users a path into their existing native library
and Sessions and establishes account identity before adding more personal data.
Capture is now implementation-complete for its agreed scope; its remaining device
checks stay in the closeout checklist rather than becoming another capture feature.

Deliver the account milestone in this order:

1. **Google sign-in end to end.** Reuse the existing backend Google login and
   native refresh-token response. Verify the iOS provider configuration and token
   audience contract before wiring native credential acquisition into the existing
   auth service. Do not assume the web client configuration is sufficient.
2. **Apple sign-in and provider linking.** Add verified Apple identity support
   through the same native login-session lifecycle. Define linking for existing
   email/Google accounts and private-relay addresses before implementation; do not
   infer that two different addresses belong to the same person.
3. **Recovery and account controls.** Complete verification/password-reset re-entry
   and the minimal signed-in account surface needed to understand the account,
   link supported providers, and sign out. Keep journals and taste profile in the
   subsequent Personal milestone.

Acceptance: returning users reach their existing artwork and Session data;
provider cancellation and failure leave login recoverable; refresh, sign-out,
and cold-start restoration work on iPhone; linking does not create unintended
accounts or expose another account's cached data. Validate the unchanged web
login path whenever shared authentication contracts change. Provider setup and
signing configuration are prerequisites to device sign-off.

### Following product milestones

1. **Personal section:** replace the Profile placeholder with journal list/detail
   and the active web creation flow, then taste-profile views. Include loading,
   empty, update, and recovery behavior in each slice.
2. **Remaining parity:** finish artwork detail/conversation, preferences, and
   other active capabilities in the map. Further discovery still waits for the
   outstanding integrated device and timeout checks.
3. **Release readiness:** complete lifecycle, accessibility, security, and
   distribution gates, including TestFlight. Account and Personal work do not
   substitute for these gates.

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
