# Camera Roll Import Roadmap

Last reviewed: 2026-09-12.
Status: M1 manual location editing passed user acceptance in the Simulator; physical-device validation and remaining catalogue integration are pending. Production camera-roll discovery is not implemented.
Next milestone action: **M1 — Validate location editing on an iPhone, then close remaining catalogue integration.**

This is the central product, implementation, and testing plan for camera-roll
import. Keep milestone status and decisions here so work can continue across
tasks and branches. Implementation details belong in the relevant PRs and code.
This feature plan complements [IOS_MIGRATION.md](IOS_MIGRATION.md); it does not
replace the migration's outstanding physical-device and release gates.

## Goal and release scope

Help a new user populate Musee with previously photographed artworks and recover
their visit history, with little manual effort and explicit approval before
photos become library records or enter cloud artwork analysis.

The full feature should find artwork beyond museums, including galleries,
street art, shops, and photos without GPS. The first release is deliberately
narrower: **discover likely museum/gallery visits from original metadata,
visually filter their photos, and offer manual selection for missed artwork.**
Describe that coverage honestly; do not call it a complete artwork scan.

Success means useful accepted artworks and correct visit history, not simply a
large number of imports. Wrong venue assignments, missed artworks, review
effort, time to first results, and recovery after interruption all matter.

## Agreed product decisions

1. Build location correction first and reuse it in import review.
2. Apple MapKit is the preferred direction for the iPhone place picker, subject
   to an integration/coverage check and a supported data-retention design in M1.
   It is not a replacement for Musee's museum catalogue or visit logic.
3. A capture location may be a museum, gallery, café, shop, street, or user-entered
   place. Only eligible, validated places link to a shared museum entity.
4. Keep original photo GPS/time separate from user corrections and predictions.
   Record a user assignment or explicit removal so background resolution cannot
   overwrite it, including a resolution request already in flight.
5. Discovery and approved import share venue evidence/results. Do not repeat a
   successful venue lookup or retry an unresolved lookup with identical evidence
   merely because import started. Provider failures may be retried separately.
6. Location prioritizes discovery; it is not the definition of artwork. Broad
   visual scanning follows the first release, with manual selection available now.
7. One selected photo becomes one artwork in the MVP. Different shots of the
   same work remain separate selections; users can deselect extras. Preventing
   duplicate records from retries is mandatory and is a different problem.
8. Artwork detection means “does this photo contain artwork worth reviewing?”
   Artist/title identification is a separate stage after approval.
9. Import approval does not automatically mean the user confirmed the suggested
   venue. Preserve the distinction between inferred and user-confirmed locations.

## Overall pipeline

| Stage | Inputs and behavior | Output / boundary |
| --- | --- | --- |
| 1. Explain and request access | Explain the initial scan's coverage; request Photos access; support limited access and manual selection | No assumption of access to the entire library |
| 2. Inventory original metadata | Page through permitted assets; read original location, capture time, available source/subtype flags, and asset identity | Local inventory/checkpoint; no library artworks created |
| 3. Discover candidate visits | Find nearby museums/galleries from GPS; use capture times and spatial consistency to distinguish visits | Candidate groups and venue evidence, including ambiguous/unresolved candidates |
| 4. Detect artwork | Read bounded previews for candidate photos; run the selected on-device detector | Artwork candidates, optional uncertain candidates, and rejection reasons |
| 5. Review | Show proposed visits and photos; change/remove location; deselect extras; manually add missing photos | A saved selection and explicit import approval |
| 6. Persist approved import | Upload selected photos; create/reuse durable artwork and visit references; carry forward location decisions | Retry-safe saved records, visible partial progress |
| 7. Identify and finish | Run existing artwork identification on saved artwork; retry failed stages independently | Populated library and visit history that survive restart |

The first release does not automatically attach photos without GPS using nearby
photos' times. That extension belongs to M8. Missing capture times also cannot
justify an invented visit date: present photos without a dated visit when needed.

Do not discard photos solely because the nearby venue lacks a Wikidata match.
Candidate discovery can retain plausible places for visual filtering while final
museum association remains unresolved. Nearby GPS alone is not proof of a visit.

