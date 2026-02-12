#!/usr/bin/env python3
"""
DrissionPage JSON-RPC Bridge for Sirabot.

Runs as a subprocess. Reads JSON-RPC commands from stdin, executes browser
actions via DrissionPage, and writes JSON-RPC responses to stdout.

Protocol:
  - Each request/response is a single JSON line terminated by newline.
  - Request:  {"id": 1, "method": "navigate", "params": {"url": "..."}}
  - Response: {"id": 1, "result": {...}} or {"id": 1, "error": {"code": -1, "message": "..."}}
"""

import base64
import json
import os
import sys
import traceback
from typing import Any, Dict, Optional

# Ensure stealth_helpers is importable from same directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from stealth_helpers import (
    add_human_noise_to_coords,
    bezier_mouse_move,
    get_random_viewport_point,
    human_type,
    random_delay,
    random_scroll_jitter,
)

# ── Globals ──
_page = None
_config: Dict[str, Any] = {}


def _send_response(msg_id: int, result: Any = None, error: Optional[Dict] = None) -> None:
    """Send a JSON-RPC response to stdout."""
    resp: Dict[str, Any] = {"id": msg_id}
    if error is not None:
        resp["error"] = error
    else:
        resp["result"] = result
    line = json.dumps(resp, ensure_ascii=False, default=str)
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def _send_error(msg_id: int, code: int, message: str, data: Any = None) -> None:
    err: Dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    _send_response(msg_id, error=err)


def _get_delay_range() -> tuple:
    """Get configured delay range."""
    min_ms = _config.get("minDelayMs", 200)
    max_ms = _config.get("maxDelayMs", 800)
    return (min_ms, max_ms)


def _apply_human_delay() -> None:
    """Apply a random delay if stealth mode is active."""
    min_ms, max_ms = _get_delay_range()
    random_delay(min_ms, max_ms)


# ── Action Handlers ──

def handle_init(params: Dict[str, Any]) -> Dict[str, Any]:
    """Initialize the DrissionPage browser."""
    global _page, _config

    try:
        from DrissionPage import ChromiumPage, ChromiumOptions
    except ImportError:
        raise RuntimeError(
            "DrissionPage is not installed. Run: pip install DrissionPage"
        )

    _config = params.get("stealth", {})

    co = ChromiumOptions()

    # Stealth settings
    if _config.get("headless", False):
        co.headless()

    if _config.get("executablePath"):
        co.set_browser_path(_config["executablePath"])

    if _config.get("proxy"):
        co.set_proxy(_config["proxy"])

    # Window size
    width = _config.get("windowWidth", 1920)
    height = _config.get("windowHeight", 1080)
    co.set_argument("--window-size", f"{width},{height}")

    # Anti-detection arguments
    if _config.get("disableWebdriverFlag", True):
        co.set_argument("--disable-blink-features", "AutomationControlled")

    co.set_argument("--disable-infobars")
    co.set_argument("--disable-extensions")
    co.set_argument("--no-first-run")
    co.set_argument("--no-default-browser-check")

    # User agent
    if _config.get("userAgent"):
        co.set_argument("--user-agent", _config["userAgent"])

    # Extra arguments
    for arg in _config.get("extraArgs", []):
        if "=" in arg:
            key, val = arg.split("=", 1)
            co.set_argument(key, val)
        else:
            co.set_argument(arg)

    _page = ChromiumPage(co)

    return {
        "status": "initialized",
        "windowSize": {"width": width, "height": height},
    }


def handle_navigate(params: Dict[str, Any]) -> Dict[str, Any]:
    """Navigate to a URL."""
    url = params.get("url", "")
    if not url:
        raise ValueError("url is required")

    _page.get(url)
    _apply_human_delay()

    return {
        "url": _page.url,
        "title": _page.title,
    }


