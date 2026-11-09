#!/usr/bin/env bash
#
# Regenerates the self-hosted font subsets from the pristine variable fonts in `source/`.
#
# Fonttools runs through `uvx` from the pinned versions below (fonttools, its Brotli encoder and the
# Python interpreter): nothing is added to `package.json` and no virtualenv is created in the
# repository. The script is reproducible for that toolchain: the same sources and the same
# `unicodes.txt` produce byte-identical files (the timestamps are not recalculated).
#
# Usage: ./subset.sh
set -euo pipefail

cd "$(dirname "$0")"

FONTTOOLS=(uvx --python 3.13.2 --from 'fonttools[woff]==4.68.0' --with 'brotli==1.2.1')

# Kerning, default ligatures, contextual alternates, localized forms, mark positioning and the
# variable-font required alternates. Fractions, oldstyle figures and stylistic sets are not used
# by the site and are dropped, which removes their alternate glyphs from the subset.
LAYOUT_FEATURES='ccmp,locl,mark,mkmk,kern,liga,clig,calt,rlig,rvrn'

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Plus Jakarta Sans (body font): weight axis forwarded from 200-800 to 400-800, the lightest
# weight the body type scale uses, so the default instance (400) stays the default.
"${FONTTOOLS[@]}" fonttools varLib.instancer \
  --no-recalc-timestamp \
  --output "$WORK/PlusJakartaSans.ttf" \
  source/PlusJakartaSans-VariableFont_wght.woff2 \
  wght=400:400:800

"${FONTTOOLS[@]}" pyftsubset \
  "$WORK/PlusJakartaSans.ttf" \
  --unicodes-file=unicodes.txt \
  --layout-features="$LAYOUT_FEATURES" \
  --no-recalc-timestamp \
  --flavor=woff2 \
  --output-file=PlusJakartaSans-subset.woff2

# Zalando Sans (display font): the width axis is pinned to its default instance (100), since no
# rule sets `font-stretch` or `font-variation-settings`; the weight axis is forwarded from 200-900
# to 400-800. Keeping the minimum at the default instance means a weight below 600 (inherited by a
# display element, or added by a future style) still renders as authored instead of clamping up.
"${FONTTOOLS[@]}" fonttools varLib.instancer \
  --no-recalc-timestamp \
  --output "$WORK/ZalandoSans.ttf" \
  source/ZalandoSans-VariableFont_wdth_wght.woff2 \
  wdth=100 \
  wght=400:400:800

# The subset is a Modified Version of Zalando Sans under the SIL OFL, which forbids a Modified
# Version from using the Reserved Font Name "Zalando": rewrite every name record that carries the
# family name, except the copyright (0), the trademark (7) and the license (13, 14), which the
# license requires to stay with the font. The `fvar` and `STAT` tables name their axes and
# instances by record ID, so they follow the rename.
"${FONTTOOLS[@]}" python - "$WORK/ZalandoSans.ttf" <<'PY'
import sys

from fontTools.ttLib import TTFont

UNTOUCHED_NAME_IDS = {0, 7, 13, 14}

font = TTFont(sys.argv[1], recalcTimestamp=False)
for record in font["name"].names:
    if record.nameID in UNTOUCHED_NAME_IDS:
        continue
    current = record.toUnicode()
    renamed = current.replace("Zalando Sans", "Softn Display").replace("ZalandoSans", "SoftnDisplay")
    if renamed != current:
        font["name"].setName(renamed, record.nameID, record.platformID, record.platEncID, record.langID)
font.save(sys.argv[1])
PY

"${FONTTOOLS[@]}" pyftsubset \
  "$WORK/ZalandoSans.ttf" \
  --unicodes-file=unicodes.txt \
  --layout-features="$LAYOUT_FEATURES" \
  --no-recalc-timestamp \
  --flavor=woff2 \
  --output-file=SoftnDisplay-subset.woff2

echo "Generated $PWD/PlusJakartaSans-subset.woff2 and $PWD/SoftnDisplay-subset.woff2"
