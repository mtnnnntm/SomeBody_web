// Breathing phase logic — extracted from breathing guide
var BREATHING_RHYTHMS = {
  "simple":  { inhale: 4000, hold: 0,    exhale: 4000, rest: 0 },
  "relaxed": { inhale: 4000, hold: 2000, exhale: 6000, rest: 1500 },
  "box":     { inhale: 4000, hold: 4000, exhale: 4000, rest: 4000 },
  "4-7-8":   { inhale: 4000, hold: 7000, exhale: 8000, rest: 0 },
};

function getBreathingPhase(elapsed, rhythm) {
  var r = rhythm || BREATHING_RHYTHMS["relaxed"];
  var total = r.inhale + r.hold + r.exhale + r.rest;
  var t = elapsed % total;

  if (t < r.inhale) {
    return { name: "inhale", progress: t / r.inhale };
  } else if (r.hold > 0 && t < r.inhale + r.hold) {
    return { name: "hold", progress: (t - r.inhale) / r.hold };
  } else if (t < r.inhale + r.hold + r.exhale) {
    return { name: "exhale", progress: (t - r.inhale - r.hold) / r.exhale };
  } else if (r.rest > 0) {
    return { name: "rest", progress: (t - r.inhale - r.hold - r.exhale) / r.rest };
  }
  return { name: "inhale", progress: 0 };
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getSizeFactor(phase) {
  switch (phase.name) {
    case "inhale": return 0.2 + 0.8 * easeInOutCubic(phase.progress);
    case "hold":   return 1.0 + 0.02 * Math.sin(phase.progress * Math.PI * 4);
    case "exhale": return 1.0 - 0.8 * easeInOutCubic(phase.progress);
    case "rest":   return 0.2 + 0.02 * Math.sin(phase.progress * Math.PI * 2);
  }
  return 0.2;
}

function hsbToRgb(h, s, v) {
  var r, g, b;
  var i = Math.floor(h * 6);
  var f = h * 6 - i;
  var p = v * (1 - s);
  var q = v * (1 - f * s);
  var t2 = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t2; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t2; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t2; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}
