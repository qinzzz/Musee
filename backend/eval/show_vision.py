"""
Show raw Google Vision Web Detection result for any image.

Usage:
  set -a && source ../.env.local && set +a
  venv/bin/python eval/show_vision.py <image_path_or_item_id>

Examples:
  venv/bin/python eval/show_vision.py co010
  venv/bin/python eval/show_vision.py "../dataset/contemporary/Ron Mueck_in bed.JPG"
"""
import asyncio, base64, json, os, sys
from pathlib import Path
import httpx

sys.path.insert(0, str(Path(__file__).parent.parent))


async def main():
    arg = " ".join(sys.argv[1:]).strip()
    if not arg:
        print(__doc__)
        sys.exit(1)

    # Resolve item ID → file path via manifest
    image_path = arg
    if not Path(arg).exists():
        manifest = json.loads((Path(__file__).parent / "dataset/manifest.json").read_text())
        matches = [i for i in manifest["items"] if i["id"] == arg]
        if not matches:
            print(f"Not a file path and no item with id '{arg}' in manifest")
            sys.exit(1)
        image_path = Path(__file__).parent / "dataset" / matches[0]["image_path"]
        print(f"Resolved {arg} → {image_path}\n")

    img = Path(image_path).read_bytes()
    b64 = base64.b64encode(img).decode()
    key = os.environ.get("GOOGLE_VISION_API_KEY", "")
    if not key:
        print("GOOGLE_VISION_API_KEY not set")
        sys.exit(1)

    payload = {"requests": [{"image": {"content": b64}, "features": [{"type": "WEB_DETECTION", "maxResults": 10}]}]}
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"https://vision.googleapis.com/v1/images:annotate?key={key}", json=payload)
        r.raise_for_status()

    web = r.json()["responses"][0].get("webDetection", {})
    print(json.dumps(web, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
