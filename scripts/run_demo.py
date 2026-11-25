#!/usr/bin/env python3
"""Safe one-command local demo runner for SystemLab.

Launches an isolated production preview (or Vite dev server with --dev)
strictly bound to loopback port 5200, tracks process ownership metadata in
.runtime/demo-state.json to defeat stale PID files and PID reuse, and never
terminates unrelated processes or touches VCraft services/databases.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import subprocess
import sys
import time
from typing import Any, Callable, Iterator
import urllib.error
import urllib.request
import webbrowser


STATE_SCHEMA_VERSION = 1
DEFAULT_TIMEOUT_SEC = 45.0
LOCK_TIMEOUT_SEC = 10.0
STALE_LOCK_AGE_SEC = 120.0
APP_NAME = "systemlab"
FINGERPRINT_EXCLUDE_DIRS = {
    ".git",
    ".runtime",
    ".ai-local",
    "node_modules",
    "dist",
    "coverage",
    "playwright-report",
    "test-results",
}


def resolve_repo_root(script_path: Path | None = None) -> Path:
    """Resolve repository root independent of current working directory."""
    anchor = (script_path or Path(__file__)).resolve()
    root = anchor.parents[1]
    pkg_path = root / "package.json"
    ports_path = root / "scripts" / "ports.json"
    if not pkg_path.is_file() or not ports_path.is_file():
        raise RuntimeError(f"Unable to locate SystemLab repository root from {anchor}")
    try:
        pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Invalid package.json at {pkg_path}: {exc}") from exc
    if pkg.get("name") != APP_NAME:
        raise RuntimeError(f"Expected package name '{APP_NAME}', found {pkg.get('name')!r}")
    return root


def load_port_config(repo_root: Path) -> dict[str, Any]:
    ports_path = repo_root / "scripts" / "ports.json"
    cfg = json.loads(ports_path.read_text(encoding="utf-8"))
    return cfg


def resolve_target_port(
    port_cfg: dict[str, Any],
    cli_port: int | None,
    env_port: str | None,
    *,
    dev_mode: bool = False,
) -> int:
    default_port = int(port_cfg["devPort"] if dev_mode else port_cfg["demoPort"])
    reserved = {int(p) for p in port_cfg.get("reservedExternalPorts", [])}

    if cli_port is not None:
        chosen = cli_port
        source = "--port"
    elif env_port is not None and env_port.strip() != "":
        raw = env_port.strip()
        if not raw.isdigit():
            raise ValueError(f"Invalid SYSTEMLAB_DEMO_PORT={raw!r}: expected integer 1024..65535.")
        chosen = int(raw)
        source = "SYSTEMLAB_DEMO_PORT"
    else:
        chosen = default_port
        source = "scripts/ports.json"

    if chosen < 1024 or chosen > 65535:
        raise ValueError(f"Port {chosen} ({source}) out of allowed range 1024..65535.")
    if chosen in reserved:
        raise ValueError(
            f"Port {chosen} ({source}) is reserved for external services (VCraft / local DB) "
            f"and cannot be used by SystemLab. Reserved ports: {sorted(reserved)}."
        )
    return chosen


def get_runtime_dir(repo_root: Path) -> Path:
    override = os.environ.get("SYSTEMLAB_RUNTIME_DIR", "").strip()
    return Path(override).resolve() if override else (repo_root / ".runtime")


def normalize_path(value: str | Path) -> str:
    return os.path.normcase(os.path.abspath(str(value)))


def atomic_write_json(target: Path, payload: dict[str, Any]) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(f".{target.name}.{os.getpid()}.{secrets.token_hex(4)}.tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, target)


def read_json_if_exists(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def inspect_process(pid: int) -> dict[str, Any] | None:
    """Return OS process metadata {'pid', 'parentPid', 'name', 'creationTime', 'commandLine'} or None."""
    if pid <= 0:
        return None
    if os.name == "nt":
        ps_cmd = (
            f"$p = Get-CimInstance Win32_Process -Filter 'ProcessId = {pid}' -ErrorAction SilentlyContinue; "
            "if ($p) { "
            "$ct = if ($p.CreationDate) { $p.CreationDate.ToUniversalTime().ToString('o') } else { '' }; "
            "[ordered]@{ pid=[int]$p.ProcessId; parentPid=[int]$p.ParentProcessId; "
            "name=[string]$p.Name; creationTime=$ct; commandLine=[string]$p.CommandLine } | ConvertTo-Json -Compress "
            "}"
        )
        res = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            timeout=15,
        )
        raw = res.stdout.strip()
        if not raw:
            return None
        try:
            info = json.loads(raw)
        except json.JSONDecodeError:
            return None
        return info if isinstance(info, dict) else None

    res = subprocess.run(
        ["ps", "-p", str(pid), "-o", "ppid=,lstart=,comm=,args="],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=10,
    )
    line = res.stdout.strip()
    if not line:
        return None
    parts = line.split(None, 7)
    if len(parts) < 8:
        return None
    ppid = int(parts[0])
    creation_time = " ".join(parts[1:6])
    name = parts[6]
    command_line = parts[7]
    return {
        "pid": pid,
        "parentPid": ppid,
        "name": name,
        "creationTime": creation_time,
        "commandLine": command_line,
    }


def verify_managed_process(
    state: dict[str, Any] | None,
    repo_root: Path,
    inspect_fn: Callable[[int], dict[str, Any] | None] = inspect_process,
) -> tuple[bool, str, dict[str, Any] | None]:
    """Strictly verify that a recorded PID belongs to this repo's Vite runner instance."""
    if not state or not isinstance(state, dict):
        return False, "No managed runner state recorded.", None
    if state.get("app") != APP_NAME:
        return False, "State metadata app identifier does not match systemlab.", None

    recorded_root = state.get("repoRoot")
    if not isinstance(recorded_root, str) or normalize_path(recorded_root) != normalize_path(repo_root):
        return False, "State metadata belongs to a different directory.", None

    pid = state.get("pid")
    if not isinstance(pid, int) or pid <= 0:
        return False, "Invalid PID in runner state metadata.", None

    info = inspect_fn(pid)
    if not info:
        return False, f"Recorded PID {pid} is no longer running (stale state).", None

    expected_ctime = str(state.get("creationTime") or "")
    actual_ctime = str(info.get("creationTime") or "")
    if expected_ctime and actual_ctime != expected_ctime:
        return (
            False,
            f"PID {pid} creation timestamp changed ({actual_ctime} != {expected_ctime}); possible PID reuse.",
            info,
        )

    proc_name = str(info.get("name") or "").lower()
    cmdline = str(info.get("commandLine") or "").lower()
    if "node" not in proc_name and "node" not in cmdline:
        return False, f"PID {pid} ({info.get('name')}) is not a Node.js process.", info

    root_norm = normalize_path(repo_root).lower()
    vite_js_norm = normalize_path(repo_root / "node_modules" / "vite" / "bin" / "vite.js").lower()
    if "vite" not in cmdline or (root_norm not in cmdline and vite_js_norm not in cmdline):
        return (
            False,
            f"PID {pid} does not match SystemLab's Vite server command line.",
            info,
        )

    return True, "Verified managed SystemLab process.", info


