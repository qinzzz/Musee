"""
Artwork identification accuracy evaluation.

Compares three config dimensions:
  model       — gpt | gemini | claude | None (vision-only)
  web_search  — provider-native search (OpenAI Responses API / Gemini grounding)
  google_vision — Google Cloud Vision Web Detection hints

Usage:
  set -a && source ../.env.local && set +a
  ENV=prod venv/bin/python eval/run_eval.py
  venv/bin/python eval/run_eval.py --configs gpt,gpt+vision,gemini+vision
  venv/bin/python eval/run_eval.py --limit 5 --concurrency 3

Env vars needed (in addition to standard .env.local):
  GOOGLE_VISION_API_KEY   — for google_vision configs

Results saved to eval/results/<timestamp>.json
"""

import asyncio
import argparse
import base64
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

import httpx

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config.settings import settings
from app.services.ai_service import ARTWORK_ANALYSIS_SCHEMA
from app.models.ai_job import AIJobType
from app.prompts.registry import ArtworkIdentificationPromptContext, render_prompt

DATASET_DIR = Path(__file__).parent / "dataset"
RESULTS_DIR = Path(__file__).parent / "results"


# ── Config ────────────────────────────────────────────────────────────────────

@dataclass
class EvalConfig:
    id: str
    model: Optional[str]          # "gpt" | "gemini" | "claude" | None
    web_search: bool = False
    google_vision: bool = False
    model_id: Optional[str] = None  # explicit API model ID; overrides client default

    def label(self) -> str:
        parts = []
        parts.append(self.model_id or self.model or "vision-only")
        if self.google_vision:
            parts.append("+vision")
        if self.web_search:
            parts.append("+web")
        return "".join(parts)


ALL_CONFIGS: list[EvalConfig] = [
    # Baselines — pinned snapshots for repeatable comparisons
    EvalConfig(id="gpt",           model="gpt",    web_search=False, google_vision=False, model_id="gpt-5.4"),
    EvalConfig(id="gemini",        model="gemini", web_search=False, google_vision=False, model_id="gemini-3-flash-preview"),
    EvalConfig(id="claude",        model="claude", web_search=False, google_vision=False, model_id="claude-sonnet-4-5"),
    EvalConfig(id="gpt+web",       model="gpt",    web_search=True,  google_vision=False, model_id="gpt-5.4"),
    EvalConfig(id="gemini+web",    model="gemini", web_search=True,  google_vision=False, model_id="gemini-3-flash-preview"),
    EvalConfig(id="vision-only",   model=None,     web_search=False, google_vision=True),
    EvalConfig(id="gpt+vision",    model="gpt",    web_search=False, google_vision=True,  model_id="gpt-5.4"),
    EvalConfig(id="gemini+vision", model="gemini", web_search=False, google_vision=True,  model_id="gemini-3-flash-preview"),
    EvalConfig(id="claude+vision", model="claude", web_search=False, google_vision=True,  model_id="claude-sonnet-4-5"),
    # Older model snapshots (for historical comparison)
    EvalConfig(id="gpt-4o",          model="gpt",    web_search=False, google_vision=False, model_id="gpt-4o"),
    EvalConfig(id="gpt-5.4",         model="gpt",    web_search=False, google_vision=False, model_id="gpt-5.4"),
    EvalConfig(id="gpt-5.4-mini",    model="gpt",    web_search=False, google_vision=False, model_id="gpt-5.4-mini"),
    EvalConfig(id="gemini-2.5-flash",  model="gemini", web_search=False, google_vision=False, model_id="gemini-2.5-flash"),
    EvalConfig(id="gemini-3-flash",      model="gemini", web_search=False, google_vision=False, model_id="gemini-3-flash-preview"),
    EvalConfig(id="gemini-3.1-pro",      model="gemini", web_search=False, google_vision=False, model_id="gemini-3.1-pro-preview"),
    EvalConfig(id="claude-sonnet-4",   model="claude", web_search=False, google_vision=False, model_id="claude-sonnet-4-20250514"),
    EvalConfig(id="claude-sonnet-4-5", model="claude", web_search=False, google_vision=False, model_id="claude-sonnet-4-5"),
    EvalConfig(id="claude-haiku-4-5",  model="claude", web_search=False, google_vision=False, model_id="claude-haiku-4-5"),
]

CONFIG_BY_ID = {c.id: c for c in ALL_CONFIGS}


# ── Google Vision ─────────────────────────────────────────────────────────────

