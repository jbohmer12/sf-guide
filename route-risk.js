/**
 * route-risk.js
 * Colors a walking route segment-by-segment by nearby reported incidents.
 * Green = fewer, white = middle, red = more. Dark casing keeps white visible.
 *
 * Usage:
 *   const risk = createRiskRoute(map, incidents);   // incidents: [{lat, lng}, ...]
 *   risk.draw(path);                                // path: [{lat, lng}] or [google.maps.LatLng]
 *   risk.addLegend(document.getElementById("legend"));
 *   risk.clear();
 */
function createRiskRoute(map, incidents, opts = {}) {
  const cfg = {
    stepMeters: 75,        // segment length along the route
    radiusMeters: 100,     // incident search radius around each segment midpoint
    refCount: null,        // count that equals "max risk"; null = auto (95th percentile)
    thresholds: [0.1, 0.3, 0.6, 0.85], // fixed band edges on a 0..1 score
    ...opts,
  };

  // Green -> light green -> white -> light red -> red
  const BANDS = [
    { color: "#2e9e5b", label: "Fewest reported incidents" },
    { color: "#a8d8b4", label: "Below average" },
    { color: "#ffffff", label: "Average" },
    { color: "#f2a0a0", label: "Above average" },
    { color: "#d62828", label: "Most reported incidents" },
  ];

  // ---------- geometry helpers ----------
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const pt = (p) => ({
    lat: typeof p.lat === "function" ? p.lat() : p.lat,
    lng: typeof p.lng === "function" ? p.lng() : p.lng,
  });
  function dist(a, b) {
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // ---------- spatial grid index ----------
  const pts = incidents.map(pt);
  const midLat = pts.length ? pts.reduce((s, p) => s + p.lat, 0) / pts.length : 37.77;
  const cellLat = (cfg.radiusMeters / R) * (180 / Math.PI);
  const cellLng = cellLat / Math.cos(toRad(midLat));
  const grid = new Map();
  const key = (i, j) => i + "," + j;
  for (const p of pts) {
    const k = key(Math.floor(p.lat / cellLat), Math.floor(p.lng / cellLng));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  function countNear(c) {
    const ci = Math.floor(c.lat / cellLat), cj = Math.floor(c.lng / cellLng);
    let n = 0;
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        const bucket = grid.get(key(i, j));
        if (!bucket) continue;
        for (const p of bucket) if (dist(c, p) <= cfg.radiusMeters) n++;
      }
    }
    return n;
  }

  // ---------- reference count (what "max risk" means) ----------
  let ref = cfg.refCount;
  if (ref == null) {
    const sample = pts.length > 500
      ? pts.filter((_, i) => i % Math.ceil(pts.length / 500) === 0)
      : pts;
    const counts = sample.map(countNear).sort((a, b) => a - b);
    ref = counts.length ? counts[Math.floor(counts.length * 0.95)] : 1;
    ref = Math.max(ref, 1);
  }

  const bandOf = (score) => {
    let b = 0;
    while (b < cfg.thresholds.length && score >= cfg.thresholds[b]) b++;
    return b;
  };

  // ---------- route handling ----------
  function densify(path) {
    const out = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = pt(path[i]), b = pt(path[i + 1]);
      const n = Math.max(1, Math.ceil(dist(a, b) / cfg.stepMeters));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
      }
    }
    if (path.length) out.push(pt(path[path.length - 1]));
    return out;
  }

  let overlays = [];

  function clear() {
    overlays.forEach((o) => o.setMap(null));
    overlays = [];
  }

  function draw(path) {
    clear();
    const dense = densify(path);
    if (dense.length < 2) return [];

    // score each segment, then merge consecutive same-band segments into one line
    const runs = [];
    for (let i = 0; i < dense.length - 1; i++) {
      const a = dense[i], b = dense[i + 1];
      const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
      const segLen = Math.max(dist(a, b), 1);
      // normalize: incidents within radius, scaled for segment length vs. step size
      const score = Math.min(1, (countNear(mid) / ref) * (cfg.stepMeters / Math.max(segLen, cfg.stepMeters / 2)));
      const band = bandOf(score);
      const last = runs[runs.length - 1];
      if (last && last.band === band) last.path.push(b);
      else runs.push({ band, path: [a, b] });
    }

    // casing first (one dark line under everything), then colored runs on top
    overlays.push(new google.maps.Polyline({
      path: dense, map, strokeColor: "#1f2937", strokeOpacity: 0.45,
      strokeWeight: 9, zIndex: 1, clickable: false,
    }));
    for (const r of runs) {
      overlays.push(new google.maps.Polyline({
        path: r.path, map, strokeColor: BANDS[r.band].color, strokeOpacity: 1,
        strokeWeight: 5, zIndex: 2, clickable: false,
      }));
    }
    return runs;
  }

  function addLegend(container) {
    container.innerHTML =
      `<div style="font:500 13px system-ui;margin-bottom:6px">Reported incidents near route</div>` +
      BANDS.map((b) =>
        `<div style="display:flex;align-items:center;gap:8px;font:13px system-ui;margin:3px 0">
           <span style="width:28px;height:6px;border-radius:3px;background:${b.color};
             box-shadow:0 0 0 1.5px rgba(31,41,55,.45)"></span>${b.label}
         </div>`).join("") +
      `<div style="font:11px system-ui;opacity:.65;margin-top:6px">
         Based on reported incidents, which reflect reporting patterns, not a safety guarantee.</div>`;
  }

  return { draw, clear, addLegend, refCount: ref };
}
