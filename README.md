# SF Day Guide

Pick stops in San Francisco (records, bars, food, art, tech, work spots) and get a walk-and-Muni route with total time, cost and opening-hour checks.

Live: https://jbohmer12.github.io/sf-guide/

## How it works

- Static site: `index.html` (all CSS and JS inline), no build step. Hosted on GitHub Pages.
- `config.js` sets `window.SF_GUIDE_KEY`, a browser Google Maps key. It is public by design, so it must stay restricted in Google Cloud: HTTP referrer `https://jbohmer12.github.io/sf-guide/*`, and APIs limited to Maps JavaScript API and Routes API.
- With no key, or if Google fails, the page falls back to a built-in schematic map with estimated times.
- Share links put the stops in the URL hash: `#r=id1,id2&d=<day 0-6, Mon=0>&t=HH:MM`.

## Run locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000/. The Google map only works on the allowed domain, so locally you will see the built-in map.
