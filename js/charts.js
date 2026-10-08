/* charts.js — SVG chart rendering: curve generators, axes, the three lift charts, hover.
   Part of V-Lo. Loaded as a plain script; see vlo.html for the order. */
"use strict";

/* ---------------- phase-curve generators ---------------- */
function bump(p, center, width, amp) {
  var d = (p - center) / width;
  return amp * Math.exp(-d * d);
}

function velocityCurve(meanV) {
  var peakCon = meanV * 1.25;
  var peakEcc = peakCon * 0.65;
  var pts = [];
  for (var p = 0; p <= 100; p += 2) {
    var v = bump(p, 25, 14, peakEcc) + bump(p, 75, 14, peakCon);
    pts.push({ p: p, v: Math.max(0, v) });
  }
  return pts;
}

function barPathCurve(pathDir, phaseShift, ampScale) {
  var amp = 0.94 * ampScale;
  var pts = [];
  for (var p = 0; p <= 100; p += 2) {
    var g = amp * Math.exp(-Math.pow((p - 50 - phaseShift) / 25, 2));
    var v = pathDir === "down-up" ? (1 - g) : g;
    pts.push({ p: p, v: clamp(v, 0, 1) });
  }
  return pts;
}

// Horizontal (front/back) bar drift, in cm from a vertical reference line.
// A small early backward shift, then a forward bump at each exercise's
// risk phase (deeper into the lift, and growing rep to rep with fatigue).
function driftCurve(ex, amp) {
  var pts = [];
  for (var p = 0; p <= 100; p += 2) {
    var back = -0.35 * amp * Math.exp(-Math.pow((p - 12) / 10, 2));
    var fwd = 0;
    ex.driftCenters.forEach(function (c) { fwd += amp * Math.exp(-Math.pow((p - c) / 16, 2)); });
    pts.push({ p: p, v: back + fwd });
  }
  return pts;
}

