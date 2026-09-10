# Musee iOS Client

This is the engineering guide for Musee's React Native + Expo iOS client. It
documents the mobile architecture that is implemented today and the boundaries
new code should follow.

Its primary readers are mobile engineers, coding agents, and PR reviewers. It
is not a feature roadmap, a branch handoff, or a chronological work log. The
long-term direction and current milestone live in
[`IOS_MIGRATION.md`](../IOS_MIGRATION.md); keep temporary debugging notes in the
relevant task or PR.

## Core rule: share logic, never UI

The web app is the mature product and a place to validate product behavior, but
its components, DOM assumptions, and navigation are not reused on iOS.

- `packages/client-core/` contains stable, device-agnostic TypeScript contracts
  and logic used by both clients.
- `frontend-mobile/` owns React Native UI, Expo integrations, navigation, and
  mobile orchestration.
- `frontend-web/` owns browser UI and browser-specific integrations.
- `backend/` remains the shared JSON/SSE API and system of record.

Code in `client-core` must not import React Native, Expo, browser globals, DOM
types, `localStorage`, SecureStore, or bundler-specific environment APIs. Pass
platform behavior through a typed interface or compose it in each client's
runtime. Promote logic into the core only after its contract is stable and a
second client can genuinely use it.

## Mobile structure

The mobile client is organized by product domain and platform boundary:

| Path | Responsibility |
| --- | --- |
| `src/app/` | Expo Router routes and screen composition |
| `src/api/runtime.ts` | Composition root for configuration, API clients, services, and adapters |
| `src/api/queryClient.ts` | TanStack Query policy for cached server reads and mobile lifecycle refresh |
| `src/auth/` | Native authentication session and credential ownership |
| `src/capture/` | Image intake, upload, and artwork-analysis workflow |
| `src/library/` | Artwork library and artwork-detail data |
| `src/navigation/` | Global floating tab bar and navigation presentation |
| `src/collection/` | Collection sub-tabs and artwork browsing composition |
| `src/artists/` | Artist browsing, profiles, and paginated saved works |
| `src/museums/` | Museum browsing and paginated captured artworks |
| `src/boards/` | Board organization, membership, and cached board reads |
| `src/journals/` | Account-scoped journal reads and calendar-date presentation |
| `src/settings/` | Settings screen, account usage reads, and usage presentation |
| `src/session/` | Persistent visit sessions and streamed responses |
| `src/platform/` | Expo-backed storage, image, and media adapters |
| `src/ui/` | Reusable native UI primitives and design tokens |

Keep route files focused on navigation and composition. HTTP details belong in
transports, multi-step behavior belongs in domain services or hooks, and Expo
APIs belong behind platform adapters. UI code should not call SecureStore or
construct authenticated network requests directly.

## Navigation and presentation

The global shell has three icon-only tabs: Home, Collection, and Profile.
`navigation/FloatingTabBar` renders a floating capsule above the bottom safe
area and hides while the keyboard is open. `GlassSurface` and
`GlassIconButton` provide native Liquid Glass when available, with a neutral
fallback. The palette is white with neutral gray borders and secondary text.

Home uses the Session composer in its centered start state. Submission passes
text and attachments through the authenticated tree's in-memory
`SessionDraftProvider`, consumed once by the deeper Session route; it does not
put private draft content in URL parameters. The top-left history button opens
the full Session list. Collection owns All Artworks, Artists, Museums, and Boards
sub-tabs with a fixed upload button beside the scrollable labels. Profile shows
a persistent top-right Settings gear and a read-only list of journal dates, reflections, and
up to two representative artwork images with the web's overlapping-pair layout.
Deleted/missing artworks retain text placeholders; failed image loads are hidden.
Journals use the shared journal service and account-scoped Query cache with focus,
foreground, and pull-to-refresh revalidation. Failed refreshes keep saved entries
visible. The backend generates journals overnight; native has no generation action
or individual journal route. Cold starts refetch saved entries from the backend.

Artwork detail, artist profiles, individual boards, upload, history, and active Sessions are
stack screens outside the global tabs. They show local navigation/actions;
Collection's sub-tabs and upload action do not appear there. The legacy board
index route redirects to Collection's Boards tab.

