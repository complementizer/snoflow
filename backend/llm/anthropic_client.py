from __future__ import annotations

import json
from typing import Any

import anthropic

from .base import LLMClient


class AnthropicClient(LLMClient):

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self._model = model

    @property
    def model_name(self) -> str:
        return self._model

    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 2000,
        json_mode: bool = False,
    ) -> str:
        prompt = user_prompt
        if json_mode:
            prompt += "\n\nRespond with valid JSON only."

        resp = await self._client.messages.create(
            model=self._model,
            system=system_prompt,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            max_tokens=max_tokens,
        )

        return resp.content[0].text if resp.content else ""

    async def chat_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        system: str,
        temperature: float = 0.3,
        max_tokens: int = 2000,
    ) -> tuple[str, list[dict[str, Any]]]:
        resp = await self._client.messages.create(
            model=self._model,
            system=system,
            messages=messages,
            tools=tools,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        blocks: list[dict[str, Any]] = []
        for block in resp.content:
            if block.type == "text":
                blocks.append({"type": "text", "text": block.text})
            elif block.type == "tool_use":
                blocks.append({
                    "type": "tool_use",
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                })

        stop_reason = "tool_use" if resp.stop_reason == "tool_use" else "end_turn"
        return stop_reason, blocks

    async def test_connection(self) -> bool:
        try:
            await self.complete("You are a test.", "Reply with 'ok'.", max_tokens=5)
            return True
        except Exception:
            return False
