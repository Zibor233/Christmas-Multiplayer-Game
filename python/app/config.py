from __future__ import annotations

import os
from dataclasses import dataclass


def _get_env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value


def _get_env_int(name: str, default: int) -> int:
    raw = _get_env(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _get_env_float(name: str, default: float) -> float:
    raw = _get_env(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


@dataclass(frozen=True, slots=True)
class Settings:
    app_name: str = "christmas-ws"
    cors_allow_origins: tuple[str, ...] = ("*",)

    ws_path: str = "/ws"
    max_players_per_room: int = 12

    server_tick_hz: int = 20
    snapshot_hz: int = 15
    input_rate_limit_hz: int = 30

    player_max_speed: float = 3.5
    player_max_accel: float = 25.0
    world_min_x: float = -14.0
    world_max_x: float = 14.0
    world_min_z: float = -14.0
    world_max_z: float = 14.0

    tree_center_x: float = 0.0
    tree_center_z: float = 0.0
    tree_interact_radius: float = 7.5
    tree_max_decorations: int = 300

    redis_url: str | None = "redis://localhost:6379/2"
    mysql_dsn: str | None = "mysql+aiomysql://christmas:christmas@localhost:3306/christmas?charset=utf8mb4"

    @staticmethod
    def from_env() -> "Settings":
        cors_raw = _get_env("CORS_ALLOW_ORIGINS", "*") or "*"
        cors_allow_origins = tuple(x.strip() for x in cors_raw.split(",") if x.strip()) or ("*",)

        return Settings(
            app_name=_get_env("APP_NAME", "christmas-ws") or "christmas-ws",
            cors_allow_origins=cors_allow_origins,
            ws_path=_get_env("WS_PATH", "/ws") or "/ws",
            max_players_per_room=_get_env_int("MAX_PLAYERS_PER_ROOM", 12),
            server_tick_hz=_get_env_int("SERVER_TICK_HZ", 20),
            snapshot_hz=_get_env_int("SNAPSHOT_HZ", 15),
            input_rate_limit_hz=_get_env_int("INPUT_RATE_LIMIT_HZ", 30),
            player_max_speed=_get_env_float("PLAYER_MAX_SPEED", 3.5),
            player_max_accel=_get_env_float("PLAYER_MAX_ACCEL", 25.0),
            world_min_x=_get_env_float("WORLD_MIN_X", -14.0),
            world_max_x=_get_env_float("WORLD_MAX_X", 14.0),
            world_min_z=_get_env_float("WORLD_MIN_Z", -14.0),
            world_max_z=_get_env_float("WORLD_MAX_Z", 14.0),
            tree_center_x=_get_env_float("TREE_CENTER_X", 0.0),
            tree_center_z=_get_env_float("TREE_CENTER_Z", 0.0),
            tree_interact_radius=_get_env_float("TREE_INTERACT_RADIUS", 5.0),
            tree_max_decorations=_get_env_int("TREE_MAX_DECORATIONS", 300),
            redis_url=_get_env("REDIS_URL", "redis://localhost:6379/2"),
            mysql_dsn=_get_env(
                "MYSQL_DSN",
                "mysql+aiomysql://christmas:christmas@localhost:3306/christmas?charset=utf8mb4",
            ),
        )


settings = Settings.from_env()