Settings is a dedicated stack screen outside the tabs, with account email, usage,
and Sign out. It is the home for future preferences; Profile remains for insights.
Web and native share the account usage API and quota filtering in `client-core`.
Usage is read-only and backend-owned: show metered uploads, storage, and AI usage,
or Unlimited plan when no quotas are metered. Native reads refresh on focus,
foreground, and pull-to-refresh; failed refreshes preserve previous data and expose
retry. Limit reset instants are displayed in device local time. Account-scoped
query keys and the auth cache-clear lifecycle isolate usage between accounts.

## Runtime and networking

`src/api/runtime.ts` is the mobile composition root. It creates one shared API
client, attaches the mobile auth refresh behavior, and passes that client into
domain transports and services. `packages/client-core` provides the base API
client and shared parsers; mobile owns the `expo/fetch` transport and runtime
configuration.

The iOS Simulator uses `http://127.0.0.1:8000/api` by default. A physical iPhone
cannot use the Mac's loopback address, so start the backend on `0.0.0.0` and set
the API URL to the Mac's LAN address before starting Metro:

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# From the repository root, in another terminal
EXPO_PUBLIC_API_URL=http://192.168.1.10:8000/api npm run mobile:start
```

The phone and Mac must be on the same reachable network. Preview and production
builds require an explicit HTTPS API URL and `EXPO_PUBLIC_APP_ENV=preview` or
`production`.

## Server state and revalidation

TanStack Query owns cached server reads. Query keys include the authenticated
user ID, paginated lists use infinite queries, and successful mutations update
visible records before invalidating the related query for server revalidation.
The shared query client treats records as fresh for 30 seconds, retains inactive
queries in memory for 30 minutes, retries transient failures twice, and connects
React Native `AppState` changes to foreground refetching.

The cache is a disposable client view; the backend remains authoritative. It is
not an offline database and does not queue writes. UI-only state such as a
Library scroll offset remains outside TanStack Query. Clear the query cache when
authentication ends so one account's data cannot appear in another account.

Multi-select Library intake uses the platform-neutral batch lifecycle in
`@musee/client-core`: persist every valid selection first, then analyze each
persisted artwork. Successful items remain saved when another item fails, and
the failed upload or analysis stage can be retried independently. Native code
owns Photos selection, previews, progress presentation, and Library cache
invalidation.

## Artists

Web and native use `client-core/artists.ts` for artist contracts and reads. Native
queries are account-scoped and refresh on focus, foreground, and pull-to-refresh.
Artist cards request three artwork previews; detail screens page through saved
works. The backend preserves the legacy artwork array response unless `limit`
is supplied, which returns an items/total/offset/limit envelope. Artwork details
link existing artist entity IDs; browsing does not trigger legacy artist backfill
or biography generation. Missing profiles and request failures have explicit states.

## Museums

Web and native share `client-core/museums.ts`. Museums group active saved artworks
by their existing recognized capture venue, without generating associations during
browsing. Native search filters the museum summaries; cards use venue thumbnails
and attribution without per-card API calls. Detail reuses the summaries and loads
artworks in server pages of 30, newest saved first. Queries are account-scoped and
refresh on focus, foreground, and pull-to-refresh. The existing summary endpoint
still includes all associated artwork IDs; only detail artwork records are paged.

## Boards

Boards use the existing backend `collections` records. Both clients use
`client-core/boards.ts` for the contract and API operations; native composition
lives in `src/boards/`. Board list/detail and paginated artwork pages are cached
under account-scoped TanStack Query keys, refreshed on screen focus,
foregrounding, and pull-to-refresh. Writes are server-confirmed, expose pending
and result toasts, and update/invalidate related cached reads.

Membership changes send add/remove deltas to the existing update endpoint.
The backend locks the board row and applies deltas to its current membership,
so another client's additions are preserved. Removing membership or deleting a
board does not delete saved artwork. Artwork contents load in pages of 30;
the board list contract still returns lightweight member IDs, not full artwork
records. The reusable Library artwork picker supports both Session composition
and Boards; only Sessions impose the five-item and analysis-readiness rules.

## Authentication and secure storage

Native and web clients use the same backend identity but different credential
transport:

- iOS identifies itself with `X-Client-Platform: ios`.
- The backend returns the rotating refresh token in the native auth response.
- iOS stores only that refresh token in Keychain through Expo SecureStore.
- The short-lived access token stays in the API client's memory.
- Refresh and logout send the refresh token through `X-Refresh-Token`.
- Web continues to use its HttpOnly refresh-cookie flow.

`src/platform/storage/secureStorage.ts` is the low-level SecureStore adapter.
The auth credential store owns auth-specific keys and policy. Add another
domain-specific store when a future secret needs persistence; do not turn
SecureStore into an untyped global bag or let screens manage keys directly.

### Email signup and verification

The signed-out login screen offers Create an account and routes to `/sign-up`.
Native validates email, the backend's eight-character password minimum, and password
confirmation, then calls the existing unauthenticated signup endpoint. Signup does
not establish a native session: the user opens the emailed browser verification
page, returns to iOS, and signs in normally. Only verified accounts can sign in.

Resend repeats signup for the pending email/password after a 60-second cooldown,
matching the backend's replacement-link behavior. Recovery and signup share the
deadline-based email cooldown hook and respect server throttle intervals. Passwords
remain only in screen memory for resend; leaving/restarting requires re-entry.
An `email_sent: false` response shows delivery failure rather than inbox confirmation.
Existing verified accounts get a sign-in prompt. Validate actual delivery and the
phone/browser round trip against the same backend environment before release.

### Password recovery

The signed-out login screen links to `/forgot-password`. Native requests an
emailed reset link through the unauthenticated auth HTTP client, with validation,
duplicate-submit protection, generic account-existence messaging, and retry/throttle
errors. The existing web page handles the token and new password; users then return
to iOS and sign in normally. Reset tokens and passwords are not passed through
native route parameters. No native dependency or deep-link registration is required.

Successful password resets revoke prior refresh sessions for that account before
issuing the recovery session. Existing access JWTs retain their configured lifetime
(15 minutes by default); they cannot renew afterward. Validate actual email delivery,
browser reset, and subsequent iOS sign-in against the same backend environment.

### Google sign-in configuration

Native Google sign-in uses `@react-native-google-signin/google-signin` for
credential acquisition and the existing `/auth/google` backend for Musee tokens.
The Google ID token is sent only to that endpoint; only the Musee refresh token
is retained by our credential store. Restoration uses Musee refresh, never silent
Google login. The SDK's cached sign-in is cleared after the exchange, on failure,
and during logout. Cancellation returns to the sign-in form without an error.

Create an iOS OAuth client in the same Google Cloud project as the existing web
client, registered for `com.yujingtang.musee.dev` (or the bundle ID of the target
build). Copy `frontend-mobile/.env.example` to `.env.local` and set:

- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` to that iOS client ID;
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to the web client ID accepted by the backend's
  `GOOGLE_CLIENT_ID`.

