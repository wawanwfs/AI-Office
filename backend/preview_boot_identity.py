"""Linux boot identity for persisted preview leases, without Docker access."""
from pathlib import Path
import re

_BOOT = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\Z")


def current_boot_id():
    try:
        value = Path("/proc/sys/kernel/random/boot_id").read_text(encoding="ascii").strip()
    except (OSError, UnicodeError):
        return None
    return value if _BOOT.fullmatch(value) else None


def lease_matches_boot(boot_id):
    return isinstance(boot_id, str) and boot_id == current_boot_id()