# Generic Vision labels that add no signal — suppress hint injection when these are all we have
_GENERIC_VISION_LABELS = {
    "art", "painting", "modern art", "contemporary art", "visual arts", "fine art",
    "abstract art", "artwork", "illustration", "picture", "image", "drawing",
    "sculpture", "photograph", "photography", "ceiling fixture", "fluorescent lamp",
    "lighting", "floor", "room", "building", "architecture", "window", "facade",
    "audience", "mattress", "sheet", "bed", "anime", "manga",
}


def _is_generic(labels: list[str]) -> bool:
    """Return True if every label is a known generic term with no art-identification value."""
    if not labels:
        return True
    return all(l.lower().strip() in _GENERIC_VISION_LABELS for l in labels)


async def google_vision_web_detect(image_bytes: bytes, api_key: str) -> dict:
    """Call Google Cloud Vision Web Detection. Returns entities, best_guess, pages, and URLs."""
    b64 = base64.b64encode(image_bytes).decode()
    payload = {
        "requests": [{
            "image": {"content": b64},
            "features": [{"type": "WEB_DETECTION", "maxResults": 10}]
        }]
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://vision.googleapis.com/v1/images:annotate?key={api_key}",
            json=payload
        )
        resp.raise_for_status()
    web = resp.json()["responses"][0].get("webDetection", {})
    matching_pages = web.get("pagesWithMatchingImages", [])
    similar_images = web.get("visuallySimilarImages", [])
    return {
        "entities":       [e["description"] for e in web.get("webEntities", []) if e.get("description")],
        "best_guess":     [lbl["label"] for lbl in web.get("bestGuessLabels", [])],
        "page_titles":    [p["pageTitle"] for p in matching_pages if p.get("pageTitle")][:10],
        "matching_urls":  [p["url"] for p in matching_pages[:5]],
        "similar_urls":   [img["url"] for img in similar_images[:5]],
    }


def format_vision_hint(vision: dict) -> str:
    """Build hint string for LLM injection. Returns empty string if Vision has no useful signal."""
    entities   = vision.get("entities", [])
    best_guess = vision.get("best_guess", [])
    all_labels = best_guess + entities

    # Suppress hint entirely when Vision only returned generic terms
    if _is_generic(all_labels):
        return ""

    parts = []
    if best_guess:
        parts.append("Best guess: " + " | ".join(best_guess))
    # Only include entities that are not pure generics
    useful_entities = [e for e in entities if e.lower().strip() not in _GENERIC_VISION_LABELS]
    if useful_entities:
        parts.append("Web entities: " + ", ".join(useful_entities[:10]))
    if vision.get("page_titles"):
        parts.append("Matching page titles: " + " | ".join(vision["page_titles"][:5]))

    # URLs: prefer matching pages (exact image indexed), fall back to visually similar
    urls = vision.get("matching_urls") or vision.get("similar_urls", [])
    url_type = "Pages with this exact image" if vision.get("matching_urls") else "Visually similar images"
    if urls:
        parts.append(f"{url_type}:\n" + "\n".join(f"  {u}" for u in urls[:5]))
        parts.append("(You may visit these URLs for additional context — the URL paths and page content often reveal the artist or artwork name.)")

    return "\n".join(parts)


def parse_vision_only(vision: dict) -> dict:
    """Extract structured fields from Vision output without an LLM."""
    entities = vision.get("entities", [])
    best_guess = vision.get("best_guess", [])
    all_text = best_guess + entities

    # Heuristic: first entity is often artist or artwork name
    # Best guess labels tend to be most descriptive
    return {
        "artist": entities[0] if entities else "",
        "title": best_guess[0] if best_guess else (entities[1] if len(entities) > 1 else ""),
        "movement": "",
        "period_bucket": "",
        "_raw_entities":    entities[:8],
        "_raw_best_guess":  best_guess,
        "_raw_page_titles": vision.get("page_titles", [])[:5],
    }


# ── Scoring ───────────────────────────────────────────────────────────────────

def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").lower().strip())


def _fuzzy(a: str, b: str) -> float:
    return SequenceMatcher(None, _normalize(a), _normalize(b)).ratio()


def _contains(pred: str, truth: str) -> bool:
    p, t = _normalize(pred), _normalize(truth)
    return bool(t) and (t in p or p in t)


def score_field(predicted: str, truth: str, fuzzy_threshold: float = 0.8) -> dict:
    return {
        "exact": _normalize(predicted) == _normalize(truth),
        "fuzzy": _fuzzy(predicted, truth) >= fuzzy_threshold,
        "contains": _contains(predicted, truth),
    }


