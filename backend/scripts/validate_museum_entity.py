"""Read-only Wikidata physical-venue validation for one QID."""

from __future__ import annotations

import argparse
import asyncio
from dataclasses import asdict
import json
import sys

sys.path.insert(0, ".")

from app.services.museum.wikidata_validation import validate_wikidata_venue


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a Wikidata museum entity without writing.")
    parser.add_argument("qid")
    arguments = parser.parse_args()
    result = asyncio.run(validate_wikidata_venue(arguments.qid))
    print(json.dumps(asdict(result), default=str, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
