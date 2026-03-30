from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional

import yaml

# Module-level cache to avoid re-reading the YAML file repeatedly
_CACHED_CONFIG: Optional[Dict[str, Any]] = None
_DEFAULT_CONFIG_PATH = "config.yaml"


def load_config(config_path: str | None = None) -> Dict[str, Any]:
	"""Load and cache the YAML config.

	- If `config_path` is provided, the file is (re)loaded and cached.
	- If omitted, the cached config is returned if present; otherwise the
	  default path is loaded once and cached.
	"""
	global _CACHED_CONFIG

	if config_path:
		path = Path(config_path)
	else:
		path = Path(_DEFAULT_CONFIG_PATH)

	if not path.exists():
		raise FileNotFoundError(f"Missing config file: {path}")

	# If caller provided a path and cache exists for a different path, reload.
	if config_path or _CACHED_CONFIG is None:
		_CACHED_CONFIG = yaml.safe_load(path.read_text(encoding="utf-8")) or {}

	return _CACHED_CONFIG or {}


def get_postgres_config() -> Dict[str, Any]:
	cfg = load_config()
	return cfg.get("postgres") or {}


def get_llm_config() -> Dict[str, Any]:
	# Prefer llm, fallback to openai for older configs
	cfg = load_config()
	return (cfg.get("llm") or {}) or (cfg.get("openai") or {})


def get_security_config() -> Dict[str, Any]:
	cfg = load_config()
	return cfg.get("security") or {}


def get_debug_config() -> Dict[str, Any]:
	cfg = load_config()
	return cfg.get("debug") or {}


def get_agents() -> list:
	cfg = load_config()
	return cfg.get("agents") or []