/* ---------------- svg chart helpers ---------------- */
var NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) {
  var el = document.createElementNS(NS, tag);
  for (var k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}
function pathFromPoints(pts, xScale, yScale) {
  return pts.map(function (pt, i) {
    return (i === 0 ? "M" : "L") + xScale(pt.p).toFixed(1) + "," + yScale(pt.v).toFixed(1);
  }).join(" ");
}

var M = { l: 46, r: 14, t: 14, b: 34 };
var W = 640, H = 260;
function xScale(p) { return M.l + (p / 100) * (W - M.l - M.r); }
function makeYScale(yMax) {
  return function (v) { return H - M.b - (v / yMax) * (H - M.t - M.b); };
}
function makeYScaleRange(yMin, yMax) {
  return function (v) { return H - M.b - ((v - yMin) / (yMax - yMin)) * (H - M.t - M.b); };
}

function drawAxes(svg, cycleLabels, yTicks, yFmt, zeroY) {
  // gridlines + y labels
  yTicks.forEach(function (t) {
    var y = t.y;
    svg.appendChild(svgEl("line", { x1: M.l, x2: W - M.r, y1: y, y2: y, stroke: "var(--chart-grid)", "stroke-width": 1 }));
    var lbl = svgEl("text", { x: M.l - 10, y: y + 3, "text-anchor": "end", class: "mono", "font-size": 9, fill: "var(--muted)" });
    lbl.textContent = yFmt(t.v);
    svg.appendChild(lbl);
  });
  // x axis line
  svg.appendChild(svgEl("line", { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b, stroke: "var(--rule)", "stroke-width": 1 }));
  // emphasized zero reference line, for charts whose domain crosses zero
  if (typeof zeroY === "number" && Math.abs(zeroY - (H - M.b)) > 0.5) {
    svg.appendChild(svgEl("line", { x1: M.l, x2: W - M.r, y1: zeroY, y2: zeroY, stroke: "var(--muted)", "stroke-width": 1.2 }));
  }
  // x labels at 0 / 50 / 100 using exercise cycle wording
  [0, 50, 100].forEach(function (p, i) {
    var anchor = p === 0 ? "start" : (p === 100 ? "end" : "middle");
    var t = svgEl("text", { x: xScale(p), y: H - 12, "text-anchor": anchor, class: "mono", "font-size": 9, fill: "var(--muted)" });
    t.textContent = cycleLabels[i];
    svg.appendChild(t);
    svg.appendChild(svgEl("line", { x1: xScale(p), x2: xScale(p), y1: M.t, y2: H - M.b, stroke: "var(--chart-grid)", "stroke-width": 1, "stroke-dasharray": p === 50 ? "2 3" : "0" }));
  });
}

function niceMax(v) {
  var step = 0.2;
  return Math.max(step, Math.ceil((v * 1.15) / step) * step);
}
function niceAbsMax(v, step) {
  return Math.max(step, Math.ceil((v * 1.2) / step) * step);
}

/* ---------------- render: velocity-by-cycle chart ---------------- */
function renderVelocityChart(ex, sim, target, selectedRep) {
  target = target || { svg: "velChart", legend: "velLegend" };
  if (selectedRep === undefined) selectedRep = null;
  var svg = document.getElementById(target.svg);
  svg.innerHTML = "";
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);

  var yMax = niceMax(Math.max.apply(null, sim.velocities.map(function (v) { return v * 1.25; })));
  var yS = makeYScale(yMax);
  var yTicks = [0, 0.25, 0.5, 0.75, 1].map(function (f) { return { v: +(yMax * f).toFixed(2), y: yS(yMax * f) }; });
  drawAxes(svg, ex.cycleLabels, yTicks, function (v) { return v.toFixed(2); });

  var n = sim.velocities.length;
  var indices = selectedRep === null ? sim.velocities.map(function (_, i) { return i; }) : [clamp(selectedRep, 0, n - 1)];
  var seriesPts = indices.map(function (i) { return { i: i, pts: velocityCurve(sim.velocities[i]) }; });
  seriesPts.forEach(function (s) {
    var fade = selectedRep === null ? (n === 1 ? 1 : 1 - (s.i / (n - 1)) * 0.65) : 1;
    var strokeWidth = selectedRep === null ? 2.2 : 2.6;
    var d = pathFromPoints(s.pts, xScale, yS);
    var path = svgEl("path", { d: d, fill: "none", stroke: "var(--accent)", "stroke-width": strokeWidth, "stroke-linecap": "round", opacity: fade.toFixed(2) });
    svg.appendChild(path);
  });

  // y axis title (top-right, clear of the tick labels)
  var yt = svgEl("text", { x: W - M.r, y: M.t + 4, "text-anchor": "end", class: "mono", "font-size": 9, fill: "var(--muted)" });
  yt.textContent = "m/s";
  svg.appendChild(yt);

  // legend: sequential fade, rep 1 -> rep n (only meaningful when showing all reps)
  var legend = document.getElementById(target.legend);
  if (legend) {
    legend.innerHTML = "";
    if (selectedRep === null) {
      var l1 = document.createElement("span");
      l1.innerHTML = '<i style="background:var(--accent)"></i>Rep 1';
      var l2 = document.createElement("span");
      l2.innerHTML = '<i style="background:var(--accent); opacity:.4"></i>Rep ' + n;
      legend.appendChild(l1); legend.appendChild(l2);
    }
  }

  attachHover(svg, "vel-tt", function (phase) {
    return seriesPts.map(function (s) {
      var pt = nearestPoint(s.pts, phase);
      return "Rep " + (s.i + 1) + ": " + pt.v.toFixed(2) + " m/s";
    });
  });
}

