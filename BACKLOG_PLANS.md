# Backlog Plans

## 1. Automated Testing Plan

Status: planned after targeted frontend cleanup

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

1. Extract the most fragile logic out of `frontend-web/App.tsx` so test ownership is clearer.
2. Add stable test selectors to core UI elements.
3. Choose the frontend/browser/backend testing toolchain.
4. Implement only a small first suite of high-value tests.
5. Run targeted tests locally during development.
6. Run the core suite automatically before merge / in CI.

### Cleanup-first decision

Before setting up the frontend test stack, do a targeted cleanup pass focused on testability.

Reason:

- `frontend-web/App.tsx` has become a large orchestration file with too many responsibilities
- the first tests would otherwise be broader, more brittle, and harder to maintain
- the goal is not a full rewrite, but cleaner seams around the logic we most want to protect

### Frontend cleanup roadmap

#### Phase 1: cleanup for testability

Extract the highest-risk logic first:

1. `useSessionActions`
   - session rename
   - optimistic session delete
   - current-session delete routing
2. `useArtworkActions`
   - retry analysis
   - identify again
   - optimistic artwork delete
   - artwork analysis success / failure state updates
3. upload / capture helpers
   - EXIF parsing
   - image normalization / transcoding
   - museum / geolocation resolution
4. `useArtworkUploadFlow`
   - upload placeholders
   - raw upload persistence
   - analysis trigger
   - upload commentary trigger

#### Phase 2: testing foundation

After the extraction above:

- add frontend test setup under `frontend-web/`
- use `Vitest` + React Testing Library + `MSW`
- keep backend tests on `pytest`

Suggested frontend structure:

- `frontend-web/vitest.config.ts`
- `frontend-web/setupTests.ts`
- `frontend-web/test/server.ts`
- `frontend-web/test/handlers.ts`
- `frontend-web/test/factories.ts`
- `frontend-web/test/features/`

#### Phase 3: first frontend tests

Start with a very small, high-value suite:

1. session delete optimistic flow
2. artwork delete optimistic flow
3. identify-again modal flow
4. initial identification loading-state behavior

#### Phase 4: broader UI cleanup

After the first tests are in place:

- extract sidebar / session list rendering from `App.tsx`
- extract user menu / settings modal rendering
- extract shared root modals

### Target long-term structure

The intended ownership model is:

- `App.tsx` as application shell and top-level wiring
- `hooks/` for orchestration and stateful behavior
- `lib/` for pure helpers and domain rules
- `components/` for view rendering

The goal is to make new features, bug fixes, and tests attach to smaller units instead of the root component.

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

### Deferred backend testing

For now, the formal PR gate should stay frontend-focused.

Reason:

- recent cleanup and new seams are primarily on the frontend
- the backend still needs structural cleanup before a broad automated gate will be stable and maintainable

Backend testing is not dropped. It is deferred until backend cleanup makes the boundaries clearer.

When that cleanup happens, add backend PR-gate coverage for:

- session CRUD
- session messages
- artwork upload / analyze / reanalyze / delete
- collections CRUD
- auth / ownership checks
- quota enforcement


## 2. Session / Artwork Bootstrap Cache

Status: completed

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

### Implementation outcome

The lightweight bootstrap cache has been implemented as a warm-start layer so artwork/session context can appear immediately on app load while backend data revalidates in the background.

### Important design principle

The app should not restore only one half of the session experience. Either:

- restore both artwork context and visit/reflection context together

or

- intentionally wait and show a clear loading state

The implemented direction is coherent, lightweight bootstrap hydration with backend revalidation.


## 3. Unified Session Titling Pipeline (MVP)

Status: planned next

### Goal

Create one unified, scalable session titling pipeline that behaves consistently across:

- chat-only sessions
- upload / camera sessions
- library-curated sessions
- mixed sessions

### Design intention

The MVP should favor:

- consistency over cleverness
- stability over frequent retitling
- deterministic behavior over opaque inference
- backend-owned canonical titles over frontend-specific fallbacks
- user control over system-generated naming

This is meant to produce a strong, elegant MVP title system before introducing any LLM-driven naming.

### Core product behavior

1. Every new session starts as `Untitled Session`.
2. The backend owns canonical titling.
3. The frontend may show temporary draft placeholders, but should not invent final title policy.
4. The system should auto-generate one good title once meaningful evidence exists.
5. The system may upgrade that automatic title once if later evidence is materially better.
6. Manual rename always wins and should stop all future automatic display-title changes.

### MVP title model

Store:

- `user_title` — manual override
- `system_title` — backend-generated automatic title
- `title_state` — `draft`, `auto`, or `user_locked`

Displayed title:

- `user_title`
- else `system_title`
- else `Untitled Session`

### Important architecture rule

Do not persist a session kind such as `chat_only`, `capture_visit`, or `mixed` as canonical state.

Reason:

- session mode can change over time
- persisted interpretation would drift
- the resolver should derive naming strategy from current facts instead

Persist facts, not interpretations.

### Inputs the resolver should use