def find_listening_pids(port: int) -> list[int]:
    """Return PIDs currently listening on TCP port."""
    if os.name == "nt":
        res = subprocess.run(
            ["netstat", "-ano", "-p", "TCP"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            timeout=15,
        )
        pids: set[int] = set()
        port_str = str(port)
        for line in res.stdout.splitlines():
            parts = line.split()
            if len(parts) >= 5 and parts[0].upper() == "TCP" and parts[3].upper() == "LISTENING":
                local_addr = parts[1]
                local_port = local_addr.rsplit(":", 1)[-1] if ":" in local_addr else ""
                if local_port == port_str and parts[4].isdigit():
                    pid = int(parts[4])
                    if pid > 4 and pid != os.getpid():
                        pids.add(pid)
        return sorted(pids)

    try:
        res = subprocess.run(
            ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
        return sorted({int(x) for x in res.stdout.split() if x.isdigit() and int(x) != os.getpid()})
    except FileNotFoundError:
        return []


def verify_systemlab_http(host: str, port: int, marker: str, timeout: float = 2.0) -> bool:
    """Confirm HTTP GET / responds 200 OK with the SystemLab application marker."""
    url = f"http://{host}:{port}/"
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return False
            body = resp.read(16384).decode("utf-8", errors="replace")
            return marker in body or "<title>SystemLab" in body
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return False


def format_pid_summary(pids: list[int], inspect_fn: Callable[[int], dict[str, Any] | None] = inspect_process) -> str:
    details: list[str] = []
    for pid in pids:
        info = inspect_fn(pid)
        if info:
            name = info.get("name") or "unknown"
            cmd = str(info.get("commandLine") or "").strip()
            if len(cmd) > 120:
                cmd = cmd[:117] + "..."
            details.append(f"PID {pid} ({name}: {cmd or 'no cmdline'})")
        else:
            details.append(f"PID {pid}")
    return "; ".join(details)


@contextmanager
def runner_lock(runtime_dir: Path, timeout_sec: float = LOCK_TIMEOUT_SEC) -> Iterator[None]:
    """Single-writer lock protecting .runtime state transitions against concurrent starts."""
    runtime_dir.mkdir(parents=True, exist_ok=True)
    lock_path = runtime_dir / "runner.lock"
    deadline = time.monotonic() + timeout_sec

    while True:
        try:
            fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            try:
                payload = json.dumps({"pid": os.getpid(), "createdAt": time.time()})
                os.write(fd, payload.encode("utf-8"))
            finally:
                os.close(fd)
            break
        except FileExistsError:
            stale = False
            try:
                age = time.time() - lock_path.stat().st_mtime
                data = read_json_if_exists(lock_path)
                owner_pid = data.get("pid") if data else None
                if age > STALE_LOCK_AGE_SEC or (isinstance(owner_pid, int) and inspect_process(owner_pid) is None):
                    stale = True
            except OSError:
                stale = True

            if stale:
                try:
                    lock_path.unlink(missing_ok=True)
                    continue
                except OSError:
                    pass

            if time.monotonic() >= deadline:
                raise RuntimeError(
                    f"Another SystemLab demo runner operation holds {lock_path}. "
                    "Wait a moment and retry."
                )
            time.sleep(0.15)

    try:
        yield
    finally:
        try:
            lock_path.unlink(missing_ok=True)
        except OSError:
            pass


def resolve_node_and_npm() -> tuple[str, str]:
    node_exe = shutil.which("node")
    npm_exe = shutil.which("npm.cmd") if os.name == "nt" else shutil.which("npm")
    if not npm_exe:
        npm_exe = shutil.which("npm")
    if not node_exe or not npm_exe:
        raise RuntimeError(
            "Node.js and npm are required on PATH to run SystemLab. Install Node.js 22+ and retry."
        )
    return node_exe, npm_exe


def ensure_dependencies(repo_root: Path, runtime_dir: Path, npm_exe: str) -> None:
    lockfile = repo_root / "package-lock.json"
    vite_bin = repo_root / "node_modules" / "vite" / "bin" / "vite.js"
    stamp_path = runtime_dir / "deps-stamp.json"

    lock_hash = hashlib.sha256(lockfile.read_bytes()).hexdigest() if lockfile.is_file() else ""
    stamp = read_json_if_exists(stamp_path)
    has_node_modules = vite_bin.is_file()
    lock_matches = bool(stamp and stamp.get("lockSha256") == lock_hash)

    if has_node_modules and (lock_matches or stamp is None):
        # Record initial stamp if node_modules was already cleanly installed externally
        if stamp is None and lock_hash:
            atomic_write_json(stamp_path, {"lockSha256": lock_hash, "updatedAt": time.time()})
        return

    print("Installing dependencies via `npm ci` (package-lock.json changed or node_modules missing)...", flush=True)
    res = subprocess.run([npm_exe, "ci"], cwd=repo_root, check=False)
    if res.returncode != 0 or not vite_bin.is_file():
        raise RuntimeError("`npm ci` failed; unable to prepare SystemLab dependencies.")
    atomic_write_json(stamp_path, {"lockSha256": lock_hash, "updatedAt": time.time()})


def compute_build_fingerprint(repo_root: Path) -> str:
    hasher = hashlib.sha256()
    watch_files = [
        repo_root / "index.html",
        repo_root / "package.json",
        repo_root / "package-lock.json",
        repo_root / "vite.config.ts",
        repo_root / "tsconfig.json",
        repo_root / "scripts" / "ports.json",
        repo_root / "scripts" / "ports.ts",
    ]
    watch_dirs = [repo_root / "src", repo_root / "public"]

    all_files: list[Path] = [p for p in watch_files if p.is_file()]
    for base_dir in watch_dirs:
        if not base_dir.is_dir():
            continue
        for root_str, dirs, files in os.walk(base_dir):
            dirs[:] = sorted(d for d in dirs if d not in FINGERPRINT_EXCLUDE_DIRS)
            for fname in sorted(files):
                all_files.append(Path(root_str) / fname)

    for path in sorted(set(all_files)):
        rel = path.relative_to(repo_root).as_posix()
        stat = path.stat()
        hasher.update(f"{rel}:{stat.st_size}:{stat.st_mtime_ns}\n".encode("utf-8"))
    return hasher.hexdigest()


def ensure_build(repo_root: Path, runtime_dir: Path, npm_exe: str, force_rebuild: bool) -> None:
    dist_index = repo_root / "dist" / "index.html"
    stamp_path = runtime_dir / "build-stamp.json"
    fingerprint = compute_build_fingerprint(repo_root)
    stamp = read_json_if_exists(stamp_path)

    needs_build = (
        force_rebuild
        or not dist_index.is_file()
        or not stamp
        or stamp.get("fingerprint") != fingerprint
        or stamp.get("basePath") != "./"
    )
    if not needs_build:
        return

    print("Building SystemLab production bundle (`VITE_BASE_PATH=./`)...", flush=True)
    env = os.environ.copy()
    env["VITE_BASE_PATH"] = "./"
    res = subprocess.run([npm_exe, "run", "build"], cwd=repo_root, env=env, check=False)
    if res.returncode != 0 or not dist_index.is_file():
        raise RuntimeError("Production build failed; demo server was not started.")
    atomic_write_json(
        stamp_path,
        {"fingerprint": fingerprint, "basePath": "./", "builtAt": datetime.now(timezone.utc).isoformat()},
    )


def terminate_verified_pid(
    pid: int,
    state: dict[str, Any],
    repo_root: Path,
    inspect_fn: Callable[[int], dict[str, Any] | None] = inspect_process,
) -> tuple[bool, str]:
    """Gracefully terminate ONLY a verified runner-owned PID."""
    valid, reason, _ = verify_managed_process(state, repo_root, inspect_fn)
    if not valid:
        return False, reason

    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T"],
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
        deadline = time.monotonic() + 4.0
        while time.monotonic() < deadline:
            if inspect_fn(pid) is None:
                return True, f"Gracefully stopped SystemLab PID {pid}."
            time.sleep(0.2)
        valid_still, _, _ = verify_managed_process(state, repo_root, inspect_fn)
        if valid_still:
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                capture_output=True,
                text=True,
                check=False,
                timeout=10,
            )
            time.sleep(0.3)
        return (inspect_fn(pid) is None), f"Stopped SystemLab PID {pid}."

    try:
        os.kill(pid, signal.SIGTERM)
    except OSError as exc:
        return False, f"Failed to send SIGTERM to PID {pid}: {exc}"
    deadline = time.monotonic() + 4.0
    while time.monotonic() < deadline:
        if inspect_fn(pid) is None:
            return True, f"Gracefully stopped SystemLab PID {pid}."
        time.sleep(0.2)
    valid_still, _, _ = verify_managed_process(state, repo_root, inspect_fn)
    if valid_still:
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass
        time.sleep(0.2)
    return (inspect_fn(pid) is None), f"Stopped SystemLab PID {pid}."


def wait_for_readiness(
    proc: subprocess.Popen[bytes] | subprocess.Popen[str],
    host: str,
    port: int,
    marker: str,
    timeout_sec: float,
    http_check: Callable[[str, int, str], bool] = verify_systemlab_http,
) -> tuple[bool, str]:
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        rc = proc.poll()
        if rc is not None:
            return False, f"Server process exited prematurely with code {rc}."
        if http_check(host, port, marker):
            return True, "Ready"
        time.sleep(0.25)
    return False, f"Timed out after {timeout_sec:.1f}s waiting for SystemLab at http://{host}:{port}/."


def tail_log(log_path: Path, lines: int = 25) -> str:
    if not log_path.is_file():
        return ""
    content = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    return "\n".join(content[-lines:])


def is_pid_or_child_owned(
    listener_pid: int,
    state: dict[str, Any],
    repo_root: Path,
    inspect_fn: Callable[[int], dict[str, Any] | None] = inspect_process,
) -> bool:
    valid, _, _ = verify_managed_process(state, repo_root, inspect_fn)
    if not valid:
        return False
    if listener_pid == state.get("pid"):
        return True
    child_info = inspect_fn(listener_pid)
    if child_info and child_info.get("parentPid") == state.get("pid"):
        cmd = str(child_info.get("commandLine") or "").lower()
        return normalize_path(repo_root).lower() in cmd or "vite" in cmd
    return False


def format_demo_url(port: int) -> str:
    return f"http://localhost:{port}/"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Safe one-command local demo runner for SystemLab (isolated on port 5200).",
    )
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument("--status", action="store_true", help="Check SystemLab demo status cleanly.")
    mode_group.add_argument("--stop", action="store_true", help="Stop only the runner-managed SystemLab server.")
    mode_group.add_argument("--rebuild", action="store_true", help="Force a clean production rebuild and start demo.")
    mode_group.add_argument("--dev", action="store_true", help="Run Vite dev server on port 5200 instead of preview.")
    parser.add_argument("--no-open", action="store_true", help="Do not open a browser window automatically.")
    parser.add_argument("--port", type=int, default=None, help="Explicit port override (must not conflict with VCraft).")
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT_SEC,
        help=f"Startup readiness timeout in seconds (default {DEFAULT_TIMEOUT_SEC:.0f}).",
    )
    return parser.parse_args(argv)


