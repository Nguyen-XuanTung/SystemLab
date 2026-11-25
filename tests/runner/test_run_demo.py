"""Tests for scripts/run_demo.py process safety, port isolation, and lifecycle."""

from __future__ import annotations

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import run_demo  # noqa: E402


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class RunDemoUnitTests(unittest.TestCase):
    def test_argument_parsing_and_reserved_port_rejection(self) -> None:
        args_default = run_demo.parse_args([])
        self.assertFalse(args_default.status)
        self.assertFalse(args_default.stop)
        self.assertFalse(args_default.rebuild)
        self.assertFalse(args_default.dev)
        self.assertFalse(args_default.no_open)

        args_flags = run_demo.parse_args(["--dev", "--no-open", "--port", "5299", "--timeout", "12"])
        self.assertTrue(args_flags.dev)
        self.assertTrue(args_flags.no_open)
        self.assertEqual(args_flags.port, 5299)
        self.assertEqual(args_flags.timeout, 12.0)

        port_cfg = run_demo.load_port_config(REPO_ROOT)
        self.assertEqual(run_demo.resolve_target_port(port_cfg, None, None), 5200)
        for reserved_port in (5173, 5174, 15173, 18080, 8080, 3307):
            with self.assertRaises(ValueError):
                run_demo.resolve_target_port(port_cfg, reserved_port, None)
        with self.assertRaises(ValueError):
            run_demo.resolve_target_port(port_cfg, 80, None)
        with self.assertRaises(ValueError):
            run_demo.resolve_target_port(port_cfg, None, "not-a-number")

        # Main entry point returns exit code 2 when reserved VCraft port passed via CLI
        rc = run_demo.main(["--port", "5173", "--no-open"])
        self.assertEqual(rc, 2)

    def test_repo_root_resolution_independent_of_cwd(self) -> None:
        orig_cwd = os.getcwd()
        with tempfile.TemporaryDirectory() as tmp_dir:
            try:
                os.chdir(tmp_dir)
                resolved = run_demo.resolve_repo_root(REPO_ROOT / "scripts" / "run_demo.py")
                self.assertEqual(resolved, REPO_ROOT)
            finally:
                os.chdir(orig_cwd)

    def test_readiness_timeout_cleans_up_child_process(self) -> None:
        fake_proc = mock.MagicMock()
        fake_proc.poll.return_value = None
        ready, msg = run_demo.wait_for_readiness(
            fake_proc,
            "127.0.0.1",
            5298,
            "SystemLab",
            timeout_sec=0.4,
            http_check=lambda _h, _p, _m: False,
        )
        self.assertFalse(ready)
        self.assertIn("Timed out", msg)


class RunDemoIsolationAndLifecycleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp_runtime = tempfile.TemporaryDirectory()
        self.dummy_proc: subprocess.Popen[bytes] | None = None
        self.env = os.environ.copy()
        self.env["SYSTEMLAB_RUNTIME_DIR"] = self.tmp_runtime.name

    def tearDown(self) -> None:
        if self.dummy_proc and self.dummy_proc.poll() is None:
            self.dummy_proc.terminate()
            try:
                self.dummy_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.dummy_proc.kill()
        self.tmp_runtime.cleanup()

    def _run_cli(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(REPO_ROOT / "scripts" / "run_demo.py"), *args],
            cwd=tempfile.gettempdir(),
            env=self.env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=90,
        )

    def _start_unrelated_server(self, port: int) -> subprocess.Popen[bytes]:
        code = (
            "import http.server, socketserver; "
            "H = http.server.BaseHTTPRequestHandler; "
            "H.log_message = lambda *a: None; "
            f"s = socketserver.TCPServer(('127.0.0.1', {port}), "
            "type('R', (http.server.SimpleHTTPRequestHandler,), "
            "{'do_GET': lambda self: (self.send_response(200), self.end_headers(), self.wfile.write(b'UNRELATED_APP'))})); "
            "s.serve_forever()"
        )
        proc = subprocess.Popen(
            [sys.executable, "-c", code],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            if run_demo.find_listening_pids(port):
                break
            time.sleep(0.1)
        return proc

    def test_port_conflict_and_stale_or_unrelated_pid_protection(self) -> None:
        port = find_free_port()
        self.dummy_proc = self._start_unrelated_server(port)
        self.assertIsNone(self.dummy_proc.poll())

        # 1. Port conflict must refuse start (exit 3) and leave unrelated process untouched
        conflict = self._run_cli("--port", str(port), "--no-open")
        self.assertEqual(conflict.returncode, 3, msg=conflict.stdout + conflict.stderr)
        self.assertIn(str(port), conflict.stderr)
        self.assertIsNone(self.dummy_proc.poll(), "Unrelated server must remain alive")

        # 2. Stale dead-PID metadata cleaned safely by --status and --stop
        state_path = Path(self.tmp_runtime.name) / "demo-state.json"
        run_demo.atomic_write_json(
            state_path,
            {
                "schemaVersion": 1,
                "app": "systemlab",
                "repoRoot": str(REPO_ROOT),
                "pid": 99999991,
                "creationTime": "stale-ctime",
                "mode": "preview",
                "port": port,
            },
        )
        stop_stale = self._run_cli("--stop")
        self.assertEqual(stop_stale.returncode, 0)
        self.assertFalse(state_path.exists())
        self.assertIsNone(self.dummy_proc.poll())

        # 3. PID-reuse / unrelated-process protection: even if state points to dummy_proc's PID,
        #    --stop refuses to kill it because creationTime & cmdline do not match Vite/SystemLab!
        run_demo.atomic_write_json(
            state_path,
            {
                "schemaVersion": 1,
                "app": "systemlab",
                "repoRoot": str(REPO_ROOT),
                "pid": self.dummy_proc.pid,
                "creationTime": "1999-01-01T00:00:00Z",
                "mode": "preview",
                "port": port,
            },
        )
        stop_unrelated = self._run_cli("--stop")
        self.assertEqual(stop_unrelated.returncode, 0)
        self.assertIn("Refused to terminate", stop_unrelated.stdout)
        self.assertIsNone(self.dummy_proc.poll(), "PID reuse guard failed: killed unrelated process!")

    def test_real_start_status_duplicate_stop_and_restart_lifecycle(self) -> None:
        port = find_free_port()
        state_path = Path(self.tmp_runtime.name) / "demo-state.json"

        try:
            # Start on isolated ephemeral port
            start1 = self._run_cli("--port", str(port), "--no-open")
            self.assertEqual(start1.returncode, 0, msg=start1.stdout + start1.stderr)
            self.assertIn("SystemLab demo ready", start1.stdout)
            state1 = json.loads(state_path.read_text(encoding="utf-8"))
            pid1 = state1["pid"]

            # Status reports running
            status1 = self._run_cli("--status", "--port", str(port))
            self.assertEqual(status1.returncode, 0, msg=status1.stdout + status1.stderr)
            self.assertIn("RUNNING", status1.stdout)
            self.assertIn(str(pid1), status1.stdout)

            # Duplicate start is idempotent and keeps same PID
            start_dup = self._run_cli("--port", str(port), "--no-open")
            self.assertEqual(start_dup.returncode, 0, msg=start_dup.stdout + start_dup.stderr)
            self.assertIn("already running", start_dup.stdout)
            state_dup = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertEqual(state_dup["pid"], pid1)

            # Graceful stop cleans state and frees port
            stop1 = self._run_cli("--stop")
            self.assertEqual(stop1.returncode, 0, msg=stop1.stdout + stop1.stderr)
            self.assertFalse(state_path.exists())
            self.assertEqual(run_demo.find_listening_pids(port), [])

            # Restart allocates fresh server cleanly, then stop
            start2 = self._run_cli("--port", str(port), "--no-open")
            self.assertEqual(start2.returncode, 0, msg=start2.stdout + start2.stderr)
            self.assertTrue(
                run_demo.verify_systemlab_http("127.0.0.1", port, "SystemLab — Design. Simulate. Break. Understand.")
            )
            stop2 = self._run_cli("--stop")
            self.assertEqual(stop2.returncode, 0)
            self.assertEqual(run_demo.find_listening_pids(port), [])
        finally:
            self._run_cli("--stop")


if __name__ == "__main__":
    unittest.main()
