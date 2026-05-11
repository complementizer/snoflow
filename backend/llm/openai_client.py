from __future__ import annotations

from typing import Any

from openai import AsyncOpenAI

from .base import LLMClient


def _convert_tools_to_openai(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for t in tools:
        out.append({
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("input_schema", {}),
            },
        })
    return out


class OpenAIClient(LLMClient):

    def __init__(self, api_key: str, model: str = "gpt-4o-mini"):
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model

    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 2000,
        json_mode: bool = False,
    ) -> str:
        kwargs: dict[str, Any] = {
            "model": self._model,
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
            model=self._model,
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
