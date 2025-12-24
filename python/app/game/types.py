from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


def clamp(v: float, lo: float, hi: float) -> float:
    return lo if v < lo else hi if v > hi else v


DecorationType = Literal["bell", "mini_hat", "tinsel"]


@dataclass(slots=True)
class PlayerKinematic:
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    vx: float = 0.0
    vz: float = 0.0
    yaw: float = 0.0


@dataclass(slots=True)
class PlayerCosmetic:
    hat: bool = False


@dataclass(slots=True)
class PlayerRuntime:
    player_id: str
    name: str
    ip: str = "unknown"
    kin: PlayerKinematic = field(default_factory=PlayerKinematic)
    last_input_seq: int = 0
    last_input_client_time_ms: int = 0
    cheat_flags: dict[str, Any] = field(default_factory=dict)
    cosmetic: PlayerCosmetic = field(default_factory=PlayerCosmetic)
    placed_count: int = 0


@dataclass(slots=True)
class Decoration:
    deco_id: str
    deco_type: DecorationType
    angle: float
    height: float
    placed_by: str
    placed_ms: int

