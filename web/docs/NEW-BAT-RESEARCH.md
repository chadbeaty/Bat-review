# Judging a new bat before reviews exist

Research from 1 November 2026, gathered from web search summaries only (pages couldn't be opened directly). Spot-check dates and quotes on the live pages before relying on them.

## What can be collected, most reliable first

1. **The stamps on the bat and the year in the model number.** Easton ESU6…/ESD7…, Miken MSU6/MSA6 and Worth WSU6 carry the model year and the association.
2. **Certification lists:**
   - USA Softball publishes certified equipment (https://www.usasoftball.com/certified-equipment/) and PDF "Non-Approved Bat Lists" of bats that failed field audits. The latest copy found is dated 2 February 2026.
   - USSSA lists licensed manufacturers, not models (https://usssa.com/slowpitch/slowpitch-licensed-softball-bat-ball-manufacturers). The 240 stamp has been required for tournaments since 2023.
   - NSA publishes an approved-company PDF.
   - SSUSA publishes approved and disapproved lists.
   - None of these lists is machine-readable.
3. **Manufacturer specs:** length, weights, barrel length, load, one-piece or two-piece, materials.
4. **Warranty terms**, which differ by brand:
   - Rawlings brands (Easton, Miken, Worth): one year, one-time repair or replacement, receipt required.
   - DeMarini: one year, but senior bats are excluded.
   - Monsta: sold without a warranty; a replacement plan is sold separately.
   - Most brands warn against use below 60°F.
5. **Lineage to last year's model.** See `data/lineage.json`: 34 of 117 bats from 2026–27 have a predecessor (1 high confidence, 19 medium, 97 low). It's an assumption and must be labeled as one.
6. **Release-date estimate** from the first retailer pre-order or ship date. CheapBats shows "expected ship date". Releases happen all year (summer and fall lines, signature drops), not in one launch.
7. **Retailer first-look and exit-velocity videos.** These are early but biased; for example, Headbanger "Slowpitch Corner" and SPC Sports comparisons.
8. **Manufacturer marketing claims.** Least reliable.

## What doesn't exist

- **Public lab performance numbers for slowpitch bats.** Certification results aren't published, and Bat Digest found compression readings say little about exit speed.
- **Official year-over-year changelogs from manufacturers.**

## How others label new bats

Bat Digest marks new bats "In Review", seeds ratings from the closest prior model until testing finishes, and keeps them unranked meanwhile. Use the same honesty: a new bat shows its predecessor's evidence under that label, never as its own score.

## Data notes from the lineage pass

Retailer listings conflict with a few catalog values. Check these before the catalog is marked verified:
- Bedlam XXL: 12" or 13" barrel?
- Victus Nox: one-piece or two-piece?
- 2027 Juggy Extended: listed as USA/USSSA dual-stamp.
- Freak Splatter USSSA: shares SKU MSU6FRKL with the 13.5" Freak Maxload.

Details are in the `basis` and `changes` fields of `data/lineage.json`.
