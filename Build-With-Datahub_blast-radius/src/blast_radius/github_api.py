"""Minimal GitHub REST client - stdlib only, no PyGithub dependency.

Everything the firewall needs to act on a pull request:
  sticky comment, commit status, check run, branch + file commit,
  companion pull request, labels.

If GITHUB_TOKEN is absent the client is simply disabled and every call is a
no-op, so local runs and the demo work with zero configuration.
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

log = logging.getLogger("blast_radius.github")


class GitHubError(RuntimeError):
    pass


class GitHubClient:
    def __init__(
        self,
        token: Optional[str],
        repository: Optional[str],
        api_url: str = "https://api.github.com",
        server_url: str = "https://github.com",
    ) -> None:
        self.token = (token or "").strip()
        self.repository = (repository or "").strip()
        self.api_url = (api_url or "https://api.github.com").rstrip("/")
        self.server_url = (server_url or "https://github.com").rstrip("/")

    @property
    def enabled(self) -> bool:
        return bool(self.token and self.repository)

    # ------------------------------------------------------------------
    def _repo(self, path: str) -> str:
        return "%s/repos/%s%s" % (self.api_url, self.repository, path)

    def _request(
        self,
        method: str,
        url: str,
        payload: Optional[Dict[str, Any]] = None,
        retries: int = 2,
    ) -> Any:
        if not self.enabled:
            raise GitHubError("GitHub client is not configured (missing token or repository)")
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(url, data=body, method=method)
        request.add_header("Authorization", "Bearer " + self.token)
        request.add_header("Accept", "application/vnd.github+json")
        request.add_header("X-GitHub-Api-Version", "2022-11-28")
        request.add_header("User-Agent", "blast-radius")
        if body is not None:
            request.add_header("Content-Type", "application/json")

        last: Optional[Exception] = None
        for attempt in range(retries + 1):
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    raw = response.read().decode("utf-8")
                    return json.loads(raw) if raw.strip() else {}
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", "replace")[:400]
                if exc.code in (403, 429, 500, 502, 503) and attempt < retries:
                    time.sleep(1.5 * (attempt + 1))
                    last = exc
                    continue
                raise GitHubError("%s %s -> %s %s" % (method, url, exc.code, detail)) from exc
            except Exception as exc:  # noqa: BLE001
                if attempt < retries:
                    time.sleep(1.0 * (attempt + 1))
                    last = exc
                    continue
                raise GitHubError("%s %s -> %s" % (method, url, exc)) from exc
        raise GitHubError(str(last))

    # -- comments -------------------------------------------------------
    def upsert_sticky_comment(self, pr_number: int, marker: str, body: str) -> Dict[str, Any]:
        """One comment per PR that updates in place, instead of ten stale ones."""
        existing = None
        try:
            comments = self._request(
                "GET", self._repo("/issues/%d/comments?per_page=100" % pr_number)
            )
            for comment in comments or []:
                if marker in (comment.get("body") or ""):
                    existing = comment
                    break
        except GitHubError as exc:
            log.warning("could not list comments: %s", exc)

        if existing:
            return self._request(
                "PATCH",
                self._repo("/issues/comments/%d" % existing["id"]),
                {"body": body},
            )
        return self._request(
            "POST", self._repo("/issues/%d/comments" % pr_number), {"body": body}
        )

    # -- status / checks -------------------------------------------------
    def set_commit_status(
        self,
        sha: str,
        state: str,
        description: str,
        context: str = "blast-radius",
        target_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "state": state,
            "description": description[:139],
            "context": context,
        }
        if target_url:
            payload["target_url"] = target_url
        return self._request("POST", self._repo("/statuses/" + sha), payload)

    def create_check_run(
        self,
        sha: str,
        name: str,
        conclusion: str,
        title: str,
        summary: str,
        text: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload = {
            "name": name,
            "head_sha": sha,
            "status": "completed",
            "conclusion": conclusion,
            "output": {
                "title": title[:255],
                "summary": summary[:65000],
                "text": (text or "")[:65000],
            },
        }
        return self._request("POST", self._repo("/check-runs"), payload)

    # -- branches and files -----------------------------------------------
    def get_ref_sha(self, ref: str) -> str:
        data = self._request("GET", self._repo("/git/ref/heads/" + urllib.parse.quote(ref)))
        return data["object"]["sha"]

    def create_branch(self, branch: str, from_sha: str) -> Dict[str, Any]:
        try:
            return self._request(
                "POST",
                self._repo("/git/refs"),
                {"ref": "refs/heads/" + branch, "sha": from_sha},
            )
        except GitHubError as exc:
            if "already exists" in str(exc).lower() or "422" in str(exc):
                log.info("branch %s already exists, reusing it", branch)
                return {"ref": "refs/heads/" + branch, "reused": True}
            raise

    def put_file(self, branch: str, path: str, content: str, message: str) -> Dict[str, Any]:
        import base64

        encoded = base64.b64encode(content.encode("utf-8")).decode("ascii")
        payload: Dict[str, Any] = {
            "message": message,
            "content": encoded,
            "branch": branch,
        }
        quoted = urllib.parse.quote(path)
        try:
            existing = self._request(
                "GET", self._repo("/contents/%s?ref=%s" % (quoted, urllib.parse.quote(branch)))
            )
            if isinstance(existing, dict) and existing.get("sha"):
                payload["sha"] = existing["sha"]
        except GitHubError:
            pass
        return self._request("PUT", self._repo("/contents/" + quoted), payload)

    # -- pull requests ------------------------------------------------------
    def find_open_pr(self, head_branch: str) -> Optional[Dict[str, Any]]:
        owner = self.repository.split("/")[0]
        try:
            results = self._request(
                "GET",
                self._repo("/pulls?state=open&head=%s:%s" % (owner, urllib.parse.quote(head_branch))),
            )
            return results[0] if results else None
        except GitHubError:
            return None

    def create_pull_request(
        self, title: str, body: str, head: str, base: str, draft: bool = False
    ) -> Dict[str, Any]:
        return self._request(
            "POST",
            self._repo("/pulls"),
            {"title": title[:250], "body": body[:60000], "head": head, "base": base, "draft": draft},
        )

    # -- labels --------------------------------------------------------------
    def get_labels(self, pr_number: int) -> List[str]:
        try:
            data = self._request("GET", self._repo("/issues/%d/labels" % pr_number))
            return [item.get("name", "") for item in data or []]
        except GitHubError:
            return []

    def add_labels(self, pr_number: int, labels: List[str]) -> Dict[str, Any]:
        return self._request(
            "POST", self._repo("/issues/%d/labels" % pr_number), {"labels": labels}
        )


def load_event_payload(path: Optional[str]) -> Dict[str, Any]:
    """Read the GitHub Actions event payload, if we are running in Actions."""
    target = path or os.environ.get("GITHUB_EVENT_PATH")
    if not target or not os.path.exists(target):
        return {}
    try:
        with open(target, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as exc:  # noqa: BLE001
        log.warning("could not read event payload %s: %s", target, exc)
        return {}
