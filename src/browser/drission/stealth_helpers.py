"""
Stealth helpers for DrissionPage — human-like browser behavior.
Provides random delays, Bézier mouse movement, scroll jitter, and natural typing.
"""

import math
import random
import time
from typing import Tuple, List, Optional


def random_delay(min_ms: float = 200, max_ms: float = 800) -> None:
    """Sleep for a random duration between min_ms and max_ms milliseconds."""
    delay = random.uniform(min_ms, max_ms) / 1000.0
    time.sleep(delay)


def _bezier_point(t: float, p0: float, p1: float, p2: float, p3: float) -> float:
    """Compute a point on a cubic Bézier curve at parameter t."""
    return (
        (1 - t) ** 3 * p0
        + 3 * (1 - t) ** 2 * t * p1
        + 3 * (1 - t) * t ** 2 * p2
        + t ** 3 * p3
    )


def bezier_curve_points(
    start: Tuple[float, float],
    end: Tuple[float, float],
    num_points: int = 20,
) -> List[Tuple[int, int]]:
    """
    Generate points along a cubic Bézier curve from start to end.
    Control points are randomized to simulate natural hand movement.
    """
    x0, y0 = start
    x3, y3 = end

    dx = x3 - x0
    dy = y3 - y0
    dist = math.sqrt(dx * dx + dy * dy)

    # Randomize control points with some spread proportional to distance
    spread = max(dist * 0.3, 30)
    x1 = x0 + dx * random.uniform(0.2, 0.4) + random.uniform(-spread, spread)
    y1 = y0 + dy * random.uniform(0.2, 0.4) + random.uniform(-spread, spread)
    x2 = x0 + dx * random.uniform(0.6, 0.8) + random.uniform(-spread, spread)
    y2 = y0 + dy * random.uniform(0.6, 0.8) + random.uniform(-spread, spread)

    points = []
    for i in range(num_points + 1):
        t = i / num_points
        x = _bezier_point(t, x0, x1, x2, x3)
        y = _bezier_point(t, y0, y1, y2, y3)
        points.append((int(round(x)), int(round(y))))

    return points


def bezier_mouse_move(page, start: Tuple[int, int], end: Tuple[int, int]) -> None:
    """
    Move the mouse from start to end along a natural-looking Bézier curve.
    Each step has a small random delay to mimic human speed variation.
    """
    num_points = random.randint(15, 30)
    points = bezier_curve_points(
        (float(start[0]), float(start[1])),
        (float(end[0]), float(end[1])),
        num_points,
    )

    for px, py in points:
        try:
            page.actions.move(px, py)
        except Exception:
            # Some DrissionPage versions use different API
            try:
                page.actions.move_to(px, py)
            except Exception:
                break
        time.sleep(random.uniform(0.005, 0.025))


def random_scroll_jitter(page, max_delta: int = 100) -> None:
    """Perform a small random scroll to mimic human browsing behavior."""
    delta = random.randint(-max_delta, max_delta)
    if delta == 0:
        delta = random.choice([-30, 30])
    try:
        page.scroll.down(delta) if delta > 0 else page.scroll.up(abs(delta))
    except Exception:
        pass
    random_delay(100, 300)


def human_type(element, text: str, min_char_delay_ms: float = 50, max_char_delay_ms: float = 200) -> None:
    """
    Type text character by character with variable delays,
    mimicking human typing speed and occasional pauses.
    """
    for i, char in enumerate(text):
        try:
            element.input(char)
        except Exception:
            try:
                element.type(char)
            except Exception:
                break

        # Occasional longer pause (simulates thinking)
        if random.random() < 0.05:
            time.sleep(random.uniform(0.3, 0.8))
        else:
            time.sleep(random.uniform(min_char_delay_ms / 1000.0, max_char_delay_ms / 1000.0))


def get_random_viewport_point(width: int = 1920, height: int = 1080) -> Tuple[int, int]:
    """Get a random point within the viewport for initial mouse positioning."""
    x = random.randint(int(width * 0.1), int(width * 0.9))
    y = random.randint(int(height * 0.1), int(height * 0.9))
    return (x, y)


def add_human_noise_to_coords(x: int, y: int, max_offset: int = 3) -> Tuple[int, int]:
    """Add small random noise to coordinates to avoid pixel-perfect clicks."""
    nx = x + random.randint(-max_offset, max_offset)
    ny = y + random.randint(-max_offset, max_offset)
    return (max(0, nx), max(0, ny))
