from __future__ import annotations

import time
import json
from dataclasses import dataclass
from typing import Any

from sqlalchemy import Integer, String, Text, BigInteger, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.config import settings


class Base(DeclarativeBase):
    pass


class RoomTreeState(Base):
    __tablename__ = "room_tree_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    json_blob: Mapped[str] = mapped_column(Text)
    updated_ms: Mapped[int] = mapped_column(BigInteger)


class ChatLog(Base):
    __tablename__ = "chat_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(String(64), index=True)
    player_id: Mapped[str] = mapped_column(String(64))
    player_name: Mapped[str] = mapped_column(String(64))
    player_ip: Mapped[str] = mapped_column(String(64))
    message: Mapped[str] = mapped_column(Text)
    created_ms: Mapped[int] = mapped_column(BigInteger, index=True)


@dataclass(slots=True)
class MySqlRepo:
    engine: AsyncEngine | None = None
    session_factory: async_sessionmaker[AsyncSession] | None = None

    async def connect(self) -> None:
        if settings.mysql_dsn is None:
            self.engine = None
            self.session_factory = None
            return
        self.engine = create_async_engine(settings.mysql_dsn, pool_pre_ping=True, pool_recycle=1800)
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False)

    async def close(self) -> None:
        if self.engine is None:
            return
        await self.engine.dispose()
        self.engine = None
        self.session_factory = None

    async def ensure_schema(self) -> None:
        if self.engine is None:
            return
        try:
            async with self.engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
                # Fix column types for existing tables
                try:
                    await conn.execute(text("ALTER TABLE room_tree_state MODIFY updated_ms BIGINT"))
                    await conn.execute(text("ALTER TABLE chat_log MODIFY created_ms BIGINT"))
                except Exception:
                    pass
        except Exception as e:
            if not self._is_unknown_database_error(e):
                raise
            await self._ensure_database_exists()
            async with self.engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)

    def _is_unknown_database_error(self, e: Exception) -> bool:
        s = str(e).lower()
        return "unknown database" in s or "1049" in s

    async def _ensure_database_exists(self) -> None:
        if settings.mysql_dsn is None:
            return
        url = make_url(settings.mysql_dsn)
        db = url.database
        if not db:
            return
        server_url = url.set(database=None)
        server_engine = create_async_engine(str(server_url), pool_pre_ping=True, pool_recycle=1800)
        try:
            async with server_engine.begin() as conn:
                await conn.exec_driver_sql(
                    "CREATE DATABASE IF NOT EXISTS "
                    + f"`{db}`"
                    + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
        finally:
            await server_engine.dispose()

    async def get_room_state(self, room_id: str) -> dict[str, Any] | None:
        if self.session_factory is None:
            return None
        async with self.session_factory() as session:
            row = await session.scalar(select(RoomTreeState).where(RoomTreeState.room_id == room_id))
            if row is None:
                return None
            try:
                value = json.loads(row.json_blob)
            except Exception:
                return None
            if not isinstance(value, dict):
                return None
            return value

    async def upsert_room_state(self, room_id: str, state: dict[str, Any]) -> None:
        if self.session_factory is None:
            return
        blob = json.dumps(state, ensure_ascii=False)
        updated_ms = int(state.get("updated_ms") or 0) or int(time.time() * 1000)
        async with self.session_factory() as session:
            row = await session.scalar(select(RoomTreeState).where(RoomTreeState.room_id == room_id))
            if row is None:
                row = RoomTreeState(room_id=room_id, json_blob=blob, updated_ms=updated_ms)
                session.add(row)
            else:
                row.json_blob = blob
                row.updated_ms = updated_ms
            await session.commit()

    async def insert_chat_message(
        self,
        room_id: str,
        player_id: str,
        player_name: str,
        player_ip: str,
        message: str,
        created_ms: int,
    ) -> None:
        if self.session_factory is None:
            return
        async with self.session_factory() as session:
            row = ChatLog(
                room_id=room_id,
                player_id=player_id,
                player_name=player_name,
                player_ip=player_ip,
                message=message,
                created_ms=created_ms,
            )
            session.add(row)
            await session.commit()

    async def delete_chat_history(self, room_id: str) -> None:
        if self.session_factory is None:
            return
        async with self.session_factory() as session:
            from sqlalchemy import delete
            stmt = delete(ChatLog).where(ChatLog.room_id == room_id)
            await session.execute(stmt)
            await session.commit()
