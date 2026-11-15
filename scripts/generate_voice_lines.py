"""Record every Mission Control line once, in every language, as static audio files.

    # Final recordings with ElevenLabs (the key is used only while this runs):
    ELEVENLABS_API_KEY=... python -m scripts.generate_voice_lines --engine elevenlabs
    # Free placeholder recordings with the built-in macOS voices (for testing; replace before publishing):
    python -m scripts.generate_voice_lines --engine say

Reads   frontend/src/data/voiceLines.json   (the single source of every line's text)
Writes  frontend/public/voice/<lang>/<line>.<mp3|m4a>  and  frontend/public/voice/manifest.json

Only missing or changed lines are recorded: each manifest entry stores a hash of (engine, voice, model, text), so
re-running after editing one sentence re-records just that sentence. Nothing in the running app calls a voice
service; it only plays these files.
"""
import argparse
import hashlib
import json
import os
import ssl
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LINES = ROOT / "frontend" / "src" / "data" / "voiceLines.json"
OUT = ROOT / "frontend" / "public" / "voice"
MANIFEST = OUT / "manifest.json"

# macOS built-in voices used for placeholders (all ship with macOS; check with `say -v '?'`).
SAY_VOICES = {"en": "Samantha", "es": "Paulina", "fr": "Thomas", "hi": "Lekha", "zh": "Tingting"}
ELEVEN_DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"      # ElevenLabs stock voice; override with ELEVENLABS_VOICE_ID
ELEVEN_MODEL = "eleven_multilingual_v2"            # one voice speaks all five languages


def digest(*parts: str) -> str:
    return hashlib.sha256("\x1f".join(parts).encode()).hexdigest()[:16]


def ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def record_elevenlabs(text: str, target: Path, key: str, voice: str) -> None:
    request = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_64",
        data=json.dumps({"text": text, "model_id": ELEVEN_MODEL}).encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60, context=ssl_context()) as response:
            target.write_bytes(response.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")[:300]
        raise SystemExit(f"ElevenLabs returned HTTP {exc.code}: {body}") from None


def record_say(text: str, target: Path, voice: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        aiff = Path(tmp) / "line.aiff"
        subprocess.run(["say", "-v", voice, "-o", str(aiff), text], check=True)
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "48000", "-c", "1", str(aiff), str(target)], check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--engine", choices=["elevenlabs", "say"], required=True)
    parser.add_argument("--langs", default="", help="comma-separated subset, e.g. es,fr (default: all)")
    parser.add_argument("--force", action="store_true", help="re-record even unchanged lines")
    parser.add_argument("--dry-run", action="store_true", help="list what would be recorded and the character count")
    args = parser.parse_args()

    data = json.loads(LINES.read_text(encoding="utf-8"))
    langs = [lang for lang in data["languages"] if not args.langs or lang in args.langs.split(",")]
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.is_file() else {"lines": {}}
    manifest.setdefault("lines", {})

    key = os.environ.get("ELEVENLABS_API_KEY", "")
    voice = os.environ.get("ELEVENLABS_VOICE_ID", ELEVEN_DEFAULT_VOICE) if args.engine == "elevenlabs" else ""
    if args.engine == "elevenlabs" and not key and not args.dry_run:
        raise SystemExit("Set ELEVENLABS_API_KEY in the environment (never commit it).")
    extension = "mp3" if args.engine == "elevenlabs" else "m4a"

    todo = []
    for lang in langs:
        engine_voice = voice if args.engine == "elevenlabs" else SAY_VOICES[lang]
        for line_id, texts in data["lines"].items():
            text = texts[lang]
            stamp = digest(args.engine, engine_voice, ELEVEN_MODEL if args.engine == "elevenlabs" else "", text)
            entry = manifest["lines"].get(lang, {}).get(line_id)
            if not args.force and entry and entry.get("hash") == stamp and (OUT / entry["file"]).is_file():
                continue
            todo.append((lang, line_id, text, engine_voice, stamp))

    characters = sum(len(item[2]) for item in todo)
    print(f"{len(todo)} line(s) to record, {characters} characters ({args.engine}).")
    if args.dry_run or not todo:
        return
    for lang, line_id, text, engine_voice, stamp in todo:
        target_rel = f"{lang}/{line_id}.{extension}"
        target = OUT / target_rel
        target.parent.mkdir(parents=True, exist_ok=True)
        if args.engine == "elevenlabs":
            record_elevenlabs(text, target, key, engine_voice)
        else:
            record_say(text, target, engine_voice)
        old = manifest["lines"].get(lang, {}).get(line_id)
        if old and old["file"] != target_rel and (OUT / old["file"]).is_file():
            (OUT / old["file"]).unlink()                      # replaced by a different format/engine
        manifest["lines"].setdefault(lang, {})[line_id] = {
            "file": target_rel, "hash": stamp, "engine": args.engine, "voice": engine_voice,
            "placeholder": args.engine == "say",
        }
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")   # save as we go
        print(f"  {target_rel}")
    print(f"Done. Manifest: {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
