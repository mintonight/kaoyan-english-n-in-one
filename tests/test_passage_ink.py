#!/usr/bin/env python3
"""Behavioral tests for temporary passage ink on reading.html.

Run from the repo root or this directory:
  python3 tests/test_passage_ink.py
"""
from __future__ import annotations

import http.server
import os
import sys
import threading
from functools import partial
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HOST = "127.0.0.1"


def start_server():
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer((HOST, 0), handler)
    httpd.daemon_threads = True
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    port = httpd.server_address[1]
    return httpd, f"http://{HOST}:{port}/reading.html"


def wait_ink_ready(page):
    page.wait_for_function(
        """() => {
          const c = document.getElementById('passage-ink');
          const pane = document.getElementById('passage-pane');
          return !!(window.__readingInk && c && pane && c.width > 0 && pane.scrollHeight > 100);
        }"""
    )


def article_point(page, x_ratio=0.45, y_ratio=0.38):
    box = page.locator("#passage-pane").bounding_box()
    assert box, "passage pane not visible"
    return box["x"] + box["width"] * x_ratio, box["y"] + box["height"] * y_ratio


def question_point(page):
    box = page.locator("#questions-pane").bounding_box()
    assert box, "questions pane not visible"
    return box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.4


def draw_mouse_stroke(page, x, y, dx=90, dy=50):
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + dx, y + dy, steps=12)
    page.mouse.up()


def dispatch_touch_pointers(page, points, kind):
    """Dispatch pointer events with pointerType=touch for one or two fingers."""
    return page.evaluate(
        """({points, kind}) => {
          const canvas = document.getElementById('passage-ink');
          const pane = document.getElementById('passage-pane');
          function fire(type, p, extras) {
            const ev = new PointerEvent(type, Object.assign({
              bubbles: true,
              cancelable: true,
              pointerId: p.id,
              pointerType: 'touch',
              isPrimary: p.id === 1,
              clientX: p.x,
              clientY: p.y,
              button: 0,
              buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
              view: window
            }, extras || {}));
            canvas.dispatchEvent(ev);
          }
          if (kind === 'one-draw') {
            const a = points[0], b = points[1];
            fire('pointerdown', a);
            const steps = 8;
            for (let i = 1; i <= steps; i++) {
              fire('pointermove', {
                id: a.id,
                x: a.x + (b.x - a.x) * i / steps,
                y: a.y + (b.y - a.y) * i / steps
              });
            }
            fire('pointerup', b);
          } else if (kind === 'two-scroll') {
            const a = points[0], b = points[1], dy = points[2].dy;
            fire('pointerdown', a);
            fire('pointerdown', b);
            const steps = 10;
            for (let i = 1; i <= steps; i++) {
              const off = dy * i / steps;
              fire('pointermove', {id: a.id, x: a.x, y: a.y + off});
              fire('pointermove', {id: b.id, x: b.x, y: b.y + off});
            }
            fire('pointerup', {id: a.id, x: a.x, y: a.y + dy});
            fire('pointerup', {id: b.id, x: b.x, y: b.y + dy});
          }
          return {
            scrollTop: pane.scrollTop,
            strokes: window.__readingInk.strokeCount(),
            pixels: window.__readingInk.pixelCount(),
            active: window.__readingInk.isActive()
          };
        }""",
        {"points": points, "kind": kind},
    )


def snapshot_storage(page):
    return page.evaluate(
        """async () => {
          const ls = {};
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            ls[k] = localStorage.getItem(k);
          }
          let idb = [];
          if (indexedDB && indexedDB.databases) {
            try { idb = (await indexedDB.databases()).map(d => d.name); } catch (e) { idb = ['<error>']; }
          }
          const payload = window.KaoyanSync ? window.KaoyanSync.exportBackup() : '';
          return { ls, idb, payload };
        }"""
    )


def assert_true(cond, msg, failures):
    if not cond:
        failures.append(msg)
        print("  FAIL:", msg)
    else:
        print("  OK  :", msg)