### Data and consent boundaries

- Photos access, external location lookup, and importing/uploading selections
  are separate permissions/expectations. Explain provider-bound location queries
  before enabling them; Photos access alone is not blanket consent to send GPS.
- Default discovery processes photo pixels on device. A cloud detector would be
  a separate product/privacy decision, not a silent implementation substitution.
- Before approval, keep scan progress and review drafts locally and scoped to
  the account. Do not create user library/visit records or upload photo pixels.
- A Photos identifier is a device-library reference, not a universal content ID.
  Define its scope and missing/deleted-asset behavior before using it for resume.
- Use provider data according to its retention/attribution rules. A saved Apple
  place ID does not imply permission to copy its entire response permanently.
  Keep original metadata, user-authored text, provider references, and museum
  links distinguishable.
- Sign-out/account switching must isolate or clear local drafts and stop future
  processing. Logs should use aggregate outcomes rather than private images/GPS.

## Existing building blocks and gaps

| Area | Verified starting point | Work still required |
| --- | --- | --- |
| Venue resolution | [resolver](backend/app/services/museum/resolver.py) checks catalogue footprints/proximity, can abstain, and protects user decisions against stale automatic results | Reusable discovery result handoff |
| External discovery | [OSM discovery](backend/app/services/museum/osm_discovery.py) plus [Wikidata validation](backend/app/services/museum/wikidata_validation.py) | Production defaults to museums; gallery eligibility, missing identifiers, and candidate-vs-final semantics need explicit handling |
| Artwork editing | [mutations](backend/app/routers/artwork_mutations.py) supports capture-place assignment/replacement/removal and existing metadata edits | New museum intake and physical-device validation |
| Batch intake | [shared batch lifecycle](packages/client-core/src/artworkBatch.ts) and [mobile adapter](frontend-mobile/src/capture/mobileArtworkBatchService.ts) preserve partial success within a job | Durable checkpoints and backend deduplication after unknown upload outcomes |
| Visits | Existing Session, SessionArtwork, and SessionEvent concepts | Historical visit dates, import-only visits without fabricated chat, and repeat-import reconciliation |
| Dataset | [manifest](backend/eval/dataset/manifest.json); local labeling and venue-suggestion prototypes are separate, unmerged work | Independent discovery/detection benchmark, held-out splits, representative negatives |
| Evaluation | [existing evaluator](backend/eval/run_eval.py) evaluates artwork identification | It is not the camera-roll discovery evaluator; annotation suggestions are not production predictions |

The local labeler prototype offers broader map suggestions than production resolution:
it includes galleries and does not require Wikidata validation. Do not interpret
a successful annotation suggestion as a successful production association.

## Milestones and segmented delivery

Milestones below are **not started** unless their status says otherwise.
Existing annotation tooling is a prerequisite, not completion of M2.
M1 is the first product change. M2 research/evaluation may proceed alongside M1;
M3–M4 depend on M2's fixtures and metrics. M5 integrates M1, M3, and M4; M6 is
required before M7 release. Draft the M6 persistence contract before finalizing
M5 so review state and approval can be handed off without redesign.

### M1 — Correct an artwork's capture location

Status: **implemented awaiting validation**, for the first bounded slice.
User acceptance: manual location editing passed in the Simulator on 2026-09-12.
Production schema: the standalone [migration](backend/migrations/20260912_capture_location_override.py)
was applied and verified on 2026-09-12: nullable JSONB, no default, no backfill.
The backend override/migration, owner-only update route, atomic automatic-resolution
guard, iOS MapKit search picker, manual entry/removal, existing-museum matching,
and cross-client override display are implemented. The picker includes a map
with synchronized result/pin selection; selecting or panning does not save a
location until explicit confirmation. Apple place IDs are stored;
provider display details are resolved transiently on iOS 18+. New museum creation,
broader identity matching, and full web place-name resolution remain deferred.
Automated tests cover persistence, authorization, invalid selections, ambiguous
matching, stale resolution, display precedence, delayed search results, Save/Cancel,
duplicate-save prevention, and failed-save retry. The full unsigned iOS Simulator
build passed for arm64 and x86_64, including the local MapKit module.
The map addition passed the signed Simulator build and automated selection tests;
the signed app also resolves the unsigned build's secure-storage startup failure.
Physical-iPhone search quality and the complete reopen/re-identify checklist remain
required before this milestone can be marked complete.