def handle_status(repo_root: Path, runtime_dir: Path, port_cfg: dict[str, Any], target_port: int) -> int:
    state_path = runtime_dir / "demo-state.json"
    state = read_json_if_exists(state_path)
    host = str(port_cfg["host"])
    marker = str(port_cfg["appIdentityMarker"])
    listeners = find_listening_pids(target_port)

    if state:
        valid, reason, _ = verify_managed_process(state, repo_root)
        if valid:
            rec_port = int(state.get("port", target_port))
            rec_listeners = find_listening_pids(rec_port)
            http_ok = verify_systemlab_http(host, rec_port, marker)
            if rec_listeners and http_ok:
                print(
                    f"SystemLab demo is RUNNING | mode={state.get('mode')} | PID={state.get('pid')} "
                    f"| URL={format_demo_url(rec_port)}",
                    flush=True,
                )
                return 0
            print(
                f"SystemLab managed PID {state.get('pid')} exists but HTTP readiness check failed on port {rec_port}.",
                flush=True,
            )
            return 1
        # Clean stale state file when process is dead or mismatched
        state_path.unlink(missing_ok=True)
        print(f"Cleaned stale demo state metadata ({reason}).", flush=True)

    if listeners:
        summary = format_pid_summary(listeners)
        print(
            f"SystemLab runner is STOPPED, and port {target_port} is occupied by an unmanaged process: {summary}",
            flush=True,
        )
        return 3

    print(f"SystemLab demo is STOPPED (port {target_port} is free).", flush=True)
    return 0