/* ---------------- render: left/right bar path chart ---------------- */
var currentPathRep = 0;
function repPathCurves(ex, i) {
  var rightShift = clamp(3 + i * 1.8, 0, 11);
  var rightAmp = 1 - clamp(0.035 + i * 0.02, 0, 0.16);
  return { left: barPathCurve(ex.cyclePath, 0, 1), right: barPathCurve(ex.cyclePath, rightShift, rightAmp) };
}
function drawPathCurves(svg, ex, sim, selectedRep) {
  svg.innerHTML = "";
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);

  var yTicks = [0, 0.25, 0.5, 0.75, 1].map(function (f) { return { v: f, y: makeYScale(1)(f) }; });
  var yS = makeYScale(1);
  drawAxes(svg, ex.cycleLabels, yTicks, function (v) { return v.toFixed(2); });

  var shown = [];
  if (selectedRep === null) {
    var n = sim.reps;
    for (var i = 0; i < n; i++) {
      var c = repPathCurves(ex, i);
      var fade = n === 1 ? 1 : 1 - (i / (n - 1)) * 0.65;
      svg.appendChild(svgEl("path", { d: pathFromPoints(c.left, xScale, yS), fill: "none", stroke: "var(--chart-left)", "stroke-width": 2.2, "stroke-linecap": "round", opacity: fade.toFixed(2) }));
      svg.appendChild(svgEl("path", { d: pathFromPoints(c.right, xScale, yS), fill: "none", stroke: "var(--chart-right)", "stroke-width": 2.2, "stroke-linecap": "round", opacity: fade.toFixed(2) }));
      shown.push({ i: i, left: c.left, right: c.right });
    }
  } else {
    var idx = clamp(selectedRep, 0, sim.reps - 1);
    var c1 = repPathCurves(ex, idx);
    svg.appendChild(svgEl("path", { d: pathFromPoints(c1.left, xScale, yS), fill: "none", stroke: "var(--chart-left)", "stroke-width": 2.6, "stroke-linecap": "round" }));
    svg.appendChild(svgEl("path", { d: pathFromPoints(c1.right, xScale, yS), fill: "none", stroke: "var(--chart-right)", "stroke-width": 2.6, "stroke-linecap": "round" }));
    shown.push({ i: idx, left: c1.left, right: c1.right });
  }

  var yt = svgEl("text", { x: W - M.r, y: M.t + 4, "text-anchor": "end", class: "mono", "font-size": 9, fill: "var(--muted)" });
  yt.textContent = "height";
  svg.appendChild(yt);

  attachHover(svg, "path-tt", function (phase) {
    if (shown.length === 1) {
      var l = nearestPoint(shown[0].left, phase), r = nearestPoint(shown[0].right, phase);
      return ["Left: " + (l.v * 100).toFixed(0) + "%", "Right: " + (r.v * 100).toFixed(0) + "%"];
    }
    return shown.map(function (s) {
      var l = nearestPoint(s.left, phase), r = nearestPoint(s.right, phase);
      return "Rep " + (s.i + 1) + ": L " + (l.v * 100).toFixed(0) + "% · R " + (r.v * 100).toFixed(0) + "%";
    });
  });
}
function renderPathChart(ex, sim, target) {
  target = target || { svg: "pathChart", pills: "pathPills" };
  var pills = document.getElementById(target.pills);
  pills.innerHTML = "";
  currentPathRep = clamp(currentPathRep, 0, sim.reps - 1);
  for (var i = 0; i < sim.reps; i++) {
    (function (idx) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "rep-pill";
      b.textContent = "Rep " + (idx + 1);
      b.setAttribute("aria-pressed", idx === currentPathRep ? "true" : "false");
      b.addEventListener("click", function () { currentPathRep = idx; renderPathChart(ex, sim, target); });
      pills.appendChild(b);
    })(i);
  }
  var svg = document.getElementById(target.svg);
  drawPathCurves(svg, ex, sim, currentPathRep);
}

/* ---------------- render: front/back drift chart ---------------- */
function renderDriftChart(ex, sim, target, selectedRep) {
  target = target || { svg: "driftChart", legend: "driftLegend" };
  if (selectedRep === undefined) selectedRep = null;
  var svg = document.getElementById(target.svg);
  svg.innerHTML = "";
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);

  var n = sim.velocities.length;
  var amps = sim.velocities.map(function (v, i) { return clamp(1.0 + i * 0.7, 0, 5.5); });
  var indices = selectedRep === null ? amps.map(function (_, i) { return i; }) : [clamp(selectedRep, 0, n - 1)];
  var seriesPts = indices.map(function (i) { return { i: i, pts: driftCurve(ex, amps[i]) }; });

  var maxAbs = 0;
  seriesPts.forEach(function (s) { s.pts.forEach(function (pt) { maxAbs = Math.max(maxAbs, Math.abs(pt.v)); }); });
  var yBound = niceAbsMax(maxAbs, 1);
  var yS = makeYScaleRange(-yBound, yBound);
  var yTicks = [-1, -0.5, 0, 0.5, 1].map(function (f) { return { v: +(yBound * f).toFixed(1), y: yS(yBound * f) }; });
  drawAxes(svg, ex.cycleLabels, yTicks, function (v) { return (v > 0 ? "+" : "") + v.toFixed(1); }, yS(0));

  seriesPts.forEach(function (s) {
    var fade = selectedRep === null ? (n === 1 ? 1 : 1 - (s.i / (n - 1)) * 0.65) : 1;
    var strokeWidth = selectedRep === null ? 2.2 : 2.6;
    var d = pathFromPoints(s.pts, xScale, yS);
    var path = svgEl("path", { d: d, fill: "none", stroke: "var(--accent)", "stroke-width": strokeWidth, "stroke-linecap": "round", opacity: fade.toFixed(2) });
    svg.appendChild(path);
  });

  var yt = svgEl("text", { x: W - M.r, y: M.t + 4, "text-anchor": "end", class: "mono", "font-size": 9, fill: "var(--muted)" });
  yt.textContent = "cm";
  svg.appendChild(yt);

  var legend = document.getElementById(target.legend);
  if (legend) {
    legend.innerHTML = "";
    if (selectedRep === null) {
      var l1 = document.createElement("span");
      l1.innerHTML = '<i style="background:var(--accent)"></i>Rep 1';
      var l2 = document.createElement("span");
      l2.innerHTML = '<i style="background:var(--accent); opacity:.4"></i>Rep ' + n;
      legend.appendChild(l1); legend.appendChild(l2);
    }
  }

  attachHover(svg, "drift-tt", function (phase) {
    return seriesPts.map(function (s) {
      var pt = nearestPoint(s.pts, phase);
      return "Rep " + (s.i + 1) + ": " + (pt.v > 0 ? "+" : "") + pt.v.toFixed(1) + " cm";
    });
  });
}

