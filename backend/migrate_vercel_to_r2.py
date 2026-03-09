#!/usr/bin/env python3
"""
Migration script: Vercel Blob Storage → Cloudflare R2

Steps:
  1. List all blobs in the Vercel store
  2. Download each blob
  3. Re-upload to R2 with the same key path
  4. Update photo_uri in the DB for every affected SavedArtwork row

Usage:
  cd backend
  python migrate_vercel_to_r2.py           # live run (dev DB)
  python migrate_vercel_to_r2.py --dry-run # preview only, no writes
  python migrate_vercel_to_r2.py --env prod # target prod DB
"""

import argparse
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import boto3
import httpx
from botocore.config import Config
from dotenv import dotenv_values
from sqlalchemy import create_engine, text

# ─── Load env ────────────────────────────────────────────────────────────────

ROOT = Path(__file__).parent.parent  # repo root

def load_env(env: str) -> dict:
    """Merge env files the same way settings.py does (later overrides earlier)."""
    files = [ROOT / ".env", ROOT / ".env.local"]
    if env == "dev":
        files.append(ROOT / ".env.development.local")
    # Read all, later files win
    merged = {}
    for f in files:
        if f.exists():
            merged.update(dotenv_values(f))
    return merged


# ─── Vercel Blob helpers ──────────────────────────────────────────────────────

VERCEL_API = "https://blob.vercel-storage.com"
VERCEL_HEADERS = lambda token: {
    "Authorization": f"Bearer {token}",
    "x-api-version": "7",
}


def list_all_blobs(token: str) -> list[dict]:
    """Page through the Vercel Blob list API and return all blob objects."""
    blobs = []
    cursor = None
    with httpx.Client(timeout=30) as client:
        while True:
            params = {"limit": 1000}
            if cursor:
                params["cursor"] = cursor
            resp = client.get(VERCEL_API, headers=VERCEL_HEADERS(token), params=params)
            resp.raise_for_status()
            data = resp.json()
            blobs.extend(data.get("blobs", []))
            if not data.get("hasMore"):
                break
            cursor = data.get("cursor")
    return blobs


def extract_key_from_vercel_url(url: str) -> str:
    """
    Convert a Vercel Blob URL to a storage key (path).

    e.g. https://xxxx.public.blob.vercel-storage.com/artworks/user/file.jpg
      → artworks/user/file.jpg
    """
    parsed = urlparse(url)
    # pathname starts with '/'
    return parsed.path.lstrip("/")


def download_blob(url: str, token: str) -> bytes:
    # Strip ?download=1 — the CDN serves the raw file without it
    clean_url = url.split("?")[0]
    with httpx.Client(timeout=60, follow_redirects=True) as client:
        # Try without auth first (CDN rejects Bearer on public URLs)
        resp = client.get(clean_url)
        if resp.status_code == 403:
            # Fall back: go through the Vercel Blob API proxy
            resp = client.get(
                "https://blob.vercel-storage.com",
                params={"url": clean_url},
                headers=VERCEL_HEADERS(token),
            )
        resp.raise_for_status()
        return resp.content


# ─── R2 helpers ───────────────────────────────────────────────────────────────

def make_r2_client(env_vars: dict):
    account_id = env_vars.get("R2_ACCOUNT_ID", "")
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=env_vars.get("R2_ACCESS_KEY_ID", ""),
        aws_secret_access_key=env_vars.get("R2_SECRET_ACCESS_KEY", ""),
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def content_type_for(key: str) -> str:
    ext = key.rsplit(".", 1)[-1].lower() if "." in key else "jpg"
    return {"png": "image/png", "webp": "image/webp"}.get(ext, "image/jpeg")


def upload_to_r2(client, bucket: str, key: str, data: bytes) -> None:
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=data,
        ContentType=content_type_for(key),
    )


def r2_key_exists(client, bucket: str, key: str) -> bool:
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except client.exceptions.ClientError:
        return False
    except Exception:
        return False


# ─── DB helpers ───────────────────────────────────────────────────────────────

def make_engine(env_vars: dict, target_env: str):
    if target_env == "prod":
        url = env_vars.get("NEON_DATABASE_URL_PROD") or env_vars.get("NEON_DATABASE_URL")
    else:
        url = env_vars.get("NEON_DATABASE_URL_DEV") or env_vars.get("NEON_DATABASE_URL")
    if not url:
        raise ValueError(f"No database URL found for env={target_env}")
    return create_engine(url)


