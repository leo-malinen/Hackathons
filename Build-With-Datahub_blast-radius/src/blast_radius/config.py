"""Settings: env vars > blast-radius.yml > defaults."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

try:  # PyYAML is a hard dep, but never let config kill the run
    import yaml
except Exception:  # pragma: no cover
    yaml = None  # type: ignore

SEVERITY_ORDER = ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"]


def _truthy(value: Optional[str], default: bool = False) -> bool:
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on", "y"}


def load_dotenv(path: Path) -> None:
    """Minimal .env loader (no dependency, never overrides real env vars)."""
    if not path.is_file():
        return
    try:
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except OSError:
        pass


@dataclass
class Settings:
    # --- repo ------------------------------------------------------------
    repo_root: Path = field(default_factory=Path.cwd)
    output_dir: Path = field(default_factory=lambda: Path.cwd() / ".blast-radius")

    # --- DataHub ---------------------------------------------------------
    datahub_gms_url: str = "http://localhost:8080"
    datahub_gms_token: str = ""
    datahub_frontend_url: str = ""
    context_source: str = "auto"  # auto | sdk | mcp | fixture
    mcp_command: str = "npx -y @acryldata/mcp-server-datahub"
    mutations_enabled: bool = True

    # --- LLM (OpenRouter) ------------------------------------------------
    llm_enabled: bool = True
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    model: str = "openai/gpt-4o-mini"
    temperature: float = 0.1
    max_tokens: int = 3000
    app_url: str = "https://github.com/your-org/blast-radius"
    app_title: str = "Blast Radius"

    # --- GitHub ----------------------------------------------------------
    github_token: str = ""
    github_repository: str = ""
    github_api_url: str = "https://api.github.com"
    github_server_url: str = "https://github.com"
    pr_number: Optional[int] = None
    head_sha: str = ""

    # --- policy ----------------------------------------------------------
    fail_on: str = "CRITICAL"
    max_hops: int = 6
    writeback: bool = True
    prefer_proposals: bool = True
    open_companion_pr: bool = True
    companion_branch_prefix: str = "blast-radius/migration"
    dry_run: bool = False

    # --- raw yaml --------------------------------------------------------
    raw: Dict[str, Any] = field(default_factory=dict)

    # ---------------------------------------------------------------------
    @classmethod
    def load(cls, repo_root: Optional[Path] = None, **overrides: Any) -> "Settings":
        root = Path(repo_root or os.environ.get("GITHUB_WORKSPACE") or Path.cwd()).resolve()
        load_dotenv(root / ".env")

        cfg: Dict[str, Any] = {}
        cfg_path = root / "blast-radius.yml"
        if cfg_path.is_file() and yaml is not None:
            try:
                cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
            except Exception:
                cfg = {}

        env = os.environ.get
        remediation = cfg.get("remediation") or {}

        pr_number = env("BLAST_RADIUS_PR_NUMBER") or env("PR_NUMBER") or ""

        s = cls(
            repo_root=root,
            output_dir=root / ".blast-radius",
            datahub_gms_url=env("DATAHUB_GMS_URL", "") or cfg.get("datahub_gms_url", "") or "http://localhost:8080",
            datahub_gms_token=env("DATAHUB_GMS_TOKEN", "") or env("DATAHUB_TOKEN", "") or "",
            datahub_frontend_url=env("DATAHUB_FRONTEND_URL", "") or cfg.get("datahub_frontend_url", "") or "",
            context_source=(env("BLAST_RADIUS_CONTEXT_SOURCE") or cfg.get("context_source") or "auto").lower(),
            mcp_command=env("BLAST_RADIUS_MCP_COMMAND") or cfg.get("mcp_command") or "npx -y @acryldata/mcp-server-datahub",
            mutations_enabled=_truthy(env("TOOLS_IS_MUTATION_ENABLED"), True),
            llm_enabled=_truthy(env("BLAST_RADIUS_LLM_ENABLED"), True),
            openrouter_api_key=(
                env("OPENROUTER_API_KEY", "")
                or env("OPENAI_API_KEY", "")
                or ""
            ),
            openrouter_base_url=env("OPENROUTER_BASE_URL", "") or env("OPENAI_BASE_URL", "") or "https://openrouter.ai/api/v1",
            model=env("BLAST_RADIUS_MODEL", "") or cfg.get("model", "") or "openai/gpt-4o-mini",
            app_url=env("OPENROUTER_APP_URL", "") or "https://github.com/your-org/blast-radius",
            app_title=env("OPENROUTER_APP_TITLE", "") or "Blast Radius",
            github_token=env("GITHUB_TOKEN", "") or env("GH_TOKEN", "") or "",
            github_repository=env("GITHUB_REPOSITORY", "") or "",
            github_api_url=env("GITHUB_API_URL", "") or "https://api.github.com",
            github_server_url=env("GITHUB_SERVER_URL", "") or "https://github.com",
            pr_number=int(pr_number) if str(pr_number).isdigit() else None,
            head_sha=env("GITHUB_HEAD_SHA", "") or env("GITHUB_SHA", "") or "",
            fail_on=(env("BLAST_RADIUS_FAIL_ON") or cfg.get("fail_on") or "CRITICAL").upper(),
            max_hops=int(env("BLAST_RADIUS_MAX_HOPS") or cfg.get("max_hops") or 6),
            writeback=_truthy(env("BLAST_RADIUS_WRITEBACK"), bool(cfg.get("writeback", True))),
            prefer_proposals=bool(cfg.get("prefer_proposals", True)),
            open_companion_pr=bool(remediation.get("open_companion_pr", True)),
            companion_branch_prefix=str(
                remediation.get("companion_branch_prefix", "blast-radius/migration")
            ),
            raw=cfg,
        )

        for key, value in overrides.items():
            if value is not None and hasattr(s, key):
                setattr(s, key, value)

        if not s.datahub_frontend_url:
            s.datahub_frontend_url = s.datahub_gms_url.replace(":8080", ":9002")
        if s.fail_on not in SEVERITY_ORDER and s.fail_on != "NEVER":
            s.fail_on = "CRITICAL"
        return s

    # ---------------------------------------------------------------------
    @property
    def llm_ready(self) -> bool:
        return bool(self.llm_enabled and self.openrouter_api_key)

    @property
    def github_ready(self) -> bool:
        return bool(self.github_token and self.github_repository)

    def section(self, *keys: str) -> Dict[str, Any]:
        node: Any = self.raw
        for k in keys:
            if not isinstance(node, dict):
                return {}
            node = node.get(k, {})
        return node if isinstance(node, dict) else {}

    def entity_url(self, urn: str) -> str:
        base = (self.datahub_frontend_url or "").rstrip("/")
        from urllib.parse import quote

        kind = urn.split(":")[2] if len(urn.split(":")) > 2 else "dataset"
        return f"{base}/{kind}/{quote(urn, safe='')}"

    def pr_url(self) -> Optional[str]:
        if self.github_repository and self.pr_number:
            return f"{self.github_server_url}/{self.github_repository}/pull/{self.pr_number}"
        return None
