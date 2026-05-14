from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class LLMClient(ABC):

    @property
    @abstractmethod
    def model_name(self) -> str: ...

    @abstractmethod
    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 2000,
        json_mode: bool = False,
    ) -> str: ...

    @abstractmethod
    async def chat_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        system: str,
        temperature: float = 0.3,
        max_tokens: int = 2000,
    ) -> tuple[str, list[dict[str, Any]]]:
        """Run one turn of a tool-using conversation.

        Returns (stop_reason, content_blocks).
        stop_reason is "tool_use" or "end_turn".
        content_blocks is a list of dicts with "type" key
        ("text" or "tool_use").
        """
        ...

    @abstractmethod
    async def test_connection(self) -> bool: ...