**Outcome:** an existing artwork can have its place changed or removed, and the
choice survives restart and subsequent automated analysis.

Implementation slices:

- **M1a — Location contract and precedence.** Inspect the existing location JSON,
  museum foreign key, serializers, and authentication patterns. Define original
  evidence vs effective capture place, manual assignment, explicit removal, and
  “not yet resolved.” Extend the existing artwork update path with authenticated
  ownership checks, migration/legacy behavior, and transactional conflict handling.
- **M1b — MapKit picker.** Validate representative public places and supported iOS
  versions; choose native Expo integration vs server-backed search. Implement
  search-as-you-type, name/address/type results, optional suggestions near original
  GPS, selection, Save/Cancel, manual entry, and Remove location. Do not default
  historical photos to the user's current position or require live location access.
  Handle delayed/out-of-order responses, offline states, and empty search results.
- **M1c — Catalogue connection.** Match selected museums to existing entities using
  provider references where available, otherwise name/address/coordinates with
  ambiguity handling. Apple IDs are not OSM/Wikidata IDs. Validate and deduplicate
  new eligible museums through existing intake; retain the personal correction
  even when catalogue matching fails. Non-museum places do not create museums.
- **M1d — Display and regression.** Update effective location display and relevant
  Library/Museums/detail caches. Existing web reads must display the corrected
  location consistently; a full web MapKit picker is outside the iOS-first slice.

**Exit tests:** assign existing museum; select new museum; select café/street;
manual entry; remove; cancel; unknown/ambiguous match; provider failure; rejected
cross-account mutation; concurrent auto-resolution vs user save; restart;
re-identification does not overwrite the correction; original GPS unchanged.
Verify the picker and keyboard/accessibility behavior on a physical iPhone.

### M2 — Establish a faithful benchmark

**Outcome:** measure losses at each stage before choosing thresholds or a model.

- Inventory the current manifest and original files without changing images or
  erasing user labels. Preserve artist/title labels for their separate task.
- Keep detection labels (artwork/supporting label/non-art/unsure), actual visit,
  actual venue, and source annotations as ground truth. Separate model inputs,
  predictions, and final user corrections structurally in the evaluator.
- Add ordinary camera-roll negatives, screenshots, non-museum artworks, missing
  GPS/time, nearby competing venues, and multiple visits to the same museum.
- Split by whole visit, keeping related shots together; add held-out users when
  available. Annotate benchmark truth before exposing venue/model suggestions.
- Build an evaluator that uses only original metadata and permitted photo inputs.
  Human venue/source labels must never repair missing inference inputs. Report
  “unknown truth” separately from a verified negative or an inference failure.
- Record dataset/split versions, resolver configuration, model version, and per-stage
  outcomes. The current small personal dataset is a pilot, not evidence of general
  camera-roll accuracy; further collection size follows observed error coverage.

**Exit tests:** leakage check; identical inputs reproduce results; missing GPS stays
missing; non-art cases included; ambiguous venue and network error remain distinct.
Produce a baseline report and agree numeric quality/performance targets before
tuning on validation data. Keep the test split untouched until the release check.

### M3 — Metadata scan and candidate visits

**Outcome:** a cancellable, resumable scan proposes plausible visits without
creating artworks or requiring visual analysis of every photo.

- Implement paged Photos inventory behind a platform adapter, with limited/denied
  permissions, library changes, iCloud-only assets, missing metadata, and local
  checkpoints. Do not use file modification time as capture time.
- Exclude recognized screenshots from automatic visit grouping; absence of a
  screenshot flag does not prove camera origin. Use readable source signals only.
- Group by time and spatial evidence; separate repeat visits and competing venues.
  Version/tune gap and distance rules on validation data, not intuition alone.
