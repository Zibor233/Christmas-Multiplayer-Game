from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.game.types import clamp


@dataclass(frozen=True, slots=True)
class MoveConstraints:
    max_speed: float
    max_accel: float
    min_x: float
    max_x: float
    min_z: float
    max_z: float


def apply_move_constraints(x: float, z: float, vx: float, vz: float, c: MoveConstraints) -> tuple[float, float, float, float, dict[str, Any]]:
    flags: dict[str, Any] = {}
    max_v = float(max(0.0, c.max_speed))
    vx2 = clamp(vx, -max_v, max_v)
    vz2 = clamp(vz, -max_v, max_v)
    if vx2 != vx or vz2 != vz:
        flags["speed_clamped"] = True

    x2 = clamp(x, c.min_x, c.max_x)
    z2 = clamp(z, c.min_z, c.max_z)
    if x2 != x:
        flags["x_clamped"] = True
    if z2 != z:
        flags["z_clamped"] = True

    if x2 != x:
        vx2 = 0.0
    if z2 != z:
        vz2 = 0.0

    return x2, z2, vx2, vz2, flags

