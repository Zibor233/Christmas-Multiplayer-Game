from __future__ import annotations

import json
from typing import Any

from fastapi import WebSocket

from app.game.room_manager import RoomManager


def _sanitize_name(name: Any) -> str:
    if not isinstance(name, str):
        return "游客"
    name = name.strip()
    if not name:
        return "游客"
    if len(name) > 16:
        return name[:16]
    return name


def _sanitize_room_id(room_id: Any) -> str:
    if not isinstance(room_id, str):
        return "public"
    room_id = room_id.strip()
    if not room_id:
        return "public"
    if len(room_id) > 32:
        room_id = room_id[:32]
    safe = []
    for ch in room_id:
        if ch.isalnum() or ch in ("-", "_"):
            safe.append(ch)
    return "".join(safe) or "public"


async def handle_ws(ws: WebSocket, rooms: RoomManager) -> None:
    await ws.accept()
    player_id: str | None = None
    room = None
    try:
        raw = await ws.receive_text()
        msg = json.loads(raw)
        if not isinstance(msg, dict) or msg.get("type") != "hello":
            await ws.send_json({"type": "event.error", "payload": {"code": "bad_hello"}})
            await ws.close()
            return
        payload = msg.get("payload") or {}
        name = _sanitize_name(payload.get("name"))
        room_id = _sanitize_room_id(payload.get("room_id"))
        
        client_host = ws.client.host if ws.client else "unknown"
        
        room = await rooms.get_or_create(room_id)
        player_id = await room.add_player(ws, name=name, ip=client_host)

        await ws.send_json(
            {
                "type": "welcome",
                "payload": {
                    "player_id": player_id,
                    "room_id": room_id,
                    "phase": room.phase,
                },
            }
        )

        chat_history = await room.get_chat_history()
        if chat_history:
            await ws.send_json({"type": "chat.history", "payload": {"messages": chat_history}})

        while True:
            data = await ws.receive_json()
            if not isinstance(data, dict):
                continue
            t = data.get("type")
            payload2 = data.get("payload") or {}
            if t == "set_name":
                await room.set_name(player_id, _sanitize_name(payload2.get("name")))
            elif t == "input.move":
                await room.submit_move_input(player_id, payload2)
            elif t == "player.cosmetic":
                await room.set_cosmetic(player_id, payload2)
            elif t == "tree.place":
                await room.place_decoration(player_id, payload2)
            elif t == "chat.send":
                await room.send_chat(player_id, payload2)
            elif t == "chat.clear":
                password = str(payload2.get("password") or "")
                if password == "20251225":
                    await room.clear_chat()
                else:
                    await ws.send_json({"type": "event.notice", "payload": {"code": "wrong_password", "message": "管理员密码错误"}})
            else:
                await ws.send_json({"type": "event.notice", "payload": {"code": "unknown_type", "type": t}})
    except Exception as e:
        print(f"[WS ERROR] {e}")
    finally:
        if room is not None and player_id is not None:
            await room.remove_player(player_id)

