#!/bin/bash
# Screenshot a URL with headless Chrome. Chrome sometimes refuses to exit after
# writing the file when the page animates forever, so we start it in the
# background, wait for the PNG, and stop that one process by pid.
#
#   tools/shoot.sh <out.png> <url> [profile] [wait-seconds]

set -u
OUT=$1
URL=$2
PROFILE=${3:-.shots/prof}
WAIT=${4:-6}

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

rm -f "$OUT"
# Headless Chrome on macOS refuses to go below 500pt wide, so we shoot a
# 500-wide window and crop back to the 402 the phone actually has.
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=500,874 \
  --user-data-dir="$PROFILE" --screenshot="$OUT" "$URL" >/dev/null 2>&1 &
PID=$!

for _ in $(seq 1 $((WAIT * 4))); do
  [ -s "$OUT" ] && break
  sleep 0.25
done
sleep 0.4
kill -9 "$PID" 2>/dev/null

if [ -s "$OUT" ]; then
  python3 - "$OUT" <<'PY'
import sys
from PIL import Image
path = sys.argv[1]
im = Image.open(path)
k = im.width / 500
left = round(49 * k)
im.crop((left, 0, left + round(402 * k), im.height)).save(path)
PY
  echo "ok $OUT"
else
  echo "FAILED $OUT"
fi