function nearestPoint(pts, phase) {
  var best = pts[0], bd = Infinity;
  pts.forEach(function (pt) {
    var d = Math.abs(pt.p - phase);
    if (d < bd) { bd = d; best = pt; }
  });
  return best;
}

/* ---------------- shared hover crosshair + tooltip ---------------- */
function attachHover(svg, ttId, getLines) {
  var wrap = svg.closest(".chart-card");
  wrap.style.position = "relative";
  var tt = wrap.querySelector(".chart-tooltip");
  if (!tt) {
    tt = document.createElement("div");
    tt.className = "chart-tooltip";
    wrap.appendChild(tt);
  }
  var crosshair = svgEl("line", { class: "crosshair", y1: M.t, y2: H - M.b, stroke: "var(--muted)", "stroke-width": 1, opacity: 0 });
  svg.appendChild(crosshair);

  // Store the current data-lookup fn on the svg node itself; bind the
  // pointer listeners only once so repeated re-renders don't stack handlers.
  svg.__getLines = getLines;
  svg.__crosshair = crosshair;
  if (svg.dataset.hoverBound) return;
  svg.dataset.hoverBound = "1";

  function move(evt) {
    var ch = svg.__crosshair;
    var rect = svg.getBoundingClientRect();
    var clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    var xIn = ((clientX - rect.left) / rect.width) * W;
    var phase = clamp(((xIn - M.l) / (W - M.l - M.r)) * 100, 0, 100);
    ch.setAttribute("x1", xScale(phase));
    ch.setAttribute("x2", xScale(phase));
    ch.setAttribute("opacity", 1);
    var lines = svg.__getLines(phase);
    tt.innerHTML = lines.join("<br>");
    var leftPct = ((clientX - rect.left) / rect.width) * 100;
    tt.style.left = clamp(leftPct, 8, 92) + "%";
    tt.style.top = (svg.offsetTop + 8) + "px";
    tt.style.opacity = 1;
  }
  function leave() { svg.__crosshair.setAttribute("opacity", 0); tt.style.opacity = 0; }

  svg.addEventListener("mousemove", move);
  svg.addEventListener("mouseleave", leave);
  svg.addEventListener("touchmove", move, { passive: true });
  svg.addEventListener("touchend", leave);
}

/* ---------------- rep zone chips ---------------- */
function renderRepZones(ex, sim) {
  var wrap = document.getElementById("repZones");
  wrap.innerHTML = "";
  sim.velocities.forEach(function (v, i) {
    var chip = document.createElement("div");
    chip.className = "rep-chip";
    chip.innerHTML =
      '<span class="rn">Rep ' + (i + 1) + '</span>' +
      '<span class="rv">' + v.toFixed(2) + ' m/s</span>' +
      '<button type="button" class="rz zone-link" data-zone="' + zoneFor(ex, v) + '">' + zoneFor(ex, v) + '</button>';
    wrap.appendChild(chip);
  });
  var summary = document.getElementById("setSummary");
  summary.textContent = sim.pct.toFixed(0) + "% e1RM · " + sim.lossPct.toFixed(0) + "% velocity loss across the set";
}

/* ---------------- history table ---------------- */
function renderHistory(exKey, ex, selectedIdx) {
  var body = document.getElementById("historyBody");
  body.innerHTML = "";
  ex.history.forEach(function (row, idx) {
    var sim = simulateSet(row.weight, ex);
    var tr = document.createElement("tr");
    tr.setAttribute("aria-current", idx === selectedIdx ? "true" : "false");
    tr.innerHTML =
      "<td>" + row.date + (row.time ? ' <span class="muted-small">' + row.time + "</span>" : "") + "</td>" +
      '<td class="num">' + row.weight + " kg</td>" +
      '<td class="num">' + sim.reps + "</td>" +
      '<td class="num">' + sim.velocities[0].toFixed(2) + " m/s</td>" +
      '<td><button type="button" class="zone-link" data-zone="' + zoneFor(ex, sim.velocities[0]) + '">' + zoneFor(ex, sim.velocities[0]) + "</button></td>";
    tr.addEventListener("click", function () { selectSet(exKey, idx); });
    body.appendChild(tr);
  });
}