def run():
    httpd, url = start_server()
    failures = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="chrome", headless=True, args=["--window-size=1440,900"])
            # ---- Desktop ----
            context = browser.new_context(viewport={"width": 1440, "height": 900}, has_touch=False)
            page = context.new_page()
            page.goto(url, wait_until="domcontentloaded")
            wait_ink_ready(page)

            btn = page.locator("#btn-passage-pen")
            assert_true(btn.is_visible(), "floating pen button is visible", failures)
            assert_true(page.evaluate("() => getComputedStyle(document.getElementById('btn-passage-pen')).position") == "absolute", "pen button is floating (absolute), not in article header flow", failures)
            header_box = page.locator(".passage-header").bounding_box()
            btn_box = btn.bounding_box()
            assert_true(header_box and btn_box and btn_box["y"] > header_box["y"] + header_box["height"], "pen button is not fixed at the article top", failures)

            before = snapshot_storage(page)
            pane_scroll = page.evaluate("() => document.getElementById('passage-pane').scrollTop")
            assert_true(pane_scroll == 0, "article starts at top", failures)

            # Wheel must scroll even after pen is turned on
            btn.click()
            assert_true(page.get_attribute("#btn-passage-pen", "aria-pressed") == "true", "pen button shows activated state", failures)
            assert_true(page.evaluate("() => window.__readingInk.isActive()") is True, "pen mode is on", failures)
            page.evaluate("() => { document.getElementById('passage-pane').style.scrollBehavior = 'auto'; }")
            x, y = article_point(page)
            page.mouse.move(x, y)
            page.mouse.wheel(0, 400)
            page.wait_for_timeout(80)
            scrolled = page.evaluate("() => document.getElementById('passage-pane').scrollTop")
            assert_true(scrolled > 40, f"PC wheel still scrolls article in pen mode (scrollTop={scrolled})", failures)

            # Scroll back and draw
            page.evaluate("() => { document.getElementById('passage-pane').scrollTop = 0; }")
            page.wait_for_timeout(40)
            x, y = article_point(page, 0.4, 0.42)
            before_strokes = page.evaluate("() => window.__readingInk.strokeCount()")
            draw_mouse_stroke(page, x, y, 110, 70)
            page.wait_for_timeout(40)
            after_draw = page.evaluate(
                "() => ({strokes: window.__readingInk.strokeCount(), pixels: window.__readingInk.pixelCount()})"
            )
            assert_true(after_draw["strokes"] > before_strokes, f"mouse drag draws a stroke (strokes={after_draw})", failures)
            assert_true(after_draw["pixels"] > 20, f"canvas has ink pixels after mouse drag ({after_draw['pixels']})", failures)

            # Drawing on questions pane must not add ink
            strokes_before_q = after_draw["strokes"]
            qx, qy = question_point(page)
            draw_mouse_stroke(page, qx, qy, 80, 40)
            page.wait_for_timeout(40)
            strokes_after_q = page.evaluate("() => window.__readingInk.strokeCount()")
            assert_true(strokes_after_q == strokes_before_q, f"drawing on questions pane does not add ink ({strokes_after_q} vs {strokes_before_q})", failures)

            # Ink stays visible after closing pen, but new drags do not draw; wheel still works
            pixels_open = page.evaluate("() => window.__readingInk.pixelCount()")
            btn.click()
            assert_true(page.get_attribute("#btn-passage-pen", "aria-pressed") == "false", "pen button inactive after toggle off", failures)
            assert_true(page.evaluate("() => window.__readingInk.isActive()") is False, "pen mode is off", failures)
            pixels_closed = page.evaluate("() => window.__readingInk.pixelCount()")
            assert_true(pixels_closed > 20 and pixels_closed >= pixels_open * 0.8, "ink remains visible after closing pen (until leave/refresh)", failures)

            x, y = article_point(page, 0.55, 0.5)
            draw_mouse_stroke(page, x, y, 80, 40)
            assert_true(page.evaluate("() => window.__readingInk.strokeCount()") == strokes_after_q, "closing pen restores pointer: drag no longer draws", failures)

            page.evaluate("() => { document.getElementById('passage-pane').scrollTop = 0; }")
            page.mouse.move(*article_point(page))
            page.mouse.wheel(0, 300)
            page.wait_for_timeout(80)
            scrolled2 = page.evaluate("() => document.getElementById('passage-pane').scrollTop")
            assert_true(scrolled2 > 30, f"wheel still scrolls after closing pen (scrollTop={scrolled2})", failures)

            after = snapshot_storage(page)
            new_ls_keys = sorted(set(after["ls"]) - set(before["ls"]))
            inkish = [k for k in new_ls_keys if "ink" in k.lower() or "annot" in k.lower() or "stroke" in k.lower() or "pen" in k.lower()]
            assert_true(not inkish, f"no new annotation localStorage keys {new_ls_keys}", failures)
            # Existing notes/log values must be unchanged by drawing
            for k, v in before["ls"].items():
                if k in after["ls"] and k != "kaoyan_reading_fontsize":
                    if after["ls"][k] != v:
                        # allow other incidental keys only if they don't mention ink
                        if "ink" in (after["ls"][k] or "").lower() or "stroke" in (after["ls"][k] or "").lower():
                            failures.append(f"storage key {k} gained ink data")
                            print("  FAIL: storage key", k, "gained ink data")
            assert_true(after["idb"] == before["idb"] or after["idb"] == [], f"IndexedDB unchanged {before['idb']} -> {after['idb']}", failures)
            assert_true("ink" not in after["payload"].lower() and "stroke" not in after["payload"].lower(), "export/sync payload does not contain ink data", failures)
            # payload still only has known reading fields
            payload_ok = page.evaluate(
                """() => {
                  const p = JSON.parse(window.KaoyanSync.exportBackup());
                  const readingKeys = Object.keys(p.reading || {}).sort();
                  return { readingKeys, hasInk: 'ink' in (p.reading || {}) || 'annotations' in (p.reading || {}) };
                }"""
            )
            assert_true(payload_ok["readingKeys"] == ["log", "notes"] and not payload_ok["hasInk"], f"sync reading keys stay notes+log ({payload_ok})", failures)

            # Leaving the article clears ink
            page.evaluate("() => { document.getElementById('passage-pane').scrollTop = 0; }")
            page.locator("#btn-directory").click()
            page.wait_for_selector("#directory-panel:not([hidden])")
            items = page.locator("#directory-list .dir-item")
            assert_true(items.count() >= 2, "directory has at least two passages", failures)
            items.nth(1).click()
            wait_ink_ready(page)
            page.wait_for_timeout(80)
            left = page.evaluate("() => ({strokes: window.__readingInk.strokeCount(), pixels: window.__readingInk.pixelCount()})")
            assert_true(left["strokes"] == 0 and left["pixels"] == 0, f"leaving article clears ink {left}", failures)

            # Draw again, refresh must clear
            btn.click()
            wait_ink_ready(page)
            draw_mouse_stroke(page, *article_point(page), 100, 60)
            page.wait_for_timeout(40)
            assert_true(page.evaluate("() => window.__readingInk.pixelCount()") > 20, "ink exists before refresh", failures)
            page.reload(wait_until="domcontentloaded")
            wait_ink_ready(page)
            refreshed = page.evaluate("() => ({strokes: window.__readingInk.strokeCount(), pixels: window.__readingInk.pixelCount(), active: window.__readingInk.isActive()})")
            assert_true(refreshed["strokes"] == 0 and refreshed["pixels"] == 0, f"refresh clears ink {refreshed}", failures)
            context.close()

            # ---- Narrow / touch viewport ----
            touch_ctx = browser.new_context(
                viewport={"width": 390, "height": 844},
                has_touch=True,
                is_mobile=True,
            )
            tpage = touch_ctx.new_page()
            tpage.goto(url, wait_until="domcontentloaded")
            wait_ink_ready(tpage)
            tpage.locator("#btn-passage-pen").click()
            tpage.wait_for_timeout(60)
            assert_true(tpage.evaluate("() => window.__readingInk.isActive()") is True, "narrow viewport: pen mode on", failures)

            pane_box = tpage.locator("#passage-pane").bounding_box()
            ax = pane_box["x"] + pane_box["width"] * 0.4
            ay = pane_box["y"] + pane_box["height"] * 0.35
            # One finger draws
            one = dispatch_touch_pointers(
                tpage,
                [{"id": 1, "x": ax, "y": ay}, {"id": 1, "x": ax + 80, "y": ay + 60}],
                "one-draw",
            )
            assert_true(one["strokes"] >= 1 and one["pixels"] > 10, f"touch one finger draws {one}", failures)
            # Two fingers scroll, should not add a comparable new stroke
            tpage.evaluate("() => { document.getElementById('passage-pane').style.scrollBehavior = 'auto'; document.getElementById('passage-pane').scrollTop = 0; }")
            strokes_before_two = one["strokes"]
            mid1x = pane_box["x"] + pane_box["width"] * 0.32
            mid2x = pane_box["x"] + pane_box["width"] * 0.58
            midy = pane_box["y"] + pane_box["height"] * 0.4
            # Fingers move up: content follows the fingers (same as native pan),
            # which increases scrollTop so later paragraphs come into view.
            two = dispatch_touch_pointers(
                tpage,
                [
                    {"id": 1, "x": mid1x, "y": midy},
                    {"id": 2, "x": mid2x, "y": midy},
                    {"dy": -180},
                ],
                "two-scroll",
            )
            assert_true(two["scrollTop"] > 40, f"two-finger slide scrolls article (scrollTop={two['scrollTop']})", failures)
            assert_true(two["strokes"] == strokes_before_two, f"two-finger slide does not draw extra ink ({two['strokes']} vs {strokes_before_two})", failures)

            # Pen off: one finger no longer draws
            tpage.locator("#btn-passage-pen").click()
            assert_true(tpage.evaluate("() => window.__readingInk.isActive()") is False, "narrow viewport: pen off", failures)
            off = dispatch_touch_pointers(
                tpage,
                [{"id": 1, "x": ax, "y": ay}, {"id": 1, "x": ax + 70, "y": ay + 40}],
                "one-draw",
            )
            assert_true(off["strokes"] == two["strokes"], "after closing pen, one-finger does not draw", failures)
            touch_ctx.close()
            browser.close()
    finally:
        httpd.shutdown()

    print()
    if failures:
        print(f"{len(failures)} failure(s)")
        for f in failures:
            print(" -", f)
        return 1
    print("All passage-ink behavioral tests passed.")
    return 0


if __name__ == "__main__":
    os.chdir(ROOT)
    sys.exit(run())
