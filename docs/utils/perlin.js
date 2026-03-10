// Perlin noise (2D) — extracted from dirt-overlay.js
var PerlinNoise = (function () {
  var perm = new Uint8Array(512);
  var grad = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  for (var i = 0; i < 256; i++) perm[i] = i;
  for (var i = 255; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
  }
  for (var i = 256; i < 512; i++) perm[i] = perm[i - 256];

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }
  function dot(g, x, y) { return g[0] * x + g[1] * y; }

  return function (x, y) {
    var X = Math.floor(x) & 255;
    var Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    var u = fade(x), v = fade(y);
    var a = perm[X] + Y, b = perm[X + 1] + Y;
    return lerp(
      lerp(dot(grad[perm[a] & 7], x, y), dot(grad[perm[b] & 7], x - 1, y), u),
      lerp(dot(grad[perm[a + 1] & 7], x, y - 1), dot(grad[perm[b + 1] & 7], x - 1, y - 1), u),
      v
    ) * 0.5 + 0.5;
  };
})();
