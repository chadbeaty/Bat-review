# History file format

`product-radar-data/history.md` keeps one section per product, newest runs appended. It lets the next run tell
what's new, what's accelerating and what's saturating.

```markdown
# Product Radar history

## Handheld bag sealer
- Also sold as: magnetic bag sealer; mini handheld food sealer; rechargeable bag closer
- First seen: 2026-11-07 on YouTube by Jordan Welch, https://www.youtube.com/watch?v=...
- Status: tracking   <!-- tracking | testing | rejected | saturated -->
- Runs:
  - 2026-11-08: score 67 (medium) | mentions 72h 2, creators this week 2 | sellers in search ~4 (low confidence)
  - 2026-11-09: score 71 (medium) | mentions 72h 4, creators this week 3 | sellers in search ~6 (low confidence)
- Sightings:
  - 2026-11-07 YouTube, Jordan Welch, organic demo, 5,000 views, https://...
  - 2026-11-08 YouTube, Sharif Mohsin, case study, 12,000 views, https://...
- My test results: (owner notes, e.g. "tested 11/12, 3 days, 2 sales, $40 spend: loser")
```

Keep it short: list only products seen at least once, and trim sightings older than 60 days to a count.
