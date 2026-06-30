# Musee Frontend-Web

A premium, immersive web experience for art curation and exploration. Built with React, TypeScript, and high-performance glassmorphic UI.

## Architecture Overview

The Musee web client is designed for visual immersion and high-speed interaction.

### Core Architecture

- **React + Vite**: Leverages Vite for near-instant HMR and optimized production builds.
- **Glassmorphic UI**: Custom CSS system focusing on backdrop blurs, semi-transparent layers, and fluid micro-animations.
- **State Composition**: Uses a mix of `useState`, `useRef` for DOM/Scroll management, and `useMemo` for expensive corridor layout calculations.

### API Services

- **`api/` + `session/api/`**: Modular API layers grouped by domain.
    - **Artwork / collection APIs** live under `api/`.
    - **Session-specific APIs** live under `session/api/`.
    - **Streaming analysis / chat** is handled through focused per-domain modules instead of a single shared file.

## Key Features

### 1. Batch Artwork Curation
Refactored for efficiency. When a user adds multiple pieces:
- Placeholder items appear in the corridor immediately with blurred previews.
- Background parallel processes analyze each piece without interrupting the user.
- UI gracefully transitions from "Analyzing Piece" to the full curated view.

### 2. Multi-Modal Interaction
- **Corridor View**: Horizontal snap-scroll experience.
- **Interpretation Modal**: Immersive side-by-side view with floating metadata overlays.
- **Topography View**: A spatial map of artworks based on AI-extracted keywords.

## Developer Manual

### Prerequisites
- Node.js 18+
- Backend server running (or proxy configured)

### 1. Local Setup
```bash
cd frontend-web
npm install
cp .env.example .env.local
```

### 2. Environment Variables
In `.env.local`:
- `VITE_API_URL`: URL of your backend (e.g., `http://localhost:8000/api`).

### 3. Development
```bash
npm run dev
```
The app will be available at `http://localhost:5173`.

### 4. Project Structure
```
frontend-web/
├── app-shell/           # App shell navigation, history coordination, and shell-level UI
│   ├── components/
│   └── hooks/
├── artist/              # Artist domain: artist pages, artist data hooks, and artist-specific UI
│   ├── components/
│   └── hooks/
├── artwork/             # Artwork domain: detail UI, analysis helpers, and artwork-specific hooks
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   └── types.ts
├── artwork-ingest/      # Shared upload/capture ingest flow, metadata, and location helpers
│   ├── hooks/
│   ├── lib/
│   └── types.ts
├── boards/              # Board domain: board state, CRUD orchestration, and board-specific hooks
│   ├── hooks/
│   └── types.ts
├── capture/             # Camera capture feature UI and interactions
│   └── components/
├── session/             # Session domain: API, hooks, helpers, and views
│   ├── api/
│   ├── hooks/
│   ├── lib/
│   └── components/
├── components/          # Shared or cross-domain UI components
│   ├── GalleryCard.tsx
│   └── TopographyView.tsx
├── types.ts             # Global TS interfaces
├── api/                # Shared backend API modules
├── session/api/        # Session-specific API modules
├── App.tsx              # App shell and top-level orchestration
└── index.css            # Global design tokens
```

## Deployment

Optimized for **Vercel**.
- **Edge Compatibility**: Designed to work with Vercel's edge network.
- **Image Optimization**: Leverages browser-native lazy loading and CSS blurs for smooth gallery experiences.

---
*Curating the past, present, and future of art.*
