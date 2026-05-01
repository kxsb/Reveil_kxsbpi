#!/usr/bin/env python3

import argparse
import json
import math
import subprocess
from pathlib import Path

AUDIO_EXTS = {
    ".mp3", ".flac", ".wav", ".m4a", ".aac", ".ogg", ".opus", ".wma", ".alac", ".webm"
}

def is_audio_file(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in AUDIO_EXTS


def run_loudnorm_analysis(file_path: Path, target_lufs: float):
    """
    Lance ffmpeg en mode analyse loudnorm et récupère le JSON retourné.
    """
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-nostats",
        "-i", str(file_path),
        "-af", f"loudnorm=I={target_lufs}:LRA=11:TP=-1.5:print_format=json",
        "-f", "null",
        "-"
    ]

    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffmpeg failed")

    stderr = result.stderr

    start = stderr.rfind("{")
    end = stderr.rfind("}")

    if start == -1 or end == -1 or end <= start:
        raise RuntimeError("Impossible de trouver le JSON loudnorm dans la sortie ffmpeg")

    json_blob = stderr[start:end + 1]

    try:
        data = json.loads(json_blob)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"JSON loudnorm invalide: {e}")

    return data


def parse_float(value, default=None):
    try:
        if value in (None, "inf", "-inf", "nan"):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def analyze_file(file_path: Path, target_lufs: float, max_gain_abs: float):
    data = run_loudnorm_analysis(file_path, target_lufs)

    input_i = parse_float(data.get("input_i"))
    input_tp = parse_float(data.get("input_tp"))
    input_lra = parse_float(data.get("input_lra"))
    input_thresh = parse_float(data.get("input_thresh"))
    output_i = parse_float(data.get("output_i"))
    output_tp = parse_float(data.get("output_tp"))
    output_lra = parse_float(data.get("output_lra"))
    output_thresh = parse_float(data.get("output_thresh"))
    target_offset = parse_float(data.get("target_offset"))

    if input_i is None:
        raise RuntimeError("input_i introuvable dans l'analyse loudnorm")

    recommended_gain_db = target_lufs - input_i
    recommended_gain_db = clamp(recommended_gain_db, -max_gain_abs, max_gain_abs)

    return {
        "input_i": input_i,
        "input_tp": input_tp,
        "input_lra": input_lra,
        "input_thresh": input_thresh,
        "output_i": output_i,
        "output_tp": output_tp,
        "output_lra": output_lra,
        "output_thresh": output_thresh,
        "target_offset": target_offset,
        "recommended_gain_db": round(recommended_gain_db, 2),
    }


def main():
    parser = argparse.ArgumentParser(
        description="Analyse la loudness des fichiers audio et génère un loudness_index.json"
    )
    parser.add_argument("music_dir", help="Dossier racine contenant la musique")
    parser.add_argument(
        "-o", "--output",
        default="loudness_index.json",
        help="Fichier JSON de sortie (défaut: loudness_index.json)"
    )
    parser.add_argument(
        "--target-lufs",
        type=float,
        default=-18.0,
        help="Cible LUFS (défaut: -18.0)"
    )
    parser.add_argument(
        "--max-gain-abs",
        type=float,
        default=8.0,
        help="Gain absolu max autorisé en dB (défaut: 8.0)"
    )
    parser.add_argument(
        "--relative-paths",
        action="store_true",
        help="Stocke les chemins relatifs au dossier source au lieu des chemins absolus"
    )

    args = parser.parse_args()

    music_dir = Path(args.music_dir).expanduser().resolve()
    output_file = Path(args.output).expanduser().resolve()

    if not music_dir.exists() or not music_dir.is_dir():
        raise SystemExit(f"Dossier introuvable ou invalide: {music_dir}")

    audio_files = sorted(
        p for p in music_dir.rglob("*")
        if is_audio_file(p)
    )

    if not audio_files:
        raise SystemExit("Aucun fichier audio trouvé.")

    index = {}
    total = len(audio_files)

    print(f"{total} fichier(s) audio trouvé(s). Analyse en cours...")

    for i, file_path in enumerate(audio_files, start=1):
        try:
            analysis = analyze_file(file_path, args.target_lufs, args.max_gain_abs)
            key = str(file_path.relative_to(music_dir)) if args.relative_paths else str(file_path)
            index[key] = analysis
            print(f"[{i}/{total}] OK  {file_path.name}  gain={analysis['recommended_gain_db']} dB")
        except Exception as e:
            key = str(file_path.relative_to(music_dir)) if args.relative_paths else str(file_path)
            index[key] = {
                "error": str(e)
            }
            print(f"[{i}/{total}] ERR {file_path.name}  {e}")

    payload = {
        "meta": {
            "target_lufs": args.target_lufs,
            "max_gain_abs_db": args.max_gain_abs,
            "root": str(music_dir),
            "path_mode": "relative" if args.relative_paths else "absolute"
        },
        "tracks": index
    }

    with output_file.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"\nFichier généré : {output_file}")


if __name__ == "__main__":
    main()
