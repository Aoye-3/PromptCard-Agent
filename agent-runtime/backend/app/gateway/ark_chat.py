from __future__ import annotations

import json
from typing import Any

from volcenginesdkarkruntime import Ark


def complete_ark_chat(
    payload: dict[str, Any],
    *,
    api_base: str,
    credential: str,
    model_id: str,
) -> dict[str, Any]:
    messages = _ark_messages(
        str(payload.get("systemPrompt") or ""),
        payload.get("messages") or [],
    )
    tools = _ark_tools(payload.get("tools") or [])
    request: dict[str, Any] = {
        "model": model_id,
        "messages": messages,
    }
    if tools:
        request["tools"] = tools
        request["tool_choice"] = "auto"
    if isinstance(payload.get("temperature"), (int, float)):
        request["temperature"] = payload["temperature"]
    if isinstance(payload.get("maxTokens"), int):
        request["max_tokens"] = payload["maxTokens"]

    client = Ark(api_key=credential, base_url=api_base)
    response = client.chat.completions.create(**request)
    message = response.choices[0].message
    content: list[dict[str, Any]] = []
    if getattr(message, "content", None):
        content.append({"type": "text", "text": str(message.content)})
    for tool_call in getattr(message, "tool_calls", None) or []:
        raw_arguments = getattr(tool_call.function, "arguments", "{}")
        try:
            arguments = json.loads(raw_arguments)
        except (TypeError, json.JSONDecodeError):
            arguments = {}
        content.append(
            {
                "type": "toolCall",
                "id": str(tool_call.id),
                "name": str(tool_call.function.name),
                "arguments": arguments,
            }
        )
    usage = getattr(response, "usage", None)
    return {
        "content": content,
        "stopReason": "toolUse" if any(item["type"] == "toolCall" for item in content) else "stop",
        "usage": {
            "input": int(getattr(usage, "prompt_tokens", 0) or 0),
            "output": int(getattr(usage, "completion_tokens", 0) or 0),
            "cacheRead": 0,
            "cacheWrite": 0,
        },
    }


def _ark_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for tool in tools:
        name = str(tool.get("name") or "").strip()
        if not name:
            continue
        result.append(
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": str(tool.get("description") or ""),
                    "parameters": tool.get("parameters") or {
                        "type": "object",
                        "properties": {},
                    },
                },
            }
        )
    return result


def _ark_messages(system_prompt: str, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    if system_prompt:
        result.append({"role": "system", "content": system_prompt})
    for message in messages:
        role = message.get("role")
        if role == "user":
            result.append({"role": "user", "content": _user_content(message.get("content"))})
        elif role == "assistant":
            assistant: dict[str, Any] = {"role": "assistant"}
            text_parts = [
                str(item.get("text"))
                for item in message.get("content") or []
                if isinstance(item, dict) and item.get("type") == "text"
            ]
            assistant["content"] = "\n".join(text_parts) or None
            tool_calls = [
                {
                    "id": str(item.get("id")),
                    "type": "function",
                    "function": {
                        "name": str(item.get("name")),
                        "arguments": json.dumps(
                            item.get("arguments") or {},
                            ensure_ascii=False,
                        ),
                    },
                }
                for item in message.get("content") or []
                if isinstance(item, dict) and item.get("type") == "toolCall"
            ]
            if tool_calls:
                assistant["tool_calls"] = tool_calls
            result.append(assistant)
        elif role == "toolResult":
            result.append(
                {
                    "role": "tool",
                    "tool_call_id": str(message.get("toolCallId") or ""),
                    "content": _text_content(message.get("content")),
                }
            )
    return result


def _user_content(value: Any) -> Any:
    if isinstance(value, str):
        return value
    blocks = []
    for item in value or []:
        if not isinstance(item, dict):
            continue
        if item.get("type") == "text":
            blocks.append({"type": "text", "text": str(item.get("text") or "")})
        elif item.get("type") == "image":
            mime_type = str(item.get("mimeType") or "image/png")
            data = str(item.get("data") or "")
            blocks.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime_type};base64,{data}"},
                }
            )
    return blocks


def _text_content(value: Any) -> str:
    if isinstance(value, str):
        return value
    return "\n".join(
        str(item.get("text"))
        for item in value or []
        if isinstance(item, dict) and item.get("type") == "text"
    )
