#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8000


def find_listener_pids(port: int) -> list[int]:
    result = subprocess.run(
        ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode not in (0, 1):
        raise RuntimeError(result.stderr.strip() or f"lsof failed with code {result.returncode}")
    return [int(line.strip()) for line in result.stdout.splitlines() if line.strip()]


def port_is_free(port: int) -> bool:
    return len(find_listener_pids(port)) == 0


def terminate_listeners(port: int, timeout_seconds: float = 3.0) -> None:
    pids = find_listener_pids(port)
    if not pids:
      return

    print(f"[dev-server] Clearing stale listeners on port {port}: {', '.join(map(str, pids))}")
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass

    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if port_is_free(port):
            return
        time.sleep(0.1)

    remaining = find_listener_pids(port)
    if remaining:
        print(f"[dev-server] Force killing stubborn listeners: {', '.join(map(str, remaining))}")
        for pid in remaining:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

    deadline = time.time() + 1.5
    while time.time() < deadline:
        if port_is_free(port):
            return
        time.sleep(0.05)

    final = find_listener_pids(port)
    if final:
        raise RuntimeError(f"Port {port} is still in use by: {', '.join(map(str, final))}")


def resolve_python() -> str:
    candidates = [
        BACKEND_ROOT / "venv" / "bin" / "python3",
        BACKEND_ROOT / "venv" / "bin" / "python",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return sys.executable


def build_command(host: str, port: int, reload_enabled: bool) -> list[str]:
    command = [
        resolve_python(),
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        host,
        "--port",
        str(port),
    ]
    if reload_enabled:
        command.append("--reload")
    return command


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Start the Musee backend dev server after clearing stale listeners.",
    )
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument(
        "--no-reload",
        action="store_true",
        help="Disable uvicorn reload mode for a more stable long-running session.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the resolved uvicorn command without starting it.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    os.chdir(BACKEND_ROOT)
    terminate_listeners(args.port)
    command = build_command(args.host, args.port, not args.no_reload)
    print(f"[dev-server] Starting: {' '.join(command)}")

    if args.dry_run:
        return 0

    os.execv(command[0], command)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
