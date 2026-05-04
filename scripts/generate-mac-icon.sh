#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${ROOT}/assets/icon.png"
ICONSET="${ROOT}/assets/Stolow.iconset"
OUT="${ROOT}/assets/icon.icns"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "generate-mac-icon.sh は macOS（Darwin）でのみ実行できます。" >&2
  exit 1
fi

if [[ ! -f "$SRC" ]]; then
  echo "ソース画像が見つかりません: $SRC" >&2
  exit 1
fi

rm -rf "$ICONSET"
mkdir -p "$ICONSET"
trap 'rm -rf "$ICONSET"' EXIT

# iconutil は実際の PNG データを要求する（拡張子だけ .png では不可）
sips -s format png -z 16 16 "$SRC" --out "$ICONSET/icon_16x16.png" >/dev/null
sips -s format png -z 32 32 "$SRC" --out "$ICONSET/icon_16x16@2x.png" >/dev/null
sips -s format png -z 32 32 "$SRC" --out "$ICONSET/icon_32x32.png" >/dev/null
sips -s format png -z 64 64 "$SRC" --out "$ICONSET/icon_32x32@2x.png" >/dev/null
sips -s format png -z 128 128 "$SRC" --out "$ICONSET/icon_128x128.png" >/dev/null
sips -s format png -z 256 256 "$SRC" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
sips -s format png -z 256 256 "$SRC" --out "$ICONSET/icon_256x256.png" >/dev/null
sips -s format png -z 512 512 "$SRC" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
sips -s format png -z 512 512 "$SRC" --out "$ICONSET/icon_512x512.png" >/dev/null
sips -s format png -z 1024 1024 "$SRC" --out "$ICONSET/icon_512x512@2x.png" >/dev/null

xattr -cr "$ICONSET" 2>/dev/null || true
iconutil -c icns "$ICONSET" -o "$OUT"

echo "Wrote ${OUT}"
