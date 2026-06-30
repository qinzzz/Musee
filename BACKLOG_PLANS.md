# Backlog Plans

## 0. Frontend Artwork State Model Cleanup

Status: deferred

### Problem

`GalleryItem` has become an overloaded frontend artwork object. It currently mixes:

- persisted artwork data from the backend
- session membership/display context
- ingest / sync / analysis process state
- modal/navigation convenience fields
- legacy naming carried forward from earlier product shapes

That makes the object harder to reason about, easier to misuse, and more expensive to evolve cleanly.

### Why this matters

This is now a structural readability and correctness issue, not just naming polish. As more artwork flows were extracted, the oversized shared object became a hidden dependency surface across session, collection, capture, and artwork detail features.

### Recommended direction

- keep `sessionLinks` as the canonical membership source
- stop reintroducing legacy session fields onto runtime artwork state
- split the current shape into clearer layers over time:
  - persisted artwork record shape
  - client-side artwork process state
  - optional view-model / detail-selection state
- consider renaming `GalleryItem` later to an artwork-centric name once the split is far enough along

### Scope for a later pass

1. audit which fields are truly backend-backed vs client-only
2. separate transient UI/process flags from persisted artwork data
3. reduce cross-feature coupling on the shared object
4. rename legacy artwork/session terminology where the new boundaries are stable

## 0.1 Session Event Layer

Status: deferred

### Problem

The current session model mixes three different concerns:

- session membership (`session_artworks`)
- session chronology (`session_messages`)
- frontend stream reconstruction heuristics

This is good enough for the current MVP, but it is not a clean long-term model for repeated artwork appearances, multi-artwork actions, or event-first session playback.

### Current limitation

Right now:

- `session_artworks` correctly answers which artworks belong to a session
- `session_messages` partially acts like an event log
- the frontend still reconstructs the stream partly from unique session artworks instead of from explicit events

Because of that, the same artwork appearing multiple times in one session is not modeled cleanly in the rendered stream.

### Design goal

Introduce a proper session event layer so the product can chronologically reconstruct what happened in a session without overloading artwork membership or frontend heuristics.

### Recommended model

Keep:

- `sessions` as the session container
- `session_artworks` as canonical unique membership

Add later:

- `session_events`
  - event-level chronology
  - event type
  - role
  - optional text payload
  - metadata payload
  - created / ordered position

- `session_event_artworks`
  - join table between events and artworks
  - supports one event referencing multiple artworks
  - supports one artwork appearing in multiple events

### Important design principle

Events should not be anchored to the `session_artworks` row itself.

Instead:

- `session_artworks` answers “is this artwork part of the session?”
- `session_events` answers “what happened in the session, and when?”

That separation is necessary if:

- the same artwork appears multiple times in one session
- one action references multiple artworks
- the session stream needs to be replayed faithfully

### Suggested event types for the first pass

Start small:

- `message`
- `artwork_input`
- `artwork_result`

Exact source such as `library`, `upload`, or `camera` can stay in event metadata rather than exploding the event type list too early.

### Example target behavior

If a user:

1. uploads artwork A
2. later uploads artwork A again

Then:

- `session_artworks` still contains one unique membership row for A
- `session_events` contains two distinct chronology events
- the session stream can render both appearances in order

### Migration shape

1. introduce backend event tables
2. write new session actions to the event layer
3. migrate frontend session stream to be event-first
4. keep `session_artworks` as membership truth
5. gradually retire the current mixed message / artwork reconstruction path

### Why this matters

This is not only a product feature enabler. It is also a structural cleanup that reduces ambiguity between:

- membership
- chronology
- rendered session UI

## 0.15 AI Job Layer

Status: deferred until the session event model exists

### Problem

AI work is currently represented indirectly through mixed flags and side effects spread across artwork, session stream state, and backend orchestration.

Examples include:

- initial artwork identification
- re-identification
- label OCR
- upload commentary
- session reflection

These are all AI-backed jobs, but they do not yet have a first-class lifecycle model.

### Why this matters

Without a dedicated AI job abstraction, the product has to overload domain entities with process state such as:

- loading
- retryability
- failure reason
- partial output
- completion timing

That makes it harder to reason about:

- what AI work was requested
- what triggered it
- whether it succeeded or failed
- what should be retried

### Recommended direction

Add a later `ai_jobs` layer after `session_events` is in place.

Preferred naming:

- `AIJob`

Suggested first responsibilities:

- represent one unit of AI work
- track status (`queued`, `running`, `succeeded`, `failed`)
- link back to the triggering session event
- link optionally to affected session / artwork
- store structured input / output payloads
- support retry and failure inspection cleanly

### Important sequencing

