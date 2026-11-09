# Self-hosted fonts

Both families are variable, SIL Open Font License 1.1 (full text in `OFL.txt`), and declared in
`app/fonts.ts` through `next/font/local`. No third-party font service is contacted.

| File                                              | Role                                       |
| ------------------------------------------------- | ------------------------------------------ |
| `PlusJakartaSans-subset.woff2`                    | body face, generated                       |
| `SoftnDisplay-subset.woff2`                       | display face, generated                    |
| `source/PlusJakartaSans-VariableFont_wght.woff2`  | pristine source of the body subset         |
| `source/ZalandoSans-VariableFont_wdth_wght.woff2` | pristine source of the display subset      |
| `PlusJakartaSans-Italic-VariableFont_wght.woff2`  | italic body face, not declared in `src`    |
| `ZalandoSans-Italic-VariableFont_wdth_wght.woff2` | italic display face, not declared in `src` |
| `unicodes.txt`                                    | code points kept by both subsets           |
| `subset.sh`                                       | regenerates the two subsets                |

`next/font` preloads every file declared in `src`, so the italic files stay out of `src` until the
first italic style is needed: declaring them today would cost their full weight on every page.

## What the subsets keep

- **Code points**: the ranges of `unicodes.txt` — basic Latin, Latin-1 Supplement, `Œ`/`œ`, `Ÿ`,
  en/em dash, curly quotes, bullet, ellipsis, narrow no-break space, single guillemets and `€`.
  `app/fonts.test.ts` reads the same file and fails when a `locales/fr` string contains a character
  outside those ranges, so a new copy needs a new range and a new run of `subset.sh`.
- **Layout features**: `ccmp, locl, mark, mkmk, kern, liga, clig, calt, rlig, rvrn` — kerning,
  default ligatures, contextual alternates, localized forms, mark positioning and the variable-font
  required alternates. Fractions, superior figures and stylistic sets are unused by the site and are
  dropped, which removes their alternate glyphs too.
- **Zalando Sans width axis**: pinned to its default instance (100). No rule in `app/`,
  `components/`, `lib/`, the CSS modules or `@softnio-labs/tokens` sets `font-stretch` or
  `font-variation-settings`, so the 75-125 axis was dead weight (about 45 kB of the file).
- **Weight axis, both families**: forwarded from 200-800 (body) and 200-900 (display) to **400-800**,
  the range the type scale uses (`400` body, `600` labels and small display, `700` titles and display,
  `800` title-lg). The minimum stays at the default instance of both fonts, so a weight below 600
  inherited by a display element still renders as authored instead of clamping up; the maximum drops
  the unused 900. The axis stays variable: every integer weight in 400-800 is available.
- Hinting is kept: dropping it (`--no-hinting`) changed the files by less than 100 bytes.

Plus Jakarta Sans has no `U+202F` (narrow no-break space) glyph and none of the two faces has
`U+00AD` (soft hyphen) or `U+201B`; those code points resolve through the fallback font, exactly as
they did with the full files. No locale string uses them today.

## Display face and the OFL Reserved Font Name

`SoftnDisplay-subset.woff2` is a Modified Version of Zalando Sans. OFL condition 3 (`OFL.txt`)
forbids a Modified Version from using the Reserved Font Name "Zalando", so `subset.sh` rewrites the
`name` table of the instanced display font before subsetting it: the family, unique ID, full name
and PostScript name (IDs 1, 3, 4, 6), the variations PostScript name prefix (ID 25) and the `fvar`
instance PostScript names (IDs 346, 348, 350, 352, 354) become `Softn Display` / `SoftnDisplay`;
`fvar` and `STAT` address their axes and instances by record ID, so they follow. The subset keeps
IDs 1, 3, 4, 6 and the instance names; the subfamily names ("Regular", "Medium"…) hold no family
name and are left alone.

The copyright notice (ID 0), the trademark notice (ID 7, absent from this font) and the license
description and URL (IDs 13, 14) stay untouched: the license requires them to remain with the font.
The unmodified originals in `source/` and the italic face keep their names, since condition 3 only
restricts Modified Versions.

## Regenerating

Requires [uv](https://docs.astral.sh/uv/) (uvx). Nothing is installed in the project: fonttools runs
from a throwaway environment pinned in `subset.sh` (`fonttools[woff]==4.68.0`, `brotli==1.2.1`,
Python 3.13.2), the first run downloads it.

```sh
cd assets/fonts
./subset.sh
```

`subset.sh` is the exact command: it holds the pinned toolchain, the axis instances, the code point
file, the layout features and the OFL rename, and it writes `PlusJakartaSans-subset.woff2` and
`SoftnDisplay-subset.woff2` next to itself without touching `source/`. Output is byte-identical for
that pinned toolchain: the timestamps are not recalculated, so the same sources and the same
`unicodes.txt` give the same files; another fonttools or Brotli version can re-encode them
differently.

The axis locations read `min:default:max`; `wght=400:400:800` therefore keeps a variable range from
400 to 800 whose default instance is 400. Pinning `wdth=100` removes the axis from the output font.