- Reuse venue discovery/matching primitives with a read-only candidate stage.
  Include gallery candidates and preserve uncertain matches for review.
- Cache nearby venue geometry/search results with bounded concurrency and provider
  budgets. Recompute per-photo spatial matches; do not copy one photo's location
  conclusion to a whole group blindly. Provider failure is not “no venue.”

**Exit tests:** repeated visits, midnight/timezone uncertainty, GPS drift, adjacent
museums, pass-by photos, sparse visits, unknown timestamps, screenshots, permission
revocation, cancel/resume, unavailable network, and no pre-approval record writes.

### M4 — Visual artwork detection

**Outcome:** filter venue candidates cheaply while retaining uncertain artwork
for optional review; no artist/title identification is needed here.

- Compare a Create ML classifier baseline with a suitably licensed SigLIP 2
  variant as a candidate. MobileCLIP was excluded by earlier license review;
  do not reintroduce it without new evidence permitting product use.
- Verify the exact selected weights, license, conversion dependencies, and device
  compatibility before adoption. No model has an established iPhone performance
  win in this project. Training is required for a custom classifier, but the
  evaluation set is required even for a zero-shot baseline.
- Benchmark bounded thumbnail inference on physical supported devices, including
  model load, total throughput, memory, energy/thermal behavior, and cancellation.
- Use artwork/supporting-label/non-art/uncertain outcomes. Keep uncertain cases
  accessible; supporting label photos do not become standalone artwork imports.
  Automatic pairing of label photos to artworks is deferred.

**Exit tests:** paintings, sculpture, installations, framed non-art, shop displays,
blur/occlusion, screenshots, HEIC/orientation, large batches, and foreground resume.
Select the model and thresholds using M2 metrics, not visual impressions alone.

### M5 — Review and approval

**Outcome:** the user understands the proposed import and can correct it first.

- Show candidate visits, date uncertainty, venue suggestion state, and artwork
  thumbnails; reveal uncertain visual candidates on demand.
- Reuse M1's location control. Applying a correction to the whole visit is an
  explicit action; do not silently rewrite unrelated artwork associations.
- Support photo/visit selection, deselection, manual addition, removing a photo
  from an incorrect visit group, and importing artwork without a known venue.
- Persist account-scoped review selections locally. Present the selected count,
  cloud processing expectations, and relevant quota constraints before approval.
- Carry source evidence and confirmation state in the approved selection. Merely
  accepting an import does not turn every venue suggestion into verified truth.

**Exit tests:** zero results; all deselected; mixed uncertain results; manual additions;
wrong group; edited place; cancelled review; restart recovery; stale/deleted photo;
limited Photos access; accessible selection and clear approval boundary.

### M6 — Durable approved import and artwork identification

**Outcome:** approved work survives interruption and retries without duplicate
artworks, visits, memberships, or repeated successful analysis.

- Extend/reuse existing batch orchestration with an explicit persisted lifecycle.
  Choose the minimal local/server checkpoint design; do not make a generic AI job
  framework a prerequisite. Record approved asset references, stage outcomes,
  durable server IDs, and bounded retry behavior.
- Add server-enforced, account-scoped idempotency for record creation and approval
  retries, including lost responses after a successful commit. Persist success
  before advancing. Handle duplicate taps and repeat scans of already imported
  assets without conflating them with different photographs of the same artwork.
- Use existing Session/SessionArtwork concepts for confirmed imported visits.
  Represent historical visit time separately from record creation time. Do not
  fabricate user chat or launch a companion response just to create a visit.
  Define duplicate-visit reconciliation and supported unknown-venue behavior.
- Preserve corrected/resolved locations during persistence; validate trusted server
  links and prevent stale resolution from replacing user decisions. Invoke venue
  resolution again only for new evidence, explicit recheck, or retryable failure.
- Run artwork identification after saving; keep saved photos when identification
  fails. Bound concurrency, surface quota/auth/network failures, and allow per-item
  retries without restarting successful items. Cancellation stops future work;
  already committed records remain visible.