def handle_click_element(params: Dict[str, Any]) -> Dict[str, Any]:
    """Click an element by CSS selector."""
    selector = params.get("selector", "")
    if not selector:
        raise ValueError("selector is required")

    element = _page.ele(selector)
    if element is None:
        raise ValueError(f"Element not found: {selector}")

    # Natural mouse movement to element if enabled
    if _config.get("naturalMouseMovement", True):
        try:
            rect = element.rect
            if rect:
                target_x = int(rect.midpoint[0])
                target_y = int(rect.midpoint[1])
                start = get_random_viewport_point(
                    _config.get("windowWidth", 1920),
                    _config.get("windowHeight", 1080),
                )
                target = add_human_noise_to_coords(target_x, target_y)
                bezier_mouse_move(_page, start, target)
        except Exception:
            pass

    element.click()
    _apply_human_delay()

    return {
        "success": True,
        "elementDescription": str(element.text)[:200] if element.text else "",
    }


def handle_click_xy(params: Dict[str, Any]) -> Dict[str, Any]:
    """Click at specific (x, y) coordinates — used by vision mode."""
    x = int(params.get("x", 0))
    y = int(params.get("y", 0))

    if _config.get("naturalMouseMovement", True):
        start = get_random_viewport_point(
            _config.get("windowWidth", 1920),
            _config.get("windowHeight", 1080),
        )
        target = add_human_noise_to_coords(x, y)
        bezier_mouse_move(_page, start, target)

    _page.actions.click(x, y)
    _apply_human_delay()

    return {"success": True, "x": x, "y": y}


def handle_type_text(params: Dict[str, Any]) -> Dict[str, Any]:
    """Type text into an element."""
    selector = params.get("selector", "")
    text = params.get("text", "")
    clear = params.get("clear", True)
    use_human_typing = params.get("humanTyping", True)

    if not selector:
        raise ValueError("selector is required")

    element = _page.ele(selector)
    if element is None:
        raise ValueError(f"Element not found: {selector}")

    if clear:
        try:
            element.clear()
        except Exception:
            pass

    if use_human_typing:
        human_type(element, text)
    else:
        element.input(text)

    _apply_human_delay()

    return {"success": True, "fieldDescription": selector}


def handle_screenshot(params: Dict[str, Any]) -> Dict[str, Any]:
    """Take a screenshot and return as base64."""
    fmt = params.get("format", "png")
    full_page = params.get("fullPage", False)

    # DrissionPage screenshot to bytes
    try:
        img_bytes = _page.get_screenshot(as_bytes=fmt, full_page=full_page)
    except TypeError:
        # Fallback for different DrissionPage versions
        img_bytes = _page.get_screenshot(as_bytes=True)

    b64 = base64.b64encode(img_bytes).decode("ascii")

    width = _config.get("windowWidth", 1920)
    height = _config.get("windowHeight", 1080)

    return {
        "base64": b64,
        "format": fmt,
        "width": width,
        "height": height,
    }