Do not implement this before the session event layer.

The cleaner model is:

- `session_events` answer what happened in the session
- `ai_jobs` answer what AI work was launched because of those events

### First-pass scope later

Start with the highest-value job types:

- artwork identification
- artwork re-identification
- session reflection / upload commentary

## 0.2 Dormant Artwork Community / Comments

Status: deferred

### Problem

The artwork community/comments capability is only partially surfaced in the product.

Right now:

- frontend fetch / publish / delete code exists
- backend community/comment routes exist
- artwork detail still carries a `community` right-side mode

But the user-facing reachability is inconsistent, and the feature is not clearly presented as a stable part of the product.

### Why this matters

This is a cleanup and product-clarity problem:

- dead-looking code is expensive to maintain
- partially wired UI paths are harder to reason about
- future artwork-detail cleanup should not keep carrying ambiguous feature branches indefinitely

### Later decision needed

Choose one direction explicitly:

1. fully surface artwork community/comments as a real product feature
2. or remove the dormant UI/state branches and keep only the backend capability until needed again

### Scope for a later pass

1. audit all reachable entry points into `community` mode
2. decide whether comments belong in artwork detail at all
3. either expose a coherent UX or delete the dormant frontend layer

## 1. Automated Testing Plan

Status: foundational pass completed; expand incrementally

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

### Implementation outcome

This backlog item is no longer just planned. The first practical testing foundation is now in place:

- frontend critical-path tests were added with `Vitest` + React Testing Library
- backend targeted tests were added with `pytest`
- frontend coverage tooling was added
- backend coverage tooling was added
- GitHub Actions CI now runs:
  - backend tests with coverage
  - frontend tests with coverage
  - frontend production build

Current baseline:

- frontend coverage exists but is still intentionally selective
- backend coverage exists and is broader than before, but still focused on the cleaned seams first

### What changed structurally

The cleanup-first decision was correct. Before broadening tests, the app was split into clearer ownership seams such as:

- `app-shell/`
- `session/`
- `artwork/`
- `artwork-ingest/`
- `capture/`

On the backend, the previous monolithic artwork router was split into smaller router/service modules so tests could attach to narrower surfaces.

### Current covered areas

The current automated suite now protects several high-risk flows, including:

- session start orchestration
- session messaging / commentary flow
- session delete behavior
- app-shell navigation behavior
- artwork ingest orchestration
- artwork analysis / reanalysis state behavior
- board hooks
- backend session routes / services
- backend artwork ingest / mutation / utility routes
- backend visit/session chat and taste-profile paths

### What remains

This item is not fully “done” in the long-term sense. The remaining work is:

1. add more pure-helper tests around newer extracted modules
2. expand frontend coverage to a few more critical UI flows
3. add stable backend integration coverage for more routes once backend cleanup settles further
4. decide whether to enforce coverage thresholds in CI

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

### Remaining backend testing gaps

Backend testing is no longer deferred in absolute terms, but broader backend coverage is still deferred. The next backend PR-gate candidates are:

- collections CRUD
- auth / ownership checks
- more provider-independent AI-path tests
- more integration-style persistence checks where the cleaned service boundaries are now stable


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
- session id
- session title
- timestamp
- classification
- photo time if needed for display

Do not store raw image blobs or large binary data in `localStorage`.

### Suggested implementation shape

Create a small persistence layer, for example:

- `frontend-web/lib/bootstrapCache.ts`

Use it from:

- `frontend-web/artwork/hooks/useArtworkLibrary.ts`
- `frontend-web/session/hooks/useVisits.ts`

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

- restore both artwork context and session/reflection context together

or

- intentionally wait and show a clear loading state

The implemented direction is coherent, lightweight bootstrap hydration with backend revalidation.


## 3. Unified Session Titling Pipeline (MVP)

Status: completed

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

### Implementation outcome

The unified MVP session titling pipeline has now been implemented:

- new sessions start from one canonical default: `Untitled Session`
- backend stores:
  - `user_title`
  - `system_title`
  - `title_state`
- backend owns automatic title resolution
- manual rename locks future automatic title display changes
- frontend now treats backend title fields as the source of truth instead of inventing a competing title policy


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

Status: completed

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

### Implementation outcome

The guarded optimistic delete behavior has been implemented:

- confirmation modal dismisses immediately on confirm
- artwork enters a pending-delete state locally
- pending-delete artwork becomes dimmed and non-interactive
- success removes the artwork fully
- failure restores the artwork and surfaces an error toast


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

- Narrow local guard fixes have been made in a few places, but they do not resolve the broader architectural weakness in anonymous identity handling.


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


## 11. Dimension Enrichment Background Job Cleanup

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