def find_artworks_with_vercel_urls(engine) -> list[tuple[str, str]]:
    """Return [(id, photo_uri)] for all rows with a Vercel Blob URL."""
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT id, photo_uri FROM saved_artworks "
                "WHERE photo_uri LIKE '%blob.vercel-storage.com%'"
            )
        ).fetchall()
    return [(r[0], r[1]) for r in rows]


def update_photo_uri(engine, artwork_id: str, new_uri: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE saved_artworks SET photo_uri = :uri WHERE id = :id"),
            {"uri": new_uri, "id": artwork_id},
        )


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Migrate Vercel Blob → Cloudflare R2")
    parser.add_argument("--dry-run", action="store_true", help="Preview only, no writes")
    parser.add_argument("--env", choices=["dev", "prod"], default="dev", help="Target DB env (default: dev)")
    args = parser.parse_args()

    dry = args.dry_run
    prefix = "[DRY RUN] " if dry else ""

    print(f"{'='*60}")
    print(f"Vercel Blob → R2 Migration  (env={args.env}, dry_run={dry})")
    print(f"{'='*60}\n")

    env_vars = load_env(args.env)

    blob_token = env_vars.get("BLOB_READ_WRITE_TOKEN")
    r2_bucket  = env_vars.get("R2_BUCKET_NAME")
    r2_pub_url = (env_vars.get("R2_PUBLIC_URL") or "").rstrip("/")

    missing = [k for k, v in [
        ("BLOB_READ_WRITE_TOKEN", blob_token),
        ("R2_ACCOUNT_ID",        env_vars.get("R2_ACCOUNT_ID")),
        ("R2_ACCESS_KEY_ID",     env_vars.get("R2_ACCESS_KEY_ID")),
        ("R2_SECRET_ACCESS_KEY", env_vars.get("R2_SECRET_ACCESS_KEY")),
        ("R2_BUCKET_NAME",       r2_bucket),
        ("R2_PUBLIC_URL",        r2_pub_url),
    ] if not v]
    if missing:
        print(f"ERROR: Missing env vars: {', '.join(missing)}")
        sys.exit(1)

    # ── 1. List Vercel blobs ──────────────────────────────────────────────────
    print("Fetching blob list from Vercel...")
    blobs = list_all_blobs(blob_token)
    print(f"  Found {len(blobs)} blob(s)\n")

    if not blobs:
        print("Nothing to migrate.")
        return

    # ── 2. DB: find rows that need updating ───────────────────────────────────
    engine = make_engine(env_vars, args.env)
    db_rows = find_artworks_with_vercel_urls(engine)
    # Build quick lookup: vercel_url → artwork_id
    url_to_artwork: dict[str, str] = {uri: aid for aid, uri in db_rows}
    print(f"DB rows with Vercel URLs: {len(db_rows)}\n")

    # ── 3. R2 client ─────────────────────────────────────────────────────────
    r2 = make_r2_client(env_vars)

    # ── 4. Migrate each blob ──────────────────────────────────────────────────
    migrated = 0
    skipped  = 0
    errors   = 0
    db_updated = 0

    for blob in blobs:
        vercel_url = blob.get("url", "")
        # downloadUrl is a pre-signed URL Vercel returns in the list response
        fetch_url = blob.get("downloadUrl") or vercel_url
        key = extract_key_from_vercel_url(vercel_url)
        r2_url = f"{r2_pub_url}/{key}"
        size_kb = blob.get("size", 0) // 1024

        print(f"  {key}  ({size_kb} KB)")

        # Check if already in R2
        if not dry and r2_key_exists(r2, r2_bucket, key):
            print(f"    → already in R2, skipping upload")
            skipped += 1
        else:
            try:
                if not dry:
                    data = download_blob(fetch_url, blob_token)
                    upload_to_r2(r2, r2_bucket, key, data)
                print(f"    {prefix}✓ uploaded to R2")
                migrated += 1
            except Exception as e:
                print(f"    ✗ FAILED: {e}")
                errors += 1
                continue

        # Update DB if this URL is referenced
        if vercel_url in url_to_artwork:
            artwork_id = url_to_artwork[vercel_url]
            if not dry:
                update_photo_uri(engine, artwork_id, r2_url)
            print(f"    {prefix}✓ DB updated: artwork {artwork_id[:8]}…")
            db_updated += 1

        time.sleep(0.05)  # be polite

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"Done.")
    print(f"  Uploaded : {migrated}")
    print(f"  Skipped  : {skipped} (already in R2)")
    print(f"  Errors   : {errors}")
    print(f"  DB rows updated: {db_updated}")
    if dry:
        print("\n  ⚠  Dry run — no changes were written.")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