**Exit tests:** terminate at each upload/link/analysis boundary; timeout after commit;
retry approval; duplicate tap; server restart; partial failure; auth refresh;
account switch; deleted local photo; repeated import; quota exhaustion; final
library and visit state verified after a cold start. Different shots remain separate.

### M7 — Integrated pilot and release gate

**Outcome:** a small real-user pilot validates the entire flow, including misses.

- Run held-out evaluation and physical-iPhone checks across supported devices,
  representative library sizes, Photos permission states, and network conditions.
- Measure time to first candidates, total scan time, review effort, accepted artwork
  count, corrections, and resume reliability. Document iCloud/download behavior.
- Verify lifecycle/accessibility, provider attribution/data handling, account
  isolation, and existing capture/edit/session regressions. Start with a controlled
  feature rollout that can stop new scans while preserving imported records.

**Release gate:** targets agreed in M2 are met on the held-out/device runs; all
approval, ownership, user-override, persistence, and duplicate-prevention cases pass;
known coverage limits are reflected in the UI. A successful labeling demo alone
does not satisfy this gate.

### M8 — Broader discovery after the first release

- Offer a broader on-device visual scan of remaining assets, prioritizing likely
  visits first. Permit non-museum and unknown-location artwork candidates.
- Evaluate attaching no-GPS camera photos bracketed by consistent visit evidence;
  exclude recognized screenshots and preserve the inference origin. Time proximity
  alone is insufficient, and conflicting/missing evidence must remain unresolved.
- Consider label pairing, duplicate-photo suggestions, visit maps, and nearby venue
  discovery only after the core metrics justify them. Automatic merging of multiple
  images into one artwork is a separate product decision.

## Measurement contract

Every evaluation report should show counts and denominators, not a single accuracy:

| Metric | Meaning |
| --- | --- |
| Metadata coverage | Share of permitted photos with usable original GPS and capture time |
| Candidate-stage artwork recall | Labeled artwork retained before visual filtering / all labeled artwork; also report the GPS-supported subset |
| Venue accuracy and coverage | Correct resolved venues / resolved cases, and resolved cases / evaluable cases; unknowns remain visible |
| Visit grouping quality | Incorrectly merged/split visits and incorrectly assigned photos against labeled visit membership |
| Detection precision/recall | Both within venue candidates and end-to-end against all labeled artworks |
| Review burden | Rejected suggestions, venue corrections, uncertain cases, and time spent selecting |
| Device/provider cost | Time to first results, throughput, memory, thermal behavior, downloads, external calls, and approved analysis usage |
| Import reliability | Completion/partial-failure rate, successful resume, and duplicates under injected retries |

Use a representative camera-roll sample to estimate real review burden. An
artwork-enriched dataset is useful for failure analysis but has different prevalence.
Report misses by reason: inaccessible asset, no GPS, no mapped venue, ambiguous
venue, grouping error, visual rejection, or provider/device failure.

## Decisions to close at implementation boundaries

| Decision | Deadline |
| --- | --- |
| MapKit integration, deployment support, retained fields, and public-place coverage | M1b |
| Effective capture-location schema and user-removal precedence | M1a, before migration |
| Gallery eligibility and identity matching without a shared provider ID | M1c/M3 |
| Quality thresholds, device/library sizes, and latency/resource budgets | M2, before tuning |
| Exact detector weights, license, training need, and supported-device performance | M4 |
| Historical Session dates, unknown-venue visits, and repeat-import reconciliation | M6 contract, before final M5 handoff |
| Local draft retention, approved job persistence, and cleanup on sign-out | M3/M6 contracts |

## Maintaining the roadmap

For each milestone, update status to planned, in progress, implemented awaiting
validation, or complete; link the PR and test evidence. Change agreed decisions
in place when scope changes. Do not mark a milestone complete from code alone
when its device/evaluation gate is pending. Each implementation task should cite
its milestone and bounded slice, and leave the next action clear here.

Provider references for M1: [Apple Maps capabilities](https://developer.apple.com/maps/),
[Apple place identifiers](https://developer.apple.com/documentation/MapKit/identifying-unique-locations-with-place-ids).
These support the integration direction; recheck the selected API's current
terms and availability when implementing it.
