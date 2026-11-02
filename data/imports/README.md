# Imported posts

Facebook doesn't offer an API for group posts, so posts from Facebook groups (or anywhere else without an API) are added by hand. Drop files in this folder and the next aggregator run picks them up.

Only import posts from groups where members expect their posts to be shared, and don't include names.

## Plain text (easiest)

Save as `facebook-2026-10.txt`. Separate posts with a line of three dashes. The `url:`, `date:`, `source:` and `group:` lines are optional.

```
url: https://www.facebook.com/groups/123/posts/456
date: 2026-10-02
group: Slowpitch Bat Talk
Just picked up the Bedlam XL USA. About 150 swings in and it's already better than my old gamer.
---
source: Facebook
Ronin 240 is my cold-weather bat. Three seasons and no dents.
```

## CSV

Columns: `text,url,date,source,group`. Only `text` is required.

## JSON

An array of objects with the same fields:

```json
[{ "text": "Freak Whiteout is a cannon", "url": "https://…", "date": "2026-09-14", "source": "Facebook" }]
```
