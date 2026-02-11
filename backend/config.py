"""Configuration settings for nanocode."""

import os

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

DEFAULT_LABELS = ["azione_richiesta", "informazione", "importante", "non_importante"]

MAX_BODY_CHARS = 4000


def load_openrouter_config(dotenv_path: str = ".env") -> dict[str, str | None]:
    """Read MODEL, OPENROUTER_API_KEY, and OPENROUTER_API_URL from a dotenv file.

    Args:
        dotenv_path: Path to the .env file (default: ".env")

    Returns:
        dict with keys 'MODEL', 'OPENROUTER_API_KEY', and 'OPENROUTER_API_URL' (values may be None)
    """
    config: dict[str, str | None] = {
        "MODEL": None,
        "OPENROUTER_API_KEY": None,
        "OPENROUTER_API_URL": None,
    }

    if not os.path.exists(dotenv_path):
        return config

    with open(dotenv_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip()
                if value.startswith('"') and value.endswith('"'):
                    value = value[1:-1]
                elif value.startswith("'") and value.endswith("'"):
                    value = value[1:-1]
                if key in config:
                    config[key] = value

    return config


# Load from .env first, fall back to environment variables
_env_config = load_openrouter_config()

OPENROUTER_KEY = _env_config.get("OPENROUTER_API_KEY")
MODEL = _env_config.get("MODEL")
API_URL = _env_config.get("OPENROUTER_API_URL")
