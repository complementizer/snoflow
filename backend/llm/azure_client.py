from __future__ import annotations

from typing import Any

from openai import AsyncAzureOpenAI

from .base import LLMClient
from .openai_client import _convert_tools_to_openai


class AzureOpenAIClient(LLMClient):

    def __init__(
        self,
        endpoint: str,
        api_key: str,
        deployment_name: str,
        api_version: str = "2024-02-15-preview",
    ):
        self._client = AsyncAzureOpenAI(
            azure_endpoint=endpoint,
            api_key=api_key,
            api_version=api_version,
        )
        self._deployment = deployment_name

    @property
    def model_name(self) -> str:
        return self._deployment

    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 2000,
        json_mode: bool = False,
    ) -> str:
        kwargs: dict[str, Any] = {
            "model": self._deployment,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        resp = await self._client.chat.completions.create(**kwargs)
        return resp.choices[0].message.content or ""

    async def chat_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        system: str,
        temperature: float = 0.3,
        max_tokens: int = 2000,
    ) -> tuple[str, list[dict[str, Any]]]:
        full_messages = [{"role": "system", "content": system}] + messages
        oai_tools = _convert_tools_to_openai(tools)

        resp = await self._client.chat.completions.create(
            model=self._deployment,
            messages=full_messages,
            tools=oai_tools,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        choice = resp.choices[0]
        blocks: list[dict[str, Any]] = []

        if choice.message.content:
            blocks.append({"type": "text", "text": choice.message.content})

        if choice.message.tool_calls:
            import json
            for tc in choice.message.tool_calls:
                blocks.append({
                    "type": "tool_use",
                    "id": tc.id,
                    "name": tc.function.name,
                    "input": json.loads(tc.function.arguments),
                })

        stop_reason = "tool_use" if choice.message.tool_calls else "end_turn"
        return stop_reason, blocks

    async def test_connection(self) -> bool:
        try:
            await self.complete("You are a test.", "Reply with 'ok'.", max_tokens=5)
            return True
        except Exception:
            return False