- user goal
- first user message / reflection prompt
- artwork count
- source presence (`upload`, `camera`, `library`)
- museum / city if available
- analyzed artist names
- analyzed artwork titles
- tags / themes / movement signals

### MVP ranking logic

Prefer titles in roughly this order:

1. strong shared artwork theme
2. dominant artist anchor
3. strong museum / venue name
4. clear user-goal summary
5. fallback `Untitled Session`

### Stability rule

- `Untitled Session` can always be upgraded once meaningful evidence exists
- an automatic title can be upgraded once if the new title is clearly better
- after a strong automatic title is established, stop retitling unless the user renames

### Non-goals for MVP

- no LLM title generation
- no frequent live retitling
- no competing frontend/backend naming policies
- no location-specific fallback like `Personal Visit`

### Implementation direction

1. Remove the split between frontend `Untitled Session` naming and backend implicit location/default naming.
2. Make backend session creation use one canonical default.
3. Move title resolution into one backend-owned resolver.
4. Keep frontend display logic simple and predictable.
5. Add explicit rename-lock behavior.


## 4. LLM-Assisted Session Title Suggestions

Status: deferred until after MVP titling pipeline is stable

### Goal

Explore whether LLM-generated title suggestions can improve title expressiveness after the deterministic MVP pipeline is working reliably.

### Design intention

If added later, LLM titling should be:

- an enhancement layer, not the source of truth
- constrained by strict validation and normalization rules
- unable to override user titles
- unable to introduce unstable title churn

### Recommended direction

- deterministic resolver produces baseline `system_title`
- optional LLM proposes a better `system_title`
- accept only if the suggestion is materially better, concise, grounded in session evidence, and passes product formatting constraints

### Notes

- Do not introduce this before the deterministic MVP pipeline is stable.
- Reliability, predictability, and product clarity matter more than title richness at this stage.


## 5. Optimistic Artwork Delete UX

Status: planned

### Goal

Improve artwork deletion responsiveness by dismissing the confirmation modal immediately and showing a temporary pending-delete state while the backend request completes.

### Design intention

The delete interaction should feel immediate without pretending the backend work is already finished.

The UX should favor:

- immediate acknowledgement after confirmation
- visible in-place progress instead of a blocking modal wait
- graceful recovery if backend deletion fails
- minimal layout jump until success is confirmed

This is intentionally a guarded optimistic delete, not a full instant removal.

### Core product behavior

1. User clicks confirm delete.
2. Deletion modal closes immediately.
3. The artwork enters a pending-delete frontend state.
4. Pending-delete artwork remains visible but appears dimmed / transparent and non-interactive.
5. When backend delete succeeds, remove the artwork from frontend state completely.
6. If backend delete fails, restore the artwork to its normal solid state and show a failure toast.

### Recommended UI behavior

- apply reduced opacity while delete is in flight
- disable clicking, editing, classification changes, and repeat delete actions for that artwork
- if the artwork is open in detail view, close that view immediately on confirm
- if the artwork appears in multiple views, all instances should reflect the same pending-delete state

### Engineering direction

Track an explicit frontend delete state per artwork, for example:

- `isDeleting`

or a slightly richer state such as:

- `deleteStatus: idle | pending | failed`

The flow should be:

1. mark pending delete locally
2. fire backend delete request
3. on success, remove artwork from frontend state
4. on failure, clear pending state and surface error toast

### Why this direction

- avoids the current frozen-screen feeling after confirmation
- feels more responsive without hiding backend uncertainty
- is less visually jarring than immediate removal followed by re-insertion on failure
- keeps the request lifecycle legible to the user

### Notes

- This should be implemented consistently across grid, collection, session, and artwork-detail entry points.
- Pending-delete items should not be selectable for other actions while deletion is in flight.


## 6. Artist Detail Loading Cleanup

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


## 7. Reflection Image Context Model Cleanup

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


## 8. Identity / Authorization Model Cleanup

Status: deferred but important

### Problem

The app currently mixes:

- authenticated user flows backed by JWTs


## 9. Capture Photo Quality Improvement

Status: deferred for later product / architecture pass

### Problem

The current session capture page uses a live browser camera stream (`getUserMedia`) and grabs cropped frames from the video feed. That enables the custom drag-to-crop interaction, but it does not use the device's native still-photo pipeline.

As a result:

- captured artwork quality is lower than a native camera photo
- artwork labels are especially vulnerable to blur / low detail
- EXIF metadata such as timestamp and GPS is not preserved in the captured crop

### Goal

Improve artwork and label image quality without losing the core capture workflow.

### Recommended direction

Move from:

- live video crop first

to:

- native or browser-managed still photo capture first
- crop artwork / label regions from the higher-resolution still image afterward

### Why this is likely better

- higher-resolution source image for both artwork and label
- better OCR / multimodal reading of museum labels
- less analysis failure caused by blurry text
- more future-proof if the capture flow later supports multiple artwork / label crops from one shot

### Product tradeoff

The current live crop interaction feels immediate, but it sacrifices image fidelity. A photo-first flow adds one more step, yet should produce meaningfully better analysis quality.

### Notes

