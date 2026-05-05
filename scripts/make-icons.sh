#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

LOGO=logo-white.png  # white-tinted logo with transparent bg
PUB=public

# name | color_from | color_to
apps=(
  "book|#3bb3e0|#5ec5e8"
  "admin-mobile|#7b5ea7|#9479bd"
  "admin-desk|#3a4a6b|#556690"
  "staff|#9cc089|#b5d2a3"
  "front-desk|#e89838|#f0b05e"
  "kiosk|#e8765a|#f09279"
)

make_icon () {
  local size=$1 name=$2 from=$3 to=$4 out=$5
  # The logo occupies ~68% width of the icon (leaves safe padding for maskable PWA)
  local logo_w=$(( size * 88 / 100 ))
  convert -size ${size}x${size} \
    gradient:"${from}-${to}" \
    \( "$LOGO" -resize ${logo_w}x \) -gravity center -composite \
    -define png:color-type=6 \
    "$out"
}

for entry in "${apps[@]}"; do
  IFS='|' read -r name from to <<< "$entry"
  echo "→ $name ($from → $to)"
  make_icon 512 "$name" "$from" "$to" "${PUB}/${name}-icon-512.png"
  make_icon 192 "$name" "$from" "$to" "${PUB}/${name}-icon-192.png"
  make_icon 180 "$name" "$from" "$to" "${PUB}/apple-touch-icon-${name}.png"
done

echo "Done."
ls -la ${PUB}/*-icon-*.png ${PUB}/apple-touch-icon-*.png