def handle_get_dom_map(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Scan the DOM and return interactive elements with auto-assigned numeric IDs.
    Used by text-mode (non-vision) AI interaction.
    """
    # JavaScript to extract interactive elements
    js_code = """
    (() => {
        const selectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [onclick], [tabindex]';
        const elements = document.querySelectorAll(selectors);
        const results = [];
        let id = 1;
        for (const el of elements) {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;
            if (window.getComputedStyle(el).display === 'none') continue;
            if (window.getComputedStyle(el).visibility === 'hidden') continue;

            const tag = el.tagName.toLowerCase();
            let type = tag;
            if (tag === 'input') type = 'input:' + (el.type || 'text');
            if (tag === 'a') type = 'link';
            if (el.getAttribute('role')) type = 'role:' + el.getAttribute('role');

            const text = (el.textContent || el.value || el.placeholder || el.getAttribute('aria-label') || '').trim().substring(0, 100);

            results.push({
                id: id++,
                selector: buildSelector(el),
                tag: tag,
                text: text,
                type: type,
                rect: {
                    x: Math.round(rect.x),
                    y: Math.round(rect.y),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                }
            });
        }
        return results;

        function buildSelector(el) {
            if (el.id) return '#' + CSS.escape(el.id);
            const tag = el.tagName.toLowerCase();
            const parent = el.parentElement;
            if (!parent) return tag;
            const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
            if (siblings.length === 1) return buildSelector(parent) + ' > ' + tag;
            const idx = siblings.indexOf(el) + 1;
            return buildSelector(parent) + ' > ' + tag + ':nth-child(' + idx + ')';
        }
    })()
    """

    elements = _page.run_js(js_code)

    return {
        "elements": elements or [],
        "url": _page.url,
        "title": _page.title,
    }


def handle_scroll(params: Dict[str, Any]) -> Dict[str, Any]:
    """Scroll the page."""
    direction = params.get("direction", "down")
    amount = int(params.get("amount", 300))

    if direction == "down":
        _page.scroll.down(amount)
    elif direction == "up":
        _page.scroll.up(amount)
    elif direction == "top":
        _page.scroll.to_top()
    elif direction == "bottom":
        _page.scroll.to_bottom()

    # Add jitter for realism
    if _config.get("naturalMouseMovement", True):
        random_scroll_jitter(_page, max_delta=30)

    _apply_human_delay()
    return {"success": True, "direction": direction}


def handle_wait(params: Dict[str, Any]) -> Dict[str, Any]:
    """Wait for a condition or fixed duration."""
    ms = int(params.get("ms", 1000))
    selector = params.get("selector")

    if selector:
        try:
            _page.wait.ele_displayed(selector, timeout=ms / 1000.0)
            return {"success": True, "waited_for": selector}
        except Exception:
            return {"success": False, "waited_for": selector, "timedOut": True}
    else:
        import time
        time.sleep(ms / 1000.0)
        return {"success": True, "waited_ms": ms}


def handle_execute_js(params: Dict[str, Any]) -> Dict[str, Any]:
    """Execute arbitrary JavaScript on the page."""
    code = params.get("code", "")
    if not code:
        raise ValueError("code is required")

    result = _page.run_js(code)
    return {"result": result}


def handle_close(params: Dict[str, Any]) -> Dict[str, Any]:
    """Close the browser."""
    global _page
    if _page:
        try:
            _page.quit()
        except Exception:
            pass
        _page = None
    return {"status": "closed"}


def handle_get_page_info(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get current page info."""
    return {
        "url": _page.url if _page else "",
        "title": _page.title if _page else "",
        "ready": _page is not None,
    }


# ── Method Dispatch ──

METHODS = {
    "init": handle_init,
    "navigate": handle_navigate,
    "click_element": handle_click_element,
    "click_xy": handle_click_xy,
    "type_text": handle_type_text,
    "screenshot": handle_screenshot,
    "get_dom_map": handle_get_dom_map,
    "scroll": handle_scroll,
    "wait": handle_wait,
    "execute_js": handle_execute_js,
    "close": handle_close,
    "get_page_info": handle_get_page_info,
}


def main() -> None:
    """Main loop: read JSON-RPC from stdin, dispatch, write response to stdout."""
    # Signal ready
    sys.stdout.write(json.dumps({"ready": True}) + "\n")
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        msg_id = 0
        try:
            req = json.loads(line)
            msg_id = req.get("id", 0)
            method = req.get("method", "")
            params = req.get("params", {})

            handler = METHODS.get(method)
            if handler is None:
                _send_error(msg_id, -32601, f"Method not found: {method}")
                continue

            if method != "init" and _page is None and method not in ("close",):
                _send_error(msg_id, -32000, "Browser not initialized. Call 'init' first.")
                continue

            result = handler(params)
            _send_response(msg_id, result)

        except Exception as e:
            tb = traceback.format_exc()
            _send_error(msg_id, -32000, str(e), {"traceback": tb})


if __name__ == "__main__":
    main()