- This should be treated as a product + technical architecture decision, not just a camera implementation detail.
- If revisited, evaluate whether mobile web should use a native camera capture entry (`capture=\"environment\"`) before presenting the crop UI.
- The current live-stream approach remains acceptable for MVP interaction testing, but it is not the ideal long-term quality path if label reading becomes important.
- anonymous / local-device flows backed by frontend-generated `user_id`

As a result, route-level authorization is enforced inconsistently. Some endpoints verify the JWT subject against `user_id`, while others rely mainly on the request-supplied `user_id` itself.

This makes the system easy to extend incorrectly and leaves the backend too trusting of client-provided identity in anonymous-style flows.

### Goal

Define one clear, scalable identity and authorization model so new endpoints cannot accidentally weaken access control.

### Design intention

The future model should:

- separate authenticated and anonymous behavior explicitly
- centralize authorization checks instead of repeating ad hoc route logic
- avoid treating client-supplied `user_id` as a trusted identity primitive
- make it obvious which routes are public, anonymous-scoped, or authenticated

### Questions to resolve

1. Should session and artwork data remain available in anonymous mode?
2. If yes, what server-side primitive owns anonymous identity:
   - signed anonymous token
   - device/session cookie
   - temporary server-issued guest account
3. Which routes should require authenticated identity versus guest identity versus no identity?
4. How should anonymous data migrate when a guest user signs in?

### Recommended direction

1. Inventory all routes that currently rely on `user_id` query params.
2. Classify each route as:
   - authenticated-only
   - guest-scoped
   - public
3. Introduce one shared authorization layer per class.
4. Remove route-by-route trust in raw client-provided `user_id`.

### Notes

- The current branch includes a narrow local guard fix for the new session bootstrap endpoints.


## 10. Session Terminology Rename Cleanup

Status: deferred until current backend / frontend cleanup passes settle

### Problem

The product is now clearly centered on `sessions`, but parts of the codebase still use older `visit` terminology:

- backend route/module names such as `visit_chat`
- frontend state names such as `visitStreams`
- types such as `VisitDraft`, `VisitSummary`, and `VisitStreamMessage`
- helper/function names such as `visitChatStream`

This naming drift makes the architecture harder to read because the active product concept and the code vocabulary no longer match.

### Goal

Align backend and frontend naming with the current product model so session reflection, session messaging, and session state all use one coherent language.

### Design intention

The rename should:

- make `session` the default domain term
- reserve `visit` only if it still means something distinct product-wise
- reduce cognitive overhead when reading backend/frontend boundaries
- make future cleanup and test writing more straightforward

### Recommended direction

1. Rename code symbols first:
   - `visit_chat.py` -> `session_chat.py`
   - `VisitChatRequest` -> `SessionChatRequest`
   - `visitStreams` -> `sessionStreams`
   - `VisitDraft` / `VisitSummary` / `VisitStreamMessage` -> session-oriented names where appropriate
2. Keep API behavior stable during the symbol-rename pass.
3. Decide separately whether the external HTTP paths should also be renamed:
   - `/api/visit/chat`
   - `/api/visit/chat-stream`
4. Remove or verify any truly stale curator/exhibition UI remnants during the same review.

### Notes

- This is not just cosmetic. The stale terminology now obscures real architecture boundaries.
- The current backend visit-chat endpoints are still active through the session reflection / commentary flow, so this is a rename cleanup, not dead-code removal by default.
- That local fix does not resolve the broader architectural weakness in anonymous identity handling.


## 10. Dimension Enrichment Background Job Cleanup

Status: deferred but important

### Problem

The main artwork capture / upload / analyze flow succeeds, but the follow-up background job that scores artwork entities on taste dimensions can fail independently due to provider/configuration drift.

Observed symptom:

- artwork upload succeeds
- artwork analysis succeeds
- a later background warning appears for dimension analysis

This makes the product behavior harder to reason about because one part of the system is healthy while a secondary enrichment path silently degrades.

### What this job is for

This background job scores each recognized artwork entity on taste-oriented dimensions such as:

- figurative vs abstract
- emotive vs conceptual
- serene vs intense
- classical vs avant-garde
- playful vs serious

Those scores are used for later taste-profile, archetype, and recommendation features. They are not required for basic artwork identification.

### Current issue

The dimension enrichment path currently uses a separate OpenAI-specific client path and can fail even when the app's main analysis provider is configured differently. That creates avoidable provider mismatch and credential fragility.

### Goal

Make secondary enrichment jobs behave consistently with the app's provider configuration and fail more transparently when they are non-critical.

### Recommended direction

1. Audit the dimension-analysis background job and its provider selection.
2. Remove hardcoded or provider-specific assumptions that can drift from the main analysis pipeline.
3. Decide whether this job should:
   - use the same provider abstraction as the main artwork analysis
   - or be explicitly disabled when the required provider credentials are missing
4. Improve observability so non-blocking enrichment failures are clearly separated from core analysis failures.

### Product expectation

- core artwork analysis should remain successful even if this job fails
- users should not lose the main capture/analyze experience because of this enrichment path
- taste-profile features should degrade gracefully until dimension enrichment is healthy again
