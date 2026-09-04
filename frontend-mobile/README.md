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
| `src/auth/` | Native authentication session and credential ownership |
| `src/capture/` | Image intake, upload, and artwork-analysis workflow |
| `src/library/` | Artwork library and artwork-detail data |
| `src/session/` | Persistent visit sessions and streamed responses |
| `src/platform/` | Expo-backed storage, image, and media adapters |
| `src/ui/` | Reusable native UI primitives and design tokens |

Keep route files focused on navigation and composition. HTTP details belong in
transports, multi-step behavior belongs in domain services or hooks, and Expo
APIs belong behind platform adapters. UI code should not call SecureStore or
construct authenticated network requests directly.

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

For camera and Photos input, the client uploads the artwork first, links it to
the open Session (or atomically starts a new Session around it), persists the
artwork-bearing user event, completes analysis, and then follows the same
pending/stream/completion sequence. Upload, Session persistence, analysis, and
model generation expose separate retryable phases. A retry resumes from the
last durable boundary instead of uploading the image again.

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
