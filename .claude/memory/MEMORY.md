# Musee — Claude Code Memory

See [CLAUDE.md](/Users/qinzzz/Musee/CLAUDE.md) for project overview, key files, and commands.

## Active Feature State
- Streaming artwork analysis (SSE: chunk → complete → metrics)
- Google OAuth + anonymous user migration
- Language toggle (EN/中文) via localStorage `musee_language`
- Corridor view (horizontal scroll) + Topography view (spatial tags)
- Exhibition curator chat (multi-artwork context)
- Tag explanations with backend caching
- Visit/session grouping
- Image upload with EXIF date + geolocation

## User Preferences
- No new .md files unless asked; prepend to CHANGE_LOG.md for important changes
- Keep solutions simple, avoid over-engineering
- Check existing code before adding features (e.g., backend already had `language` param)
- **Do not use worktrees** — work directly in `/Users/qinzzz/Musee/`

## Detail Files
- [project.md](project.md) — Full architecture, component inventory, DB models, SSE protocol
- [lessons.md](lessons.md) — Gotchas, fixes, patterns learned
- [sessions.md](sessions.md) — Rolling log of recent sessions
