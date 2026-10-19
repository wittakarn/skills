"""Loyalty points."""


def earn(amount: float, tier: str = "basic") -> int:
    points = int(amount // 25)
    return points * 2 if tier == "gold" else points


def label(points: int) -> str:
    return f"{points} pts"
