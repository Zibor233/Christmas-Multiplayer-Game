from __future__ import annotations

import asyncio
import math
import time
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from fastapi import WebSocket

from app.config import settings
from app.game.anti_cheat import MoveConstraints, apply_move_constraints
from app.game.types import Decoration, DecorationType, PlayerRuntime, clamp
from app.storage.mysql_repo import MySqlRepo
from app.storage.redis_store import RedisStore


def _now_ms() -> int:
    return int(time.time() * 1000)


def _normalize_axis(ax: float, az: float) -> tuple[float, float]:
    ax = clamp(ax, -1.0, 1.0)
    az = clamp(az, -1.0, 1.0)
    mag_sq = ax * ax + az * az
    if mag_sq <= 1.0:
        return ax, az
    mag = mag_sq**0.5
    return ax / mag, az / mag


@dataclass(slots=True)
class PlayerConn:
    ws: WebSocket
    runtime: PlayerRuntime
    last_sent_snapshot_ms: int = 0
    rate_tokens: float = 0.0
    rate_last_ms: int = field(default_factory=_now_ms)


@dataclass(slots=True)
class Room:
    room_id: str
    redis: RedisStore
    mysql: MySqlRepo
    phase: str = "PLAY"
    created_ms: int = field(default_factory=_now_ms)
    players: dict[str, PlayerConn] = field(default_factory=dict)
    decorations: dict[str, Decoration] = field(default_factory=dict)
    _tick_task: asyncio.Task[None] | None = None
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _closed: bool = False

    async def start(self) -> None:
        if self._tick_task is not None:
            return
        await self._hydrate_state()
        self._tick_task = asyncio.create_task(self._run_ticks())

    async def close(self) -> None:
        self._closed = True
        if self._tick_task is not None:
            self._tick_task.cancel()
        async with self._lock:
            conns = list(self.players.values())
            self.players.clear()
        for conn in conns:
            try:
                await conn.ws.close()
            except Exception:
                pass

    async def _hydrate_state(self) -> None:
        state = await self.redis.get_tree_state(self.room_id)
        if state is None:
            state = await self.mysql.get_room_state(self.room_id)
        if not isinstance(state, dict):
            return
        decos = state.get("decorations")
        if not isinstance(decos, list):
            return
        for d in decos:
            if not isinstance(d, dict):
                continue
            deco_id = str(d.get("id") or "")
            deco_type = d.get("type")
            if deco_type not in ("bell", "mini_hat", "tinsel"):
                continue
            try:
                angle = float(d.get("angle", 0.0))
                height = float(d.get("height", 0.2))
                placed_by = str(d.get("placed_by") or "")
                placed_ms = int(d.get("placed_ms") or 0)
            except Exception:
                continue
            if deco_id:
                self.decorations[deco_id] = Decoration(
                    deco_id=deco_id,
                    deco_type=deco_type,
                    angle=angle,
                    height=height,
                    placed_by=placed_by,
                    placed_ms=placed_ms,
                )

    async def add_player(self, ws: WebSocket, name: str, ip: str = "unknown") -> str:
        async with self._lock:
            if len(self.players) >= settings.max_players_per_room:
                raise ValueError("room_full")
            player_id = uuid4().hex
            runtime = PlayerRuntime(player_id=player_id, name=name, ip=ip)
            conn = PlayerConn(ws=ws, runtime=runtime)
            conn.rate_tokens = float(settings.input_rate_limit_hz)
            runtime.kin.x = float(clamp((len(self.players) - 2) * 1.2, settings.world_min_x, settings.world_max_x))
            runtime.kin.z = float(clamp(8.0, settings.world_min_z, settings.world_max_z))
            self.players[player_id] = conn
        await self.redis.upsert_player(self.room_id, player_id, name)
        return player_id

    async def remove_player(self, player_id: str) -> None:
        async with self._lock:
            self.players.pop(player_id, None)
        await self.redis.remove_player(self.room_id, player_id)

    async def set_name(self, player_id: str, name: str) -> None:
        async with self._lock:
            conn = self.players.get(player_id)
            if conn is None:
                return
            conn.runtime.name = name
        await self.redis.upsert_player(self.room_id, player_id, name)

    async def get_chat_history(self) -> list[dict[str, Any]]:
        return await self.redis.get_chat_history(self.room_id)

    async def send_chat(self, player_id: str, payload: dict[str, Any]) -> None:
        text = payload.get("text")
        if not isinstance(text, str):
            return
        text = text.strip()
        if not text:
            return
        if len(text) > 120:
            text = text[:120]
        now_ms = _now_ms()
        async with self._lock:
            conn = self.players.get(player_id)
            if conn is None:
                return
            msg = {
                "id": uuid4().hex,
                "room_id": self.room_id,
                "player_id": conn.runtime.player_id,
                "name": conn.runtime.name,
                "text": text,
                "server_time_ms": now_ms,
            }
            player_ip = conn.runtime.ip

        await self.redis.push_chat_message(self.room_id, msg)
        await self._broadcast({"type": "chat.message", "payload": msg})
        await self.mysql.insert_chat_message(
            room_id=self.room_id,
            player_id=msg["player_id"],
            player_name=msg["name"],
            player_ip=player_ip,
            message=msg["text"],
            created_ms=msg["server_time_ms"],
        )

    async def clear_chat(self) -> None:
        await self.redis.delete_chat_history(self.room_id)
        await self.mysql.delete_chat_history(self.room_id)
        await self._broadcast({"type": "chat.cleared", "payload": {}})

    async def set_cosmetic(self, player_id: str, payload: dict[str, Any]) -> None:
        hat = payload.get("hat")
        if not isinstance(hat, bool):
            return
        async with self._lock:
            conn = self.players.get(player_id)
            if conn is None:
                return
            conn.runtime.cosmetic.hat = hat

    async def place_decoration(self, player_id: str, payload: dict[str, Any]) -> None:
        deco_type = payload.get("type")
        if deco_type not in ("bell", "mini_hat", "tinsel"):
            return
        slot = payload.get("slot") or {}
        if not isinstance(slot, dict):
            slot = {}
        try:
            angle = float(slot.get("angle", 0.0))
            height = float(slot.get("height", 0.5))
        except Exception:
            return
        angle = float(angle % (math.pi * 2.0))
        height = float(clamp(height, 0.12, 1.28))
        now_ms = _now_ms()

        async with self._lock:
            conn = self.players.get(player_id)
            if conn is None:
                return
            dx = conn.runtime.kin.x - settings.tree_center_x
            dz = conn.runtime.kin.z - settings.tree_center_z
            if (dx * dx + dz * dz) ** 0.5 > settings.tree_interact_radius:
                return
            if len(self.decorations) >= settings.tree_max_decorations:
                return
            deco_id = uuid4().hex
            self.decorations[deco_id] = Decoration(
                deco_id=deco_id,
                deco_type=deco_type,
                angle=angle,
                height=height,
                placed_by=conn.runtime.player_id,
                placed_ms=now_ms,
            )
            conn.runtime.placed_count += 1

        deco_dict = {
            "id": deco_id,
            "type": deco_type,
            "angle": angle,
            "height": height,
            "placed_by": conn.runtime.player_id,
            "placed_ms": now_ms,
        }
        await self._broadcast({"type": "tree.placed", "payload": deco_dict})
        await self._persist_tree_state()

    async def submit_move_input(self, player_id: str, payload: dict[str, Any]) -> None:
        seq = int(payload.get("seq", 0))
        ax = float(payload.get("ax", 0.0))
        az = float(payload.get("az", 0.0))
        client_time_ms = int(payload.get("client_time_ms", 0))

        async with self._lock:
            conn = self.players.get(player_id)
            if conn is None:
                return
            if not self._rate_allow(conn):
                conn.runtime.cheat_flags["rate_limited"] = True
                return
            if seq <= conn.runtime.last_input_seq:
                return
            conn.runtime.last_input_seq = seq
            conn.runtime.last_input_client_time_ms = client_time_ms
            ax2, az2 = _normalize_axis(ax, az)
            conn.runtime.cheat_flags["last_axis"] = (ax2, az2)

    def _rate_allow(self, conn: PlayerConn) -> bool:
        now = _now_ms()
        dt_ms = max(0, now - conn.rate_last_ms)
        conn.rate_last_ms = now
        refill_per_ms = settings.input_rate_limit_hz / 1000.0
        conn.rate_tokens = min(settings.input_rate_limit_hz, conn.rate_tokens + dt_ms * refill_per_ms)
        if conn.rate_tokens < 1.0:
            return False
        conn.rate_tokens -= 1.0
        return True

    async def _run_ticks(self) -> None:
        tick_dt = 1.0 / max(1, settings.server_tick_hz)
        snapshot_interval_ms = int(1000 / max(1, settings.snapshot_hz))
        constraints = MoveConstraints(
            max_speed=settings.player_max_speed,
            max_accel=settings.player_max_accel,
            min_x=settings.world_min_x,
            max_x=settings.world_max_x,
            min_z=settings.world_min_z,
            max_z=settings.world_max_z,
        )

        last_tick = time.perf_counter()
        while not self._closed:
            now = time.perf_counter()
            elapsed = now - last_tick
            if elapsed < tick_dt:
                await asyncio.sleep(tick_dt - elapsed)
                continue
            last_tick = now
            try:
                await self._tick(constraints, tick_dt, snapshot_interval_ms)
            except Exception as e:
                print(f"[ROOM ERROR] {self.room_id}: {e}")

    async def _tick(self, constraints: MoveConstraints, dt: float, snapshot_interval_ms: int) -> None:
        now_ms = _now_ms()
        async with self._lock:
            conns = list(self.players.values())

            for conn in conns:
                axis = conn.runtime.cheat_flags.get("last_axis", (0.0, 0.0))
                ax, az = float(axis[0]), float(axis[1])
                target_vx = ax * settings.player_max_speed
                target_vz = az * settings.player_max_speed
                dvx = clamp(target_vx - conn.runtime.kin.vx, -settings.player_max_accel * dt, settings.player_max_accel * dt)
                dvz = clamp(target_vz - conn.runtime.kin.vz, -settings.player_max_accel * dt, settings.player_max_accel * dt)
                conn.runtime.kin.vx += dvx
                conn.runtime.kin.vz += dvz
                conn.runtime.kin.x += conn.runtime.kin.vx * dt
                conn.runtime.kin.z += conn.runtime.kin.vz * dt

                x, z, vx, vz, flags = apply_move_constraints(
                    conn.runtime.kin.x,
                    conn.runtime.kin.z,
                    conn.runtime.kin.vx,
                    conn.runtime.kin.vz,
                    constraints,
                )
                conn.runtime.kin.x = x
                conn.runtime.kin.z = z
                conn.runtime.kin.vx = vx
                conn.runtime.kin.vz = vz
                if flags:
                    conn.runtime.cheat_flags.update(flags)

            snapshot_targets = [c for c in conns if now_ms - c.last_sent_snapshot_ms >= snapshot_interval_ms]
            if not snapshot_targets:
                return

            players_payload = [
                {
                    "id": c.runtime.player_id,
                    "name": c.runtime.name,
                    "x": c.runtime.kin.x,
                    "y": c.runtime.kin.y,
                    "z": c.runtime.kin.z,
                    "vx": c.runtime.kin.vx,
                    "vz": c.runtime.kin.vz,
                    "yaw": c.runtime.kin.yaw,
                    "cosmetic": {"hat": bool(c.runtime.cosmetic.hat)},
                    "placed_count": int(c.runtime.placed_count),
                }
                for c in conns
            ]
            ack_map = {c.runtime.player_id: c.runtime.last_input_seq for c in conns}
            tree_payload = {
                "decorations": [
                    {
                        "id": d.deco_id,
                        "type": d.deco_type,
                        "angle": d.angle,
                        "height": d.height,
                        "placed_by": d.placed_by,
                        "placed_ms": d.placed_ms,
                    }
                    for d in self.decorations.values()
                ]
            }
            msg = {
                "type": "state.snapshot",
                "payload": {
                    "server_time_ms": now_ms,
                    "room_id": self.room_id,
                    "phase": self.phase,
                    "players": players_payload,
                    "ack": ack_map,
                    "tree": tree_payload,
                },
            }

            for c in snapshot_targets:
                c.last_sent_snapshot_ms = now_ms

        await self.redis.update_room_snapshot(self.room_id, msg["payload"])
        await self._broadcast(msg)

    async def _persist_tree_state(self) -> None:
        payload = {
            "room_id": self.room_id,
            "decorations": [
                {
                    "id": d.deco_id,
                    "type": d.deco_type,
                    "angle": d.angle,
                    "height": d.height,
                    "placed_by": d.placed_by,
                    "placed_ms": d.placed_ms,
                }
                for d in self.decorations.values()
            ],
        }
        await self.redis.set_tree_state(self.room_id, payload)
        await self.mysql.upsert_room_state(self.room_id, payload)

    async def _broadcast(self, message: dict[str, Any]) -> None:
        async with self._lock:
            conns = list(self.players.values())
        dead: list[str] = []
        for conn in conns:
            try:
                await conn.ws.send_json(message)
            except Exception:
                dead.append(conn.runtime.player_id)
        for pid in dead:
            await self.remove_player(pid)