def score_vision_only(vision: dict, truth: dict) -> dict:
    """Check if truth values appear anywhere in entities, best_guess, or page titles."""
    all_text = " ".join(
        vision.get("best_guess", []) +
        vision.get("entities", []) +
        vision.get("page_titles", [])
    ).lower()
    def in_entities(val: str) -> bool:
        return bool(val) and _normalize(val) in all_text

    scores = {}
    if "artist" in truth:
        scores["artist"] = {"exact": False, "fuzzy": False, "contains": in_entities(truth["artist"])}
    if "title" in truth:
        scores["title"] = {"exact": False, "fuzzy": False, "contains": in_entities(truth["title"])}
    if "movement" in truth:
        scores["movement"] = {"exact": False, "fuzzy": False, "contains": False}
    return scores


def aggregate(results: list[dict]) -> dict:
    n = len(results)
    if not n:
        return {"n": 0}

    def avg(key_path: str) -> float:
        keys = key_path.split(".")
        vals = []
        for r in results:
            v = r
            for k in keys:
                v = (v or {}).get(k)
            if isinstance(v, bool):
                vals.append(float(v))
        return round(sum(vals) / n, 3) if vals else 0.0

    return {
        "n": n,
        "artist_exact":    avg("scores.artist.exact"),
        "artist_fuzzy":    avg("scores.artist.fuzzy"),
        "artist_contains": avg("scores.artist.contains"),
        "title_fuzzy":     avg("scores.title.fuzzy"),
        "title_contains":  avg("scores.title.contains"),
        "movement_exact":  avg("scores.movement.exact"),
        "movement_fuzzy":  avg("scores.movement.fuzzy"),
    }


# ── Model runners ─────────────────────────────────────────────────────────────

def _parse_response(text: str) -> dict:
    if not text:
        return {}
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    try:
        return json.loads(text)
    except Exception:
        return {}


# Claude's 5 MB limit is on the base64-encoded payload (b64 ≈ raw * 4/3).
# Safe raw ceiling: 5MB * 3/4 = 3.75 MB → use 3.7 MB to leave margin.
_CLAUDE_MAX_RAW = 3_700_000


