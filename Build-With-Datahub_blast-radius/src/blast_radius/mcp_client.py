"""A tiny, dependency-free MCP stdio client.

Enough of the Model Context Protocol to `initialize`, `tools/list` and
`tools/call` against `npx -y @acryldata/mcp-server-datahub`. We deliberately
do not pull in an MCP SDK: the GitHub Action must stay lean, and this is ~120
lines of JSON-RPC over pipes.

Used by:
  * `blast-radius mcp-check`  - proves the MCP server + mutation tools are live
  * `--context-source mcp`    - runs the whole firewall through MCP tools
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
import threading
from typing import Any, Dict, List, Optional

PROTOCOL_VERSION = "2024-11-05"


class McpError(RuntimeError):
    pass


class McpStdioClient:
    def __init__(
        self,
        command: str = "npx -y @acryldata/mcp-server-datahub",
        env: Optional[Dict[str, str]] = None,
        timeout: float = 60.0,
        cwd: Optional[str] = None,
    ) -> None:
        self.command = command
        self.timeout = timeout
        self.cwd = cwd
        self._env = {**os.environ, **(env or {})}
        self._proc: Optional[subprocess.Popen] = None
        self._id = 0
        self._lock = threading.Lock()
        self._stderr: List[str] = []

    # -- lifecycle ---------------------------------------------------------
    def __enter__(self) -> "McpStdioClient":
        self.start()
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def start(self) -> None:
        if self._proc is not None:
            return
        self._proc = subprocess.Popen(  # noqa: S603
            shlex.split(self.command),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=self._env,
            cwd=self.cwd,
            text=True,
            bufsize=1,
        )
        threading.Thread(target=self._drain_stderr, daemon=True).start()
        self._request(
            "initialize",
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "clientInfo": {"name": "blast-radius", "version": "0.1.0"},
            },
        )
        self._notify("notifications/initialized", {})

    def close(self) -> None:
        if self._proc is None:
            return
        try:
            if self._proc.stdin:
                self._proc.stdin.close()
            self._proc.terminate()
            self._proc.wait(timeout=5)
        except Exception:
            try:
                self._proc.kill()
            except Exception:
                pass
        finally:
            self._proc = None

    def _drain_stderr(self) -> None:
        proc = self._proc
        if proc is None or proc.stderr is None:
            return
        for line in proc.stderr:
            self._stderr.append(line.rstrip())
            if len(self._stderr) > 200:
                del self._stderr[:100]

    @property
    def stderr_tail(self) -> str:
        return "\n".join(self._stderr[-20:])

    # -- jsonrpc -----------------------------------------------------------
    def _send(self, payload: Dict[str, Any]) -> None:
        if self._proc is None or self._proc.stdin is None:
            raise McpError("MCP process is not running")
        self._proc.stdin.write(json.dumps(payload) + "\n")
        self._proc.stdin.flush()

    def _notify(self, method: str, params: Dict[str, Any]) -> None:
        self._send({"jsonrpc": "2.0", "method": method, "params": params})

    def _request(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            if self._proc is None:
                raise McpError("MCP process is not running")
            self._id += 1
            req_id = self._id
            self._send({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params})

            assert self._proc.stdout is not None
            while True:
                line = self._proc.stdout.readline()
                if not line:
                    raise McpError(
                        f"MCP server closed the stream during {method}.\n{self.stderr_tail}"
                    )
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    continue  # server logging noise on stdout
                if msg.get("id") != req_id:
                    continue  # notification or out-of-band message
                if "error" in msg:
                    raise McpError(str(msg["error"]))
                return msg.get("result", {})

    # -- tools -------------------------------------------------------------
    def list_tools(self) -> List[Dict[str, Any]]:
        result = self._request("tools/list", {})
        return list(result.get("tools", []))

    def call_tool(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> Any:
        result = self._request("tools/call", {"name": name, "arguments": arguments or {}})
        if result.get("isError"):
            raise McpError(_flatten_content(result.get("content", [])))
        if "structuredContent" in result and result["structuredContent"] is not None:
            return result["structuredContent"]
        text = _flatten_content(result.get("content", []))
        try:
            return json.loads(text)
        except (json.JSONDecodeError, TypeError):
            return text


def _flatten_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    parts: List[str] = []
    for item in content or []:
        if isinstance(item, dict) and item.get("type") == "text":
            parts.append(str(item.get("text", "")))
        elif isinstance(item, dict) and item.get("type") == "resource":
            res = item.get("resource") or {}
            parts.append(str(res.get("text", "")))
    return "\n".join(parts)
