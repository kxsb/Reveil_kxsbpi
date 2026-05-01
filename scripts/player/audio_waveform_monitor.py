#!/usr/bin/env python3

import array
import json
import math
import os
import subprocess
import sys
import time
from collections import deque
from pathlib import Path


def atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def compute_level(raw: bytes) -> float:
    if not raw:
        return 0.0

    samples = array.array("h")
    samples.frombytes(raw)

    if sys.byteorder != "little":
        samples.byteswap()

    if not samples:
        return 0.0

    # RMS normalisé 0..1
    total = 0.0
    for sample in samples:
        x = sample / 32768.0
        total += x * x

    rms = math.sqrt(total / len(samples))

    # Compression douce pour avoir une waveform visible même à faible volume
    level = min(1.0, math.sqrt(rms) * 2.4)

    return round(level, 3)


def main():
    if len(sys.argv) < 3:
        print("Usage: audio_waveform_monitor.py <audio_url_or_file> <output_json>", file=sys.stderr)
        raise SystemExit(2)

    source = sys.argv[1]
    output_file = Path(sys.argv[2])

    bars = deque([0.0] * 18, maxlen=18)

    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "error",
        "-i", source,
        "-vn",
        "-ac", "1",
        "-ar", "8000",
        "-f", "s16le",
        "-"
    ]

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        bufsize=0,
    )

    try:
        atomic_write_json(output_file, {
            "ok": True,
            "active": True,
            "source": source,
            "ts": time.time(),
            "level": 0,
            "bars": list(bars),
        })

        # 8000 Hz mono s16le : 800 bytes ≈ 50 ms
        chunk_size = 800

        while True:
            raw = proc.stdout.read(chunk_size) if proc.stdout else b""

            if not raw:
                break

            level = compute_level(raw)
            bars.append(level)

            atomic_write_json(output_file, {
                "ok": True,
                "active": True,
                "source": source,
                "ts": time.time(),
                "level": level,
                "bars": list(bars),
            })

            time.sleep(0.01)

    finally:
        try:
            proc.terminate()
        except Exception:
            pass

        atomic_write_json(output_file, {
            "ok": False,
            "active": False,
            "ts": time.time(),
            "level": 0,
            "bars": [],
        })


if __name__ == "__main__":
    main()
