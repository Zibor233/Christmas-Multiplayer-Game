from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.config import settings


@dataclass(slots=True)
class RedisStore:
    _client: Any | None = None

    async def connect(self) -> None:
        if settings.redis_url is None:
            self._client = None
            return
        import redis.asyncio as redis

        self._client = redis.from_url(settings.redis_url, decode_responses=True)
        try:
            await self._client.ping()
        except Exception:
            self._client = None

    async def close(self) -> None:
        if self._client is None:
            return
        try:
            await self._client.close()
        except Exception:
            pass
        self._client = None

    async def upsert_player(self, room_id: str, player_id: str, name: str) -> None:
        if self._client is None:
            return
        key = f"room:{room_id}:players"
        await self._client.hset(key, mapping={player_id: name})
        await self._client.expire(key, 6 * 3600)

    async def remove_player(self, room_id: str, player_id: str) -> None:
        if self._client is None:
            return
        key = f"room:{room_id}:players"
        await self._client.hdel(key, player_id)

    async def update_room_snapshot(self, room_id: str, snapshot_payload: dict[str, Any]) -> None:
        if self._client is None:
            return
        key = f"room:{room_id}:snapshot"
        await self._client.set(key, json.dumps(snapshot_payload, ensure_ascii=False))
        await self._client.expire(key, 3600)

    async def set_tree_state(self, room_id: str, tree_state: dict[str, Any]) -> None:
        if self._client is None:
            return
        key = f"room:{room_id}:tree"
        await self._client.set(key, json.dumps(tree_state, ensure_ascii=False))
        await self._client.expire(key, 24 * 3600)

    async def get_tree_state(self, room_id: str) -> dict[str, Any] | None:
        if self._client is None:
            return None
        key = f"room:{room_id}:tree"
        raw = await self._client.get(key)
        if not raw:
            return None
        try:
            value = json.loads(raw)
        except Exception:
            return None
        if not isinstance(value, dict):
            return None
        return value

    async def push_chat_message(self, room_id: str, msg: dict[str, Any]) -> None:
        if self._client is None:
            return
        key = f"room:{room_id}:chat"
        await self._client.lpush(key, json.dumps(msg, ensure_ascii=False))
        await self._client.ltrim(key, 0, 49)
        await self._client.expire(key, 6 * 3600)

    async def delete_chat_history(self, room_id: str) -> None:
        if self._client is None:
            return
        key = f"room:{room_id}:chat"
        await self._client.delete(key)

    async def get_chat_history(self, room_id: str) -> list[dict[str, Any]]:
        if self._client is None:
            return []
        key = f"room:{room_id}:chat"
        raw = await self._client.lrange(key, 0, 49)
        msgs: list[dict[str, Any]] = []
        for item in reversed(raw):
            try:
                value = json.loads(item)
            except Exception:
                continue
            if isinstance(value, dict):
                msgs.append(value)
        return msgs