def handle_stop(repo_root: Path, runtime_dir: Path) -> int:
    state_path = runtime_dir / "demo-state.json"
    with runner_lock(runtime_dir):
        state = read_json_if_exists(state_path)
        if not state:
            print("No managed SystemLab demo instance is currently recorded.", flush=True)
            return 0

        valid, reason, _ = verify_managed_process(state, repo_root)
        if not valid:
            state_path.unlink(missing_ok=True)
            print(
                f"Refused to terminate PID {state.get('pid')}: {reason} Removed stale state metadata.",
                flush=True,
            )
            return 0

        pid = int(state["pid"])
        port = int(state.get("port", 5200))
        stopped, msg = terminate_verified_pid(pid, state, repo_root)
        state_path.unlink(missing_ok=True)
        deadline = time.monotonic() + 3.0
        while time.monotonic() < deadline and pid in find_listening_pids(port):
            time.sleep(0.15)
        print(msg, flush=True)
        return 0 if stopped else 1


def handle_start(
    args: argparse.Namespace,
    repo_root: Path,
    runtime_dir: Path,
    port_cfg: dict[str, Any],
    port: int,
) -> int:
    host = str(port_cfg["host"])
    marker = str(port_cfg["appIdentityMarker"])
    desired_mode = "dev" if args.dev else "preview"
    state_path = runtime_dir / "demo-state.json"
    log_path = runtime_dir / "demo.log"
    url = format_demo_url(port)

    with runner_lock(runtime_dir):
        existing_state = read_json_if_exists(state_path)
        if existing_state:
            valid, reason, _ = verify_managed_process(existing_state, repo_root)
            if not valid:
                state_path.unlink(missing_ok=True)
                print(f"Cleared stale state metadata ({reason}).", flush=True)
                existing_state = None
            else:
                same_mode = existing_state.get("mode") == desired_mode and existing_state.get("port") == port
                if same_mode and not args.rebuild and find_listening_pids(port) and verify_systemlab_http(host, port, marker):
                    print(
                        f"SystemLab demo is already running ({desired_mode}, PID {existing_state['pid']}) at {url}",
                        flush=True,
                    )
                    if not args.no_open:
                        webbrowser.open(url)
                    return 0
                print(
                    f"Stopping existing managed SystemLab instance (PID {existing_state['pid']}, mode={existing_state.get('mode')})...",
                    flush=True,
                )
                terminate_verified_pid(int(existing_state["pid"]), existing_state, repo_root)
                state_path.unlink(missing_ok=True)
                time.sleep(0.3)

        # Strict port conflict inspection after cleaning any dead/stopped own process
        listeners = find_listening_pids(port)
        if listeners:
            summary = format_pid_summary(listeners)
            print(
                f"ERROR: Port {port} on {host} is already in use by another process: {summary}.\n"
                "SystemLab will NOT stop unrelated processes (such as VCraft) and will NOT silently switch ports.\n"
                "Free port "
                f"{port} or pass an explicit unused port via `--port <port>`.",
                file=sys.stderr,
                flush=True,
            )
            return 3

        node_exe, npm_exe = resolve_node_and_npm()
        ensure_dependencies(repo_root, runtime_dir, npm_exe)
        if desired_mode == "preview":
            ensure_build(repo_root, runtime_dir, npm_exe, force_rebuild=bool(args.rebuild))

        vite_entry = repo_root / "node_modules" / "vite" / "bin" / "vite.js"
        cmd = [node_exe, str(vite_entry)]
        if desired_mode == "preview":
            cmd.append("preview")
        cmd.extend(["--host", host, "--port", str(port), "--strictPort"])

        env = os.environ.copy()
        env["VITE_BASE_PATH"] = "./"
        if desired_mode == "dev":
            env["SYSTEMLAB_DEV_PORT"] = str(port)
        else:
            env["SYSTEMLAB_PREVIEW_PORT"] = str(port)
        token = secrets.token_hex(16)
        env["SYSTEMLAB_RUNNER_TOKEN"] = token

        runtime_dir.mkdir(parents=True, exist_ok=True)
        popen_kwargs: dict[str, Any] = {
            "cwd": str(repo_root),
            "env": env,
        }
        if os.name == "nt":
            popen_kwargs["creationflags"] = (
                subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
            )
        else:
            popen_kwargs["start_new_session"] = True

        with log_path.open("w", encoding="utf-8") as log_handle:
            proc = subprocess.Popen(cmd, stdout=log_handle, stderr=subprocess.STDOUT, **popen_kwargs)

        time.sleep(0.2)
        info = inspect_process(proc.pid) or {
            "pid": proc.pid,
            "parentPid": os.getpid(),
            "name": Path(node_exe).name,
            "creationTime": "",
            "commandLine": " ".join(cmd),
        }
        new_state = {
            "schemaVersion": STATE_SCHEMA_VERSION,
            "app": APP_NAME,
            "repoRoot": str(repo_root),
            "instanceToken": token,
            "pid": proc.pid,
            "parentPid": info.get("parentPid", os.getpid()),
            "processName": info.get("name", Path(node_exe).name),
            "creationTime": info.get("creationTime", ""),
            "commandLine": info.get("commandLine", " ".join(cmd)),
            "mode": desired_mode,
            "host": host,
            "port": port,
            "url": url,
            "startedAt": datetime.now(timezone.utc).isoformat(),
        }
        atomic_write_json(state_path, new_state)

        ready, reason = wait_for_readiness(proc, host, port, marker, float(args.timeout))
        if not ready:
            terminate_verified_pid(proc.pid, new_state, repo_root)
            state_path.unlink(missing_ok=True)
            log_tail = tail_log(log_path)
            print(f"ERROR: {reason}", file=sys.stderr, flush=True)
            if log_tail:
                print("--- .runtime/demo.log (tail) ---", file=sys.stderr, flush=True)
                print(log_tail, file=sys.stderr, flush=True)
            return 4

        print(f"SystemLab demo ready ({desired_mode}, PID {proc.pid}): {url}", flush=True)
        print("Stop anytime with: python scripts/run_demo.py --stop", flush=True)
        if not args.no_open:
            webbrowser.open(url)
        return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        repo_root = resolve_repo_root()
        port_cfg = load_port_config(repo_root)
        target_port = resolve_target_port(
            port_cfg,
            args.port,
            os.environ.get("SYSTEMLAB_DEMO_PORT"),
            dev_mode=bool(args.dev),
        )
    except (RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr, flush=True)
        return 2

    runtime_dir = get_runtime_dir(repo_root)
    if args.status:
        return handle_status(repo_root, runtime_dir, port_cfg, target_port)
    if args.stop:
        return handle_stop(repo_root, runtime_dir)

    try:
        return handle_start(args, repo_root, runtime_dir, port_cfg, target_port)
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
