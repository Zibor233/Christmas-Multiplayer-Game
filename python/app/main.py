from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.game.room_manager import RoomManager
from app.storage.mysql_repo import MySqlRepo
from app.storage.redis_store import RedisStore
from app.ws import handle_ws


redis_store = RedisStore()
mysql_repo = MySqlRepo()
room_manager = RoomManager(redis=redis_store, mysql=mysql_repo)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await redis_store.connect()
    await mysql_repo.connect()
    await mysql_repo.ensure_schema()
    yield
    await redis_store.close()
    await mysql_repo.close()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_allow_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket(settings.ws_path)
async def ws_endpoint(ws: WebSocket) -> None:
    await handle_ws(ws, room_manager)

