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
