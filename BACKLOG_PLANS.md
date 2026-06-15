# Backlog Plans

## 1. Automated Testing Plan

Status: deferred for now

### Goal

Add automated coverage for frequently used core flows and recent fragile behaviors, while keeping manual testing for higher-level UX judgment.

### Why

Recent bugs showed that the app is vulnerable to regressions in async state coordination, session history, upload lifecycle, and cross-view UI state. These are good candidates for automation because they are repeatable and easy to break during refactors.

### First test scope

- upload artwork
- analyze artwork
- session history behavior
- open/edit/switch artwork
- delete artwork/session
- quota behavior

### Prioritization rule

Start with flows that are:

- core
- frequently used
- already known to be fragile

### Proposed rollout

1. Add stable test selectors to core UI elements.
2. Choose the frontend/browser/backend testing toolchain.
3. Implement only a small first suite of high-value tests.
4. Run targeted tests locally during development.
5. Run the core suite automatically before merge / in CI.

### Candidate first tests

1. Upload placeholder persists during analysis and server refresh.
2. Session ordering uses capture time, not photo/EXIF time.
3. Switching from one artwork to another resets edit mode.
4. Deleted artwork behavior in session history is correct.
5. Quota exceeded blocks upload cleanly.

### What a good test should define

- scope
- setup / initial state
- user action
- expected result
- assertions against the rendered UI or API response

### Notes

- For frontend flow tests, trigger behavior through the real FE.
- Mock the backend/network response rather than relying on a live backend for every test.
- Use selectors such as `data-testid` so tests can reliably find important UI elements.


## 2. Session / Artwork Bootstrap Cache Idea

Status: deferred until current bugs are stabilized

### Problem

Session/reflection history restores immediately from local storage, while artworks and images restore later from the backend. This creates an inconsistent user experience where the memory appears before the visual context.

### Goal

Make session rehydration feel coherent by restoring lightweight artwork/session context immediately, while still treating the backend as source of truth.

### Recommended direction

- yes to lightweight local bootstrap cache
- no to caching full image binaries in local storage
- no to making local cache the canonical state

### Proposed model

1. Store a compact boot payload per user.
2. Hydrate that payload immediately on app start.
3. Fetch fresh backend data in the background.
4. Replace or reconcile local boot data with server truth.

### Suggested cached fields

- artwork id
- resolved image URL
- artist name
- artwork title
- session/visit id
- session title
- timestamp
- classification
- photo time if needed for display

Do not store raw image blobs or large binary data in `localStorage`.

### Suggested implementation shape

Create a small persistence layer, for example:

- `frontend-web/lib/bootstrapCache.ts`

Use it from:

- `frontend-web/hooks/useArtworkLibrary.ts`
- `frontend-web/hooks/useVisits.ts`

### Reconciliation rules

Server wins when:

- artwork is deleted
- metadata changed
- session relationships changed

The local cache is only a warm-start layer.

### Guardrails

Include:

- cache version
- `userId`
- `updatedAt`
- TTL / freshness rule
- safe fallback on parse failure

### Recommended rollout

1. Stabilize current upload/session/history bugs first.
2. Add artwork metadata bootstrap only.
3. Hydrate immediately from cache.
4. Refetch from backend and replace/merge.
5. Later unify visit drafts/streams/goals into the same boot model.

### Important design principle

The app should not restore only one half of the session experience. Either:

- restore both artwork context and visit/reflection context together

or

- intentionally wait and show a clear loading state

The long-term preferred direction is coherent, lightweight bootstrap hydration with backend revalidation.


## 3. Artist Detail Loading Cleanup

Status: deferred for later cleanup

### Problem

The artists tab already has enough local frontend state to render artist artwork thumbnails immediately, but opening an artist detail page still enters a blocking loading state while it refetches artist profile data and artworks.

### Goal

Clean up the artist detail loading model so the UI reuses already-available frontend state first, then fetches only missing or stale artist metadata in the background.

### Recommended direction

- render artist detail immediately from local collection state when possible
- avoid blocking the artwork grid on redundant artist artwork fetches
- fetch artist bio/profile fields in the background only when needed
- make loading states reflect truly missing data instead of unconditional page-level refetches

### Scope for later pass

1. Define what artist detail data should come from local FE state versus API fetches.
2. Pass enough artist/artwork context from the artists tab into the artist detail page for immediate render.
3. Separate artwork-grid readiness from profile/bio readiness.
4. Add clear cache/revalidation rules so frontend behavior is predictable.

### Notes

- This is intentionally deferred because the current branch is scoped to frontend fixes only, not broader data-loading architecture cleanup.
- The cleanup should be done as part of a more comprehensive review of when the app loads, reuses, and revalidates frontend state.


## 4. Reflection Image Context Model Cleanup

Status: deferred for later architecture review

### Problem

Session reflection is currently image-grounded only on the first reflection turn. Later reflection turns reuse conversation history and artwork metadata, but they do not resend raw artwork images to the model. That makes the current behavior cheaper and faster, but it also means newly added artworks in an existing session may influence later reflection only through analysis text and metadata rather than direct visual input.

### Goal

Revisit whether session reflection should stay first-turn-only for multimodal image context, or whether the app should selectively reattach images when the session’s artwork set changes.

### Questions to resolve later

1. What is the intended product behavior when new artworks are added after reflection has already started?
2. Should one session continue to behave like one continuous reflection thread, or should certain changes restart visual grounding automatically?
3. When should later reflection turns resend images:
   - never
   - always
   - only when artworks changed
   - only for newly added artworks
4. How should the app balance:
   - multimodal quality
   - latency
   - token / provider cost
   - continuity of the existing reflection conversation

### Recommended direction for the later review

- treat this as a product + architecture decision, not just a backend optimization
- explicitly define the contract between session state and reflection state
- decide whether “current session reflection” means:
  - reflect on the current artwork set visually each time
  - or continue a text-grounded conversation after an initial visual grounding pass

### Notes

- No behavior change is planned on this branch.
- The current implementation is coherent technically, but it may not match the expected product semantics if users assume later-added artworks are also directly seen by the model during ongoing reflection.
