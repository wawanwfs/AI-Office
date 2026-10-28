"""Real-browser layout regressions; called by the isolated runtime harness.

Requires a loaded Playwright page, no API mocks. WebGL fallback is not 3D proof.
"""


def check_header(page):
    return page.evaluate("""() => {
      const box = s => document.querySelector(s).getBoundingClientRect();
      const ticker = box('.ticker'), chip = box('.ticker-conn');
      const label = box('.ticker-conn span');
      const viewport = document.querySelector('.ticker-window');
      return {
        chipContained: chip.top >= ticker.top && chip.bottom <= ticker.bottom,
        labelContained: label.top >= ticker.top && label.bottom <= ticker.bottom,
        separateTrack: !!viewport && viewport.getBoundingClientRect().left >= chip.right,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    }""")


def check_toast(page):
    # Exercise the actual startup notification before its 3.5-second timeout.
    return page.evaluate("""() => {
      const toast = document.querySelector('.toast');
      if (!toast) throw new Error('Expected real startup toast');
      const t = toast.getBoundingClientRect();
      const h = document.querySelector('.hud').getBoundingClientRect();
      const d = document.querySelector('.dock').getBoundingClientRect();
      return {aboveHud: t.bottom + 8 <= h.top, aboveDock: t.bottom + 8 <= d.top,
        inViewport: t.left >= 0 && t.right <= innerWidth && t.top >= 0};
    }""")
