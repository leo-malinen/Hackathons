"""Thin git wrapper: what changed, and what did the file look like before?"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional


@dataclass
class ChangedFile:
    path: str
    status: str  # added | modified | deleted | renamed
    old_path: Optional[str] = None


class GitError(RuntimeError):
    pass


def _run(args: List[str], cwd: Path) -> str:
    proc = subprocess.run(  # noqa: S603
        ["git", *args], cwd=str(cwd), capture_output=True, text=True
    )
    if proc.returncode != 0:
        raise GitError(f"git {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout


def is_repo(cwd: Path) -> bool:
    try:
        _run(["rev-parse", "--git-dir"], cwd)
        return True
    except (GitError, FileNotFoundError):
        return False


def merge_base(base: str, head: str, cwd: Path) -> str:
    try:
        return _run(["merge-base", base, head], cwd).strip() or base
    except GitError:
        return base


def changed_files(base: str, head: str, cwd: Path) -> List[ChangedFile]:
    """`git diff --name-status base...head`, parsed."""
    raw = _run(["diff", "--name-status", "-M", f"{base}...{head}"], cwd)
    out: List[ChangedFile] = []
    status_map = {"A": "added", "M": "modified", "D": "deleted", "R": "renamed", "C": "added"}
    for line in raw.splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        code = parts[0][0]
        status = status_map.get(code, "modified")
        if status == "renamed" and len(parts) >= 3:
            out.append(ChangedFile(path=parts[2], status="renamed", old_path=parts[1]))
        else:
            out.append(ChangedFile(path=parts[1], status=status))
    return out


def file_at(rev: str, path: str, cwd: Path) -> str:
    """Content of `path` at `rev`, or empty string if it did not exist."""
    try:
        return _run(["show", f"{rev}:{path}"], cwd)
    except GitError:
        return ""


def current_file(path: str, cwd: Path) -> str:
    target = cwd / path
    if target.is_file():
        try:
            return target.read_text(encoding="utf-8")
        except OSError:
            return ""
    return ""


def current_branch(cwd: Path) -> str:
    try:
        return _run(["rev-parse", "--abbrev-ref", "HEAD"], cwd).strip()
    except GitError:
        return ""


def head_sha(cwd: Path) -> str:
    try:
        return _run(["rev-parse", "HEAD"], cwd).strip()
    except GitError:
        return ""
