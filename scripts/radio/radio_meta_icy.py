#!/usr/bin/env python3
import re
import sys
import json
import urllib.request


def icy_metadata(url):
    req = urllib.request.Request(
        url,
        headers={
            "Icy-MetaData": "1",
            "User-Agent": "ReveilPi/1.0",
        },
    )

    with urllib.request.urlopen(req, timeout=8) as r:
        metaint = r.headers.get("icy-metaint")

        if not metaint:
            return None

        metaint = int(metaint)

        r.read(metaint)

        length_byte = r.read(1)
        if not length_byte:
            return None

        metadata_length = length_byte[0] * 16
        if metadata_length <= 0:
            return None

        metadata = r.read(metadata_length).decode("utf-8", errors="ignore")

    match = re.search(r"StreamTitle='([^']*)'", metadata)
    if not match:
        return None

    stream_title = match.group(1).strip()

    if " - " in stream_title:
        artist, title = stream_title.split(" - ", 1)
    else:
        artist, title = "", stream_title

    return {
        "raw": stream_title,
        "artist": artist.strip(),
        "title": title.strip(),
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "URL manquante"}))
        return

    url = sys.argv[1]

    try:
        meta = icy_metadata(url)

        if not meta:
            print(json.dumps({
                "ok": True,
                "title": "",
                "artist": "",
                "raw": "",
            }, ensure_ascii=False))
            return

        print(json.dumps({
            "ok": True,
            "title": meta["title"],
            "artist": meta["artist"],
            "raw": meta["raw"],
        }, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({
            "ok": False,
            "error": str(e),
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()