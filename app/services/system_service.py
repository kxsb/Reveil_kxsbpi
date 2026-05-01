import shutil
import subprocess
import time
from pathlib import Path


def format_bytes(value):
    value = float(value)
    units = ["o", "Ko", "Mo", "Go", "To"]

    for unit in units:
        if value < 1024 or unit == units[-1]:
            if unit == "o":
                return f"{int(value)} {unit}"
            return f"{value:.1f} {unit}"
        value /= 1024


def storage_status(path="/"):
    usage = shutil.disk_usage(path)
    used = usage.total - usage.free
    percent = round((used / usage.total) * 100, 1) if usage.total else 0

    return {
        "path": path,
        "total": usage.total,
        "used": used,
        "free": usage.free,
        "total_label": format_bytes(usage.total),
        "used_label": format_bytes(used),
        "free_label": format_bytes(usage.free),
        "percent": percent,
    }


def read_cpu_times():
    try:
        first = Path("/proc/stat").read_text(encoding="utf-8").splitlines()[0]
        parts = [int(x) for x in first.split()[1:]]
    except Exception:
        return None

    idle = parts[3] + (parts[4] if len(parts) > 4 else 0)
    total = sum(parts)

    return idle, total


def cpu_percent(sample_delay=0.12):
    first = read_cpu_times()
    if not first:
        return None

    time.sleep(sample_delay)

    second = read_cpu_times()
    if not second:
        return None

    idle_delta = second[0] - first[0]
    total_delta = second[1] - first[1]

    if total_delta <= 0:
        return None

    return round((1 - idle_delta / total_delta) * 100, 1)


def cpu_temperature():
    candidates = [
        Path("/sys/class/thermal/thermal_zone0/temp"),
    ]

    for path in candidates:
        try:
            raw = path.read_text(encoding="utf-8").strip()
            value = int(raw) / 1000
            return round(value, 1)
        except Exception:
            continue

    return None


def ram_status():
    data = {}

    try:
        for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
            if ":" not in line:
                continue

            key, rest = line.split(":", 1)
            value = rest.strip().split()[0]
            data[key] = int(value) * 1024
    except Exception:
        return None

    total = data.get("MemTotal", 0)
    available = data.get("MemAvailable", 0)
    used = max(0, total - available)
    percent = round((used / total) * 100, 1) if total else 0

    return {
        "total": total,
        "used": used,
        "available": available,
        "total_label": format_bytes(total),
        "used_label": format_bytes(used),
        "available_label": format_bytes(available),
        "percent": percent,
    }


def run_command(args, timeout=1.5):
    try:
        proc = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )

        if proc.returncode != 0:
            return ""

        return proc.stdout.strip()
    except Exception:
        return ""


def wifi_interface():
    out = run_command(["iw", "dev"])

    current = None

    for line in out.splitlines():
        line = line.strip()

        if line.startswith("Interface "):
            current = line.split(" ", 1)[1].strip()
            if current:
                return current

    # Fallback courant sur Raspberry Pi.
    if Path("/sys/class/net/wlan0").exists():
        return "wlan0"

    return ""


def wifi_quality_label(signal_dbm):
    if signal_dbm is None:
        return "indisponible"

    if signal_dbm >= -55:
        return "très bon"
    if signal_dbm >= -67:
        return "bon"
    if signal_dbm >= -75:
        return "moyen"

    return "faible"


def wifi_status():
    iface = wifi_interface()

    if not iface:
        return {
            "ok": False,
            "interface": "",
            "quality": "indisponible",
            "signal_dbm": None,
            "ssid": "",
            "message": "Aucune interface Wi-Fi détectée",
        }

    out = run_command(["iw", "dev", iface, "link"])

    if not out or "Not connected" in out:
        return {
            "ok": False,
            "interface": iface,
            "quality": "non connecté",
            "signal_dbm": None,
            "ssid": "",
            "message": "Wi-Fi non connecté",
        }

    signal = None
    ssid = ""

    for line in out.splitlines():
        line = line.strip()

        if line.startswith("SSID:"):
            ssid = line.split(":", 1)[1].strip()

        if line.startswith("signal:"):
            # Exemple : signal: -48 dBm
            parts = line.split()
            for part in parts:
                try:
                    signal = int(part)
                    break
                except ValueError:
                    continue

    return {
        "ok": True,
        "interface": iface,
        "quality": wifi_quality_label(signal),
        "signal_dbm": signal,
        "ssid": ssid,
        "message": "",
    }


def system_overview():
    cpu = cpu_percent()
    temp = cpu_temperature()
    ram = ram_status()

    return {
        "ok": True,
        "ts": int(time.time()),
        "storage": storage_status("/"),
        "wifi": wifi_status(),
        "cpu": {
            "percent": cpu,
            "temperature": temp,
        },
        "ram": ram,
    }
