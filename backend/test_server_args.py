"""Unit test helper _clamp_int di server.py (parsing arg numerik toleran)."""
import server


def test_clamp_int_default_untuk_input_invalid():
    assert server._clamp_int("abc", 100, 10, 500) == 100
    assert server._clamp_int(None, 60, 1, 600) == 60
    assert server._clamp_int("12.5", 60, 1, 600) == 60  # float-string ≠ int


def test_clamp_int_clamp_rentang():
    assert server._clamp_int("0", 100, 10, 500) == 10        # di bawah lo
    assert server._clamp_int("9999", 100, 10, 500) == 500     # di atas hi
    assert server._clamp_int("42", 100, 10, 500) == 42        # di dalam rentang


def test_clamp_int_tanpa_rentang():
    assert server._clamp_int("-7", 60) == -7
    assert server._clamp_int(120, 60) == 120


def test_clamp_int_angka_benar_di_batas():
    assert server._clamp_int("10", 100, 10, 500) == 10
    assert server._clamp_int("500", 100, 10, 500) == 500
    assert server._clamp_int("1", 60, 1, 600) == 1
    assert server._clamp_int("600", 60, 1, 600) == 600


# ---------- helper parse /proc/meminfo & /proc/uptime (toleran) ----------

def test_parse_meminfo_normal():
    text = "MemTotal:       16384000 kB\nMemFree:         1024000 kB\nMemAvailable:    12345678 kB\n"
    out = server._parse_meminfo(text)
    assert out == {"MemTotal": 16000, "MemAvailable": 12056}
    assert isinstance(out["MemTotal"], int) and isinstance(out["MemAvailable"], int)


def test_parse_meminfo_malformed_dan_missing():
    # nilai non-numerik, baris tanpa colon, kosong → 0, tidak melempar
    text = "MemTotal:    abc kB\nMemAvailable:\nbaris-tanpa-colon\n"
    assert server._parse_meminfo(text) == {"MemTotal": 0, "MemAvailable": 0}
    assert server._parse_meminfo("") == {"MemTotal": 0, "MemAvailable": 0}
    # file hanya berisi baris lain (bukan MemTotal/MemAvailable)
    assert server._parse_meminfo("Dirty: 0 kB\n") == {"MemTotal": 0, "MemAvailable": 0}


def test_parse_meminfo_kunci_tak_dikenal_diabaikan():
    text = "MemTotal: 2048000 kB\nSwapTotal: 1024000 kB\nMemAvailable: 1024000 kB\n"
    out = server._parse_meminfo(text)
    assert "SwapTotal" not in out and out == {"MemTotal": 2000, "MemAvailable": 1000}


def test_parse_uptime_s_normal_dan_malformed():
    assert server._parse_uptime_s("1234.56 987.65") == 1234
    assert server._parse_uptime_s("42") == 42
    assert server._parse_uptime_s("") == 0
    assert server._parse_uptime_s("abc def") == 0
    assert server._parse_uptime_s("   ") == 0


def test_parse_loadavg_normal():
    assert server._parse_loadavg("0.05 0.10 0.15 1/234 5678") == "0.05"
    assert server._parse_loadavg("0.42") == "0.42"


def test_parse_loadavg_malformed_dan_missing():
    assert server._parse_loadavg("") == "0.00"
    assert server._parse_loadavg("   ") == "0.00"
    assert server._parse_loadavg(None) == "0.00"
    assert server._parse_loadavg("abc def") == "abc"  # token pertama tetap dikembalikan


# ---------- endpoint /api/status (guard anti-poisoning) ----------

def test_status_bentuk_normal_dan_kunci_lengkap():
    out = server.status()
    assert out["ok"] is True
    for k in ("disk_used_gb", "disk_total_gb", "mem_available_mb", "mem_total_mb",
              "uptime_s", "agents", "custom_cfg"):
        assert k in out


def test_status_toleran_proc_dan_disk_hilang(monkeypatch):
    # /proc/meminfo & /proc/uptime hilang/tak terbaca → fallback 0, tidak 500.
    import builtins
    real_open = builtins.open

    def fake_open(path, *a, **kw):
        if str(path).startswith("/proc/"):
            raise FileNotFoundError("no /proc in this env")
        return real_open(path, *a, **kw)

    monkeypatch.setattr(builtins, "open", fake_open)

    def fake_usage(_):
        raise OSError("disk tidak tersedia")

    monkeypatch.setattr("shutil.disk_usage", fake_usage)

    out = server.status()
    assert out["ok"] is True
    assert out["disk_used_gb"] == 0.0 and out["disk_total_gb"] == 0.0
    assert out["mem_available_mb"] == 0 and out["mem_total_mb"] == 0
    assert out["uptime_s"] == 0
