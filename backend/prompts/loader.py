from __future__ import annotations

from pathlib import Path
from typing import Optional

_DEFAULT_PROMPTS_DIR = Path(__file__).parent


def load_prompt_template(
    name: str,
    prompts_dir: Optional[Path] = None,
) -> str:
    pdir = prompts_dir or _DEFAULT_PROMPTS_DIR
    filepath = pdir / f"{name}.md"

    if not filepath.exists():
        available = [f.stem for f in pdir.glob("*.md")] if pdir.exists() else []
        raise FileNotFoundError(
            f"Prompt template not found: {filepath}\n"
            f"Available templates: {available}"
        )

    return filepath.read_text(encoding="utf-8")