These are public client IDs, not secrets. Do not include an OAuth client secret.
`app.config.js` derives the reversed iOS client URL scheme and applies the SDK's
Expo config plugin. Supplying only one client ID fails configuration validation;
leaving both unset keeps email-only builds available. An old development binary
without the SDK also keeps email login available. The Google button stays visible;
if its configuration or native SDK is missing, tapping it shows an explicit error.

After installing dependencies and setting the IDs, regenerate native configuration
and rebuild; a Metro reload cannot add the native SDK or its callback scheme:

```bash
cd frontend-mobile
npx expo prebuild --platform ios
npx expo run:ios --device
```

Keep the same environment values when restarting Metro. If Google's consent
screen is restricted to test users, the device account must be allowed in that
project. Validate account selection and cancellation, returning web users' existing
data, sign-out, token refresh, and cold-start restoration on an iPhone. Verify
email login still works. See the SDK's
[Expo setup guide](https://react-native-google-signin.github.io/docs/setting-up/expo).

## Artwork image lifecycle

An image can temporarily exist in several places, each with a different role:

1. Camera or photo-picker output is the local input used for preview and upload.
2. A photo captured inside Musee is also saved to the user's Photos library
   after permission is granted. Photos is user-owned media, not app state.
3. The uploaded cloud image referenced by the artwork record is authoritative
   across devices.
4. Expo's image cache is a best-effort performance layer and may be evicted.

The app must remain correct when its local cache is empty. It should render the
local input immediately during intake, then use the server-backed artwork URI
for durable library and detail views.

Artwork records expose an authoritative `photo_uri` and a nullable cloud
`thumbnail_uri`. Library and Session cards prefer the thumbnail and fall back
to the primary image for legacy records. Detail views and AI analysis continue
to use the primary image. Do not treat an Expo cache key as a persisted image
or database reference.

## Persistent sessions

Existing Sessions expose the native glass toolbar menu for editing the name and
session goal and for confirmed deletion. Edits use the canonical title and goal
endpoints with explicit Save/Cancel; a partial failure retains the form for retry.
Deleting a Session preserves its library artworks. Management actions are disabled
while a response is being sent. The backend includes the latest persisted goal
in subsequent chat turns for both clients; it does not rewrite prior events.

The native Session flow uses the shared contracts and preserves events on the
backend. Text and artwork events use the canonical `event_type` field. Session
open fetches both the event timeline and linked artwork records so artwork cards
can be reconstructed with cloud thumbnails after a cold start.

For a new text message, the ordering is intentional:

1. Create or update the Session and persist the user event.
2. Persist a pending model-response event.
3. Stream the model response over SSE and update the in-memory UI.
4. Replace the pending event with a completed or failed persisted event.

The response stream receives only the persisted `session_id` and
`trigger_event_id`. The backend reconstructs conversation history, linked
artworks, current-artwork priority, and any model-facing fallback instruction.
Do not construct hidden AI prompts in the native client.

Session composition accepts up to five ordered Camera, Photos, and Library
attachments with optional text. It uses `mobileSessionContextService`, composed
in `api/runtime.ts`, rather than orchestration in the screen:

1. Resolve each input to a durable artwork reference (upload or validate a Library reference).
2. Create/reuse the Session and link its artworks.
3. Append one ordered user event and its pending response in one backend transaction.
4. Enrich each reference that still needs analysis.
5. Generate one response from the persisted turn.

`client-core/sessionContext.ts` owns the typed resolve → commit → enrich
lifecycle, per-entry progress, cancellation between stages, and retry
checkpoints. The adapter owns media operations and canonical event persistence;
the backend owns prompt construction. Web and mobile use the same artwork
context payload builder; web still owns its existing batch orchestration.

The generic job accepts typed input/resolved unions. Adding an artist, tag, or
document requires a concrete resolver/enricher and a supported backend event
contract and context renderer. Do not encode those entities as fake artworks or
add speculative generic payload fields. Only artwork adapters are implemented
today.

Successful resolutions and enrichments are retained during retries. The
response waits for all selected context to be ready; unlike web's automatic
partial continuation, failures are explicit and individually retryable.
Event retries reuse stable IDs, and user/pending events are committed together.
Upload request IDs are stable within a job, but the upload endpoint does not
guarantee deduplication after an unknown network outcome.

Jobs are in memory, not an offline queue. Leaving stops subsequent preparation
stages but does not undo an in-flight request or remove saved artworks.
Uncommitted drafts do not survive termination. Once the turn is committed, its
pending response can be restored and retried: the service re-reads durable
references and finishes outstanding analysis before generation.

On open or cold start, the client fetches the Session and its events from the
backend. Interrupted pending/failed responses remain visible and retryable.
Never make the streamed in-memory text the only copy of a completed response.

## Development workflow

Install workspace dependencies from the repository root, then create the native
development build:

```bash
npm install
cd frontend-mobile
npx expo run:ios
```

For normal TypeScript and React Native changes, keep the installed development
client and run Metro from the repository root:

```bash
npm run mobile:start
```

Metro is the React Native equivalent of the web development bundler: it sends
the JavaScript bundle to the installed app and provides Fast Refresh. Re-run
`npx expo run:ios` after adding or changing native dependencies, entitlements,
plugins, or native configuration. A normal TypeScript/UI edit only needs Metro.

## Verification

Run the automated mobile checks from the repository root:

```bash
npm run typecheck
npm run test:run --workspace frontend-mobile
```

Use the Simulator for routine UI, navigation, auth, persistence, and network
iteration. Before merging device-sensitive behavior, test a development build
on a physical iPhone, especially camera capture, Photos permissions, Keychain,
local-network connectivity, app backgrounding, and cold starts.

For a new mobile capability, verify that:

- shared pure logic has focused tests in `client-core` when appropriate;
- mobile services and transports are tested without rendering screens;
- loading, empty, offline/error, retry, and restored states are intentional;
- no browser UI or browser-only runtime assumption crossed into mobile code;
- the feature still works after the app is fully terminated and reopened when
  persistence is part of its contract.