def _normalize_for_claude(image_bytes: bytes) -> bytes:
    """Convert to JPEG and downscale if needed for Claude's API limits."""
    from PIL import Image
    import io

    img = Image.open(io.BytesIO(image_bytes))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    quality = 85
    while quality >= 40:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        data = buf.getvalue()
        if len(data) <= _CLAUDE_MAX_RAW:
            return data
        quality -= 15

    # Last resort: halve dimensions
    img = img.resize((img.width // 2, img.height // 2), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=75)
    return buf.getvalue()


async def _run_model(image_bytes: bytes, prompt: str, model_key: str, model_id: Optional[str] = None) -> dict:
    """Standard model call via existing AIService clients."""
    if model_key == "gpt":
        from app.services.openai_api_client import OpenAIAPIClient

        client = OpenAIAPIClient(model=model_id or settings.ai_model_power or "gpt-4o")
    elif model_key == "gemini":
        from app.services.gemini_api_client import GeminiAPIClient

        original_override = settings.ai_model_override
        if model_id:
            settings.ai_model_override = model_id
        try:
            client = GeminiAPIClient()
        finally:
            settings.ai_model_override = original_override
    elif model_key == "claude":
        from app.services.claude_api_client import ClaudeAPIClient

        # ClaudeAPIClient picks up AI_MODEL_OVERRIDE which may point at a non-Claude
        # model. Temporarily clear it so the client uses its DEFAULT_CLAUDE_MODEL.
        original_override = settings.ai_model_override
        settings.ai_model_override = model_id  # None → uses DEFAULT_CLAUDE_MODEL
        try:
            client = ClaudeAPIClient()
        finally:
            settings.ai_model_override = original_override
        image_bytes = _normalize_for_claude(image_bytes)
    else:
        raise ValueError(f"Unknown model: {model_key}")

    resp = await client.call_with_image_and_text(
        prompt=prompt,
        image_data=client.prepare_image(image_bytes),
        max_tokens=2000,
        temperature=0.1,
        response_schema=ARTWORK_ANALYSIS_SCHEMA,
    )
    return _parse_response(resp)


async def _run_gpt_web_search(image_bytes: bytes, prompt: str, model_id: str) -> dict:
    """
    OpenAI Responses API with web_search_preview tool.
    Uses the model pinned by the selected evaluation config.
    """
    b64 = base64.b64encode(image_bytes).decode()
    payload = {
        "model": model_id,
        "tools": [{"type": "web_search_preview"}],
        "input": [{
            "role": "user",
            "content": [
                {
                    "type": "input_image",
                    "image_url": f"data:image/jpeg;base64,{b64}"
                },
                {
                    "type": "input_text",
                    "text": prompt
                }
            ]
        }]
    }
    async with httpx.AsyncClient(timeout=60) as http:
        resp = await http.post(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()

    data = resp.json()
    for item in data.get("output", []):
        if item.get("type") == "message":
            for part in item.get("content", []):
                if part.get("type") == "output_text":
                    return _parse_response(part["text"])
    return {}


async def _run_gemini_web_search(image_bytes: bytes, prompt: str, model_id: str) -> dict:
    """Gemini with Google Search grounding."""
    from google.genai import types
    from app.config.settings import settings as app_settings
    from google import genai

    gclient = genai.Client(api_key=app_settings.gemini_api_key)
    image_part = types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")

    response = await gclient.aio.models.generate_content(
        model=model_id,
        contents=[prompt, image_part],
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
            temperature=0.1,
        ),
    )
    return _parse_response(response.text or "")


# ── Image loading ─────────────────────────────────────────────────────────────

async def load_image(item: dict) -> Optional[bytes]:
    if url := item.get("image_url"):
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.get(url)
                r.raise_for_status()
                return r.content
        except Exception as e:
            print(f"  [WARN] fetch failed for {item['id']}: {e}")
            return None

    if path := item.get("image_path"):
        full = Path(path) if Path(path).is_absolute() else DATASET_DIR / path
        if full.exists():
            return full.read_bytes()
        print(f"  [WARN] image not found: {full}")
        return None

    return None


# ── Main ──────────────────────────────────────────────────────────────────────

async def run_item(
    item: dict,
    config: EvalConfig,
    image_bytes: bytes,
    vision_result: Optional[dict],
    base_prompt: str,
) -> dict:
    gt = item["ground_truth"]
    predicted: dict = {}
    error: Optional[str] = None

    try:
        if config.model is None:
            # Vision-only: parse entities directly
            predicted = parse_vision_only(vision_result or {})
            scores = score_vision_only(vision_result or {}, gt)
        else:
            # Build prompt, optionally inject vision hint
            prompt = base_prompt
            if config.google_vision and vision_result:
                hint = format_vision_hint(vision_result)
                if hint:
                    prompt = f"HINT — web image search result:\n{hint}\n\nUse these as strong initial clues, but verify against the image.\n\n{prompt}"

            if config.web_search:
                if config.model == "gpt":
                    predicted = await _run_gpt_web_search(image_bytes, prompt, config.model_id)
                elif config.model == "gemini":
                    predicted = await _run_gemini_web_search(image_bytes, prompt, config.model_id)
                else:
                    # Claude has no native web search API
                    return {
                        "item_id": item["id"],
                        "config_id": config.id,
                        "skipped": True,
                        "reason": "web_search not supported for claude",
                    }
            else:
                predicted = await _run_model(image_bytes, prompt, config.model, config.model_id)

            scores = {}
            if "artist" in gt:
                scores["artist"] = score_field(predicted.get("artist", ""), gt["artist"])
            if "title" in gt:
                scores["title"] = score_field(predicted.get("title", ""), gt["title"], fuzzy_threshold=0.7)
            if "movement" in gt:
                scores["movement"] = score_field(predicted.get("movement", ""), gt["movement"])

    except Exception as e:
        error = str(e)
        scores = {
            "artist":   {"exact": False, "fuzzy": False, "contains": False},
            "movement": {"exact": False, "fuzzy": False, "contains": False},
        }
        if "title" in item["ground_truth"]:
            scores["title"] = {"exact": False, "fuzzy": False, "contains": False}

    return {
        "item_id":      item["id"],
        "config_id":    config.id,
        "difficulty":   item.get("difficulty", "unknown"),
        "ground_truth": gt,
        "predicted":    predicted,
        "scores":       scores,
        "error":        error,
    }


def print_summary_table(summary: dict[str, dict]) -> None:
    cols = ["artist_contains", "artist_fuzzy", "title_contains", "title_fuzzy", "movement_exact"]
    header = f"{'config':<22}" + "".join(f"{c:>17}" for c in ["n", *cols])
    print("\n" + "=" * (22 + 17 * (len(cols) + 1)))
    print(header)
    print("-" * (22 + 17 * (len(cols) + 1)))
    for cfg_id, agg in sorted(summary.items()):
        row = f"{cfg_id:<22}" + f"{agg.get('n', 0):>17}"
        for c in cols:
            val = agg.get(c, 0)
            row += f"{val:>17.1%}"
        print(row)
    print("=" * (22 + 17 * (len(cols) + 1)) + "\n")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--configs", help="Comma-separated config IDs (default: all). "
                        f"Available: {', '.join(CONFIG_BY_ID)}")
    parser.add_argument("--limit", type=int, default=0, help="Max items per config (0 = all)")
    parser.add_argument("--concurrency", type=int, default=3, help="Parallel item runs per config")
    parser.add_argument("--dry-run", action="store_true", help="Load manifest and print plan, no API calls")
    args = parser.parse_args()

    # Select configs
    if args.configs:
        selected = []
        for cid in args.configs.split(","):
            cid = cid.strip()
            if cid not in CONFIG_BY_ID:
                print(f"Unknown config: {cid}. Available: {list(CONFIG_BY_ID)}")
                sys.exit(1)
            selected.append(CONFIG_BY_ID[cid])
    else:
        selected = ALL_CONFIGS

    # Check required env vars
    vision_api_key = os.environ.get("GOOGLE_VISION_API_KEY")
    needs_vision = any(c.google_vision for c in selected)
    if needs_vision and not vision_api_key:
        print("WARN: GOOGLE_VISION_API_KEY not set — vision configs will fail")

    # Load dataset
    manifest_path = DATASET_DIR / "manifest.json"
    if not manifest_path.exists():
        print(f"No manifest found at {manifest_path}")
        sys.exit(1)

    with open(manifest_path) as f:
        manifest = json.load(f)

    items = manifest["items"]
    # Skip items with no ground truth filled in yet
    items_with_gt = [i for i in items if any(i.get("ground_truth", {}).values())]
    items_pending = len(items) - len(items_with_gt)
    items = items_with_gt

    if args.limit:
        items = items[: args.limit]

    print(f"Dataset: {len(items)} items with ground truth ({items_pending} pending, skipped)")
    print(f"Configs: {[c.id for c in selected]}")

    if args.dry_run:
        return

    # Pre-load images
    print("\nLoading images...")
    image_cache: dict[str, Optional[bytes]] = {}
    for item in items:
        image_cache[item["id"]] = await load_image(item)

    # Pre-fetch Vision results for items that need it
    vision_cache: dict[str, Optional[dict]] = {}
    if needs_vision and vision_api_key:
        print("Running Google Vision Web Detection...")
        for item in items:
            img = image_cache.get(item["id"])
            if img:
                try:
                    vision_cache[item["id"]] = await google_vision_web_detect(img, vision_api_key)
                except Exception as e:
                    print(f"  [WARN] Vision failed for {item['id']}: {e}")
                    vision_cache[item["id"]] = None

    # Load base identification prompt once
    base_prompt = render_prompt(AIJobType.ARTWORK_IDENTIFICATION, ArtworkIdentificationPromptContext())

    # Run configs
    all_results: list[dict] = []
    sem = asyncio.Semaphore(args.concurrency)

    async def bounded(item, config):
        async with sem:
            img = image_cache.get(item["id"])
            if not img:
                return {"item_id": item["id"], "config_id": config.id, "skipped": True, "reason": "no image"}
            vision = vision_cache.get(item["id"]) if config.google_vision else None
            return await run_item(item, config, img, vision, base_prompt)

    for config in selected:
        print(f"\n[{config.id}] running {len(items)} items...")
        t0 = time.time()
        tasks = [bounded(item, config) for item in items]
        results = await asyncio.gather(*tasks)
        elapsed = time.time() - t0

        ok = [r for r in results if not r.get("skipped") and not r.get("error")]
        skipped = [r for r in results if r.get("skipped")]
        errors = [r for r in results if r.get("error")]
        print(f"  done in {elapsed:.1f}s — {len(ok)} ok, {len(skipped)} skipped, {len(errors)} errors")
        if errors:
            for r in errors[:3]:
                print(f"    ERROR {r['item_id']}: {r['error']}")

        all_results.extend(results)

    # Aggregate + display
    summary: dict[str, dict] = {}
    for config in selected:
        cfg_results = [r for r in all_results if r.get("config_id") == config.id and not r.get("skipped") and not r.get("error")]
        summary[config.id] = aggregate(cfg_results)

    print_summary_table(summary)

    # Save results
    RESULTS_DIR.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = RESULTS_DIR / f"{ts}.json"
    with open(out_path, "w") as f:
        json.dump(
            {
                "timestamp": ts,
                "configs": [c.id for c in selected],
                "n_items": len(items),
                "summary": summary,
                "results": all_results,
            },
            f,
            indent=2,
        )
    print(f"Results saved to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
