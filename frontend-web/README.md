# Musee Frontend-Web

A premium, immersive web experience for art curation and exploration. Built with React, TypeScript, and high-performance glassmorphic UI.

## Architecture Overview

The Musee web client is designed for visual immersion and high-speed interaction.

### Core Architecture

- **React + Vite**: Leverages Vite for near-instant HMR and optimized production builds.
- **Glassmorphic UI**: Custom CSS system focusing on backdrop blurs, semi-transparent layers, and fluid micro-animations.
- **State Composition**: Uses a mix of `useState`, `useRef` for DOM/Scroll management, and `useMemo` for expensive corridor layout calculations.

### API Services

- **`apiService.ts`**: The central communication hub.
    - **Standard Analysis**: Used for fast, parallel batch uploads.
    - **Streaming Analysis**: Uses Server-Sent Events (SSE) for real-time consultation with the AI Curator.
    - **Persistence**: Automatically manages browser-specific `localStorage` User IDs.

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
├── components/          # Reusable UI components
│   ├── InterpretationModal.tsx
│   ├── GalleryCard.tsx
│   └── TopographyView.tsx
├── types.ts             # Global TS interfaces
├── apiService.ts        # Backend communication layer
├── App.tsx              # Main orchestrator
└── index.css            # Global design tokens
```

## Deployment

Optimized for **Vercel**.
- **Edge Compatibility**: Designed to work with Vercel's edge network.
- **Image Optimization**: Leverages browser-native lazy loading and CSS blurs for smooth gallery experiences.

---
*Curating the past, present, and future of art.*
