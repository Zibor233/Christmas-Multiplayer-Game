from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from app.game.room import Room
from app.storage.mysql_repo import MySqlRepo
from app.storage.redis_store import RedisStore


@dataclass(slots=True)
class RoomManager:
    redis: RedisStore
    mysql: MySqlRepo
    _rooms: dict[str, Room] = field(default_factory=dict)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def get_or_create(self, room_id: str) -> Room:
        async with self._lock:
            room = self._rooms.get(room_id)
            if room is None:
                room = Room(room_id=room_id, redis=self.redis, mysql=self.mysql)
                self._rooms[room_id] = room
        await room.start()
        return room

