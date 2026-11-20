# Accuracy validation

Nothing about Gapper's speed accuracy gets claimed until this has been done on real swings. Rendered-clip tests prove
the math; only a reference device on the same swings proves the product.

## Targets (engineering goals, not claims)

| Measurement | Target |
| --- | --- |
| Exit velocity | MAE ≤ 3 mph |
| Bat speed | MAE ≤ 3 mph |
| Valid reading rate | ≥ 90% in supported conditions |

## What you need
- A reference device for one session: a radar gun that reads exit velo (Pocket Radar, Stalker, Bushnell), and ideally
  a bat sensor (Blast, Diamond Kinetics) or a cage with HitTrax/Rapsodo. Borrowing is fine: it's for testing, never
  something players need.
- The Gapper iOS app on an iPhone that films at 240 fps, on a tripod.
- At least 50 swings with a reference reading, from at least 3 hitters, ideally 150+.

## Steps (about an hour)
1. Set the phone up with the in-app assistant until every check is green. Note the distance to the plate in feet.
2. Put the radar behind the hitter in line with the ball's path (radars read low at an angle). Clip the bat sensor on.
3. Record a set of 5–10 swings. After each set, open each swing in Gapper (My Swings) and, in "Add a sensor or radar reading",
   type the radar's exit velo and the sensor's bat speed for that swing, with the device name. If the radar showed
   nothing (a miss or a foul tip), jot down the swing number: in the CSV you'll put "none" in its ref_device column so
   any reading Gapper gave it counts as a false reading.
4. Change one thing and repeat: distance (10, 12, 15 ft), angle, light (bright, dim), drill (tee, front toss, live),
   bat, hitter.
5. Profile › "Export for accuracy testing (CSV)". Open the CSV and fill in the setting, drill, lighting and distance
   columns.
6. Run `node scripts/validation-report.mjs gapper-accuracy-YYYY-MM-DD.csv --out report.md` (or send the CSV to a
   Claude session and ask for the report).

## What the report shows
MAE, RMSE, bias (Gapper high or low on average), error spread, 95% limits of agreement, success rate, false readings,
whether readings land inside their own ± (about 68% of them should), error by Gapper's confidence level, and all of it
split by device, frame rate, view, setting, drill, lighting, distance and bat-speed method. With fewer than 50 paired
swings it refuses to call a target met.

## Regression protection
- `tests/unit/speed-benchmark.test.ts` runs both engines on fixed rendered clips in CI and fails if the error or the
  number of successful readings gets worse than `tests/benchmarks/speed-baseline.json`.
- `ml/eval/eval_detector.py --baseline` does the same for a new detector model before it can ship.
- Once real validation sessions exist, keep their CSVs (they hold no video) and re-run the report after every engine
  change.
