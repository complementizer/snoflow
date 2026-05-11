from __future__ import annotations

import time

from fastapi import APIRouter

from ..deps import get_config, get_llm
from ..models import DiscussionRequest, DiscussionResponse
from ..prompts.loader import load_prompt_template

router = APIRouter()


@router.post("/api/v1/discussion", response_model=DiscussionResponse)
async def discuss(request: DiscussionRequest) -> DiscussionResponse:
    start = time.perf_counter()
    cfg = get_config()
    llm = get_llm()

    prompts_dir = None
    if cfg.prompts_dir:
        from pathlib import Path
        prompts_dir = Path(cfg.prompts_dir)

    system_prompt = load_prompt_template("discussion_system", prompts_dir=prompts_dir)

    context_msg = f"**Clinical Note:**\n{request.text}"

    messages = [
        {"role": "user", "content": context_msg},
        {"role": "assistant", "content": "I have the clinical note. How can I help?"},
    ]
    for m in request.messages:
        messages.append({"role": m.role, "content": m.content})

    last_user = messages[-1]["content"] if messages else ""

    conversation_context = "\n".join(
        f"[{m['role']}]: {m['content']}" for m in messages[:-1]
    )
    user_prompt = f"{conversation_context}\n\n[user]: {last_user}" if conversation_context else last_user

    response_text = await llm.complete(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.7,
        max_tokens=800,
    )

    return DiscussionResponse(
        response=response_text,
        processing_time_ms=(time.perf_counter() - start) * 1000,
    )
