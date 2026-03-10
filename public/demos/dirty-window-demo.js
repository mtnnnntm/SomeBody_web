// Dirty Window Demo — canvas-based, no frameworks
// Ported from dirt-overlay.js + keydrop-overlay.js + gesture-overlay.js
(function () {
  var container = document.getElementById('demo-overlay-content');
  var W = container.offsetWidth;
  var H = container.offsetHeight;
  var dpr = window.devicePixelRatio || 1;

  function initCanvas(canvas, ctx) {
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ─── Dirt Canvas ─────────────────────────────────────
  var dirtCanvas = document.createElement('canvas');
  dirtCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%';
  container.appendChild(dirtCanvas);
  var dirtCtx = dirtCanvas.getContext('2d');
  initCanvas(dirtCanvas, dirtCtx);

  // ─── Keydrop Canvas ─────────────────────────────────
  var kdCanvas = document.createElement('canvas');
  kdCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none';
  container.appendChild(kdCanvas);
  var kdCtx = kdCanvas.getContext('2d');
  initCanvas(kdCanvas, kdCtx);

  // ─── Sketch Canvas (pinch-to-draw layer) ────────────
  var sketchCanvas = document.createElement('canvas');
  sketchCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none';
  container.appendChild(sketchCanvas);
  var sketchCtx = sketchCanvas.getContext('2d');
  initCanvas(sketchCanvas, sketchCtx);

  // ─── Hand Skeleton Canvas (optional) ────────────────
  var handCanvas = document.createElement('canvas');
  handCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none';
  container.appendChild(handCanvas);
  var handCtx = handCanvas.getContext('2d');
  initCanvas(handCanvas, handCtx);

  // ─── Looping instruction prompt ─────────────────────
  var promptTexts = [
    'move mouse to leave traces · type to drop characters',
    '\u270b use your palm to erase',
    'toggle to hand-drawing modes using the control below',
    '\ud83e\udd0f pinch to draw · move mouse to erase'
  ];
  var promptIdx = 0;
  var prompt = document.createElement('div');
  prompt.textContent = promptTexts[0];
  prompt.style.cssText = 'position:absolute;top:20px;left:0;right:0;text-align:center;color:rgba(255,255,255,1);font-size:0.85rem;font-family:monospace;pointer-events:none;transition:opacity 0.6s;z-index:2';
  container.appendChild(prompt);
  var promptInterval = setInterval(function () {
    prompt.style.opacity = '0';
    setTimeout(function () {
      promptIdx = (promptIdx + 1) % promptTexts.length;
      prompt.textContent = promptTexts[promptIdx];
      prompt.style.opacity = '1';
    }, 600);
  }, 5000);

  // ─── State ──────────────────────────────────────────
  var frameCount = 0;
  var hue = 0;
  var colorful = true;
  var drawMode = false; // false = trace mode, true = draw mode
  var cursorX = W / 2, cursorY = H / 2;
  var prevCursorX = -1, prevCursorY = -1;
  var appStartTime = Date.now();
  var rafId = null;
  var handStream = null;
  var handRafId = null;

  // ─── Pinch-to-sketch state ────────────────────────────
  var THUMB_TIP = 4, INDEX_TIP = 8, WRIST = 0, MIDDLE_MCP = 9;
  var PINCH_THRESHOLD = 0.15;
  var PINCH_RELEASE_THRESHOLD = 0.09;
  var SMOOTHING = 0.25;
  var sketchPinching = [false, false];
  var lastFingerPos = [null, null];
  var smoothedPos = [null, null];

  // Slow growth: 10 minutes to reach max size
  var BRUSH_GROWTH_DURATION = 600000;
  var BRUSH_MIN = 1;
  var BRUSH_MAX = 100;
  var ERASER_RADIUS = 40;

  var TEXT_GROWTH_DURATION = 600000;
  var TEXT_SIZE_MIN = 10;
  var TEXT_SIZE_MAX = 80;

  function getCurrentMaxBrush() {
    var elapsed = Date.now() - appStartTime;
    var ratio = Math.min(Math.max(elapsed / BRUSH_GROWTH_DURATION, 0), 1);
    return BRUSH_MIN + ratio * (BRUSH_MAX - BRUSH_MIN);
  }

  function currentDirtColor() {
    if (!colorful) return 'rgba(255, 255, 255, 0.85)';
    return 'hsla(' + (hue % 2160) + ', 95%, 60%, 0.9)';
  }

  // ─── Mouse Dirt Trace ──────────────────────────────
  function drawDirtTrace(x, y) {
    if (prevCursorX < 0) { prevCursorX = x; prevCursorY = y; return; }
    var dx = x - prevCursorX;
    var dy = y - prevCursorY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= 1) return;

    var s = PerlinNoise(frameCount * 0.02, 3.7) * getCurrentMaxBrush();
    hue += dist * 0.5;
    dirtCtx.fillStyle = currentDirtColor();
    dirtCtx.beginPath();
    dirtCtx.ellipse(x, y, s / 2, s / 2, 0, 0, Math.PI * 2);
    dirtCtx.fill();
    prevCursorX = x;
    prevCursorY = y;
  }

  // ─── Mouse Eraser ──────────────────────────────────
  function erase(x, y) {
    // Erase from dirt, keydrop, and sketch canvases
    dirtCtx.save();
    dirtCtx.globalCompositeOperation = 'destination-out';
    dirtCtx.beginPath();
    dirtCtx.arc(x, y, ERASER_RADIUS, 0, Math.PI * 2);
    dirtCtx.fill();
    dirtCtx.restore();

    kdCtx.save();
    kdCtx.globalCompositeOperation = 'destination-out';
    kdCtx.beginPath();
    kdCtx.arc(x, y, ERASER_RADIUS, 0, Math.PI * 2);
    kdCtx.fill();
    kdCtx.restore();

    sketchCtx.save();
    sketchCtx.globalCompositeOperation = 'destination-out';
    sketchCtx.beginPath();
    sketchCtx.arc(x, y, ERASER_RADIUS, 0, Math.PI * 2);
    sketchCtx.fill();
    sketchCtx.restore();
  }

  function eraseDirt(x, y) {
    dirtCtx.save();
    dirtCtx.globalCompositeOperation = 'destination-out';
    dirtCtx.beginPath();
    dirtCtx.arc(x, y, ERASER_RADIUS, 0, Math.PI * 2);
    dirtCtx.fill();
    dirtCtx.restore();

    sketchCtx.save();
    sketchCtx.globalCompositeOperation = 'destination-out';
    sketchCtx.beginPath();
    sketchCtx.arc(x, y, ERASER_RADIUS, 0, Math.PI * 2);
    sketchCtx.fill();
    sketchCtx.restore();
  }

  function eraseKeydrop(x, y) {
    kdCtx.save();
    kdCtx.globalCompositeOperation = 'destination-out';
    kdCtx.beginPath();
    kdCtx.arc(x, y, ERASER_RADIUS, 0, Math.PI * 2);
    kdCtx.fill();
    kdCtx.restore();
  }

  // Listen on document so events pass through the pointer-events:none overlay
  function onMouseMove(e) {
    cursorX = e.clientX;
    cursorY = e.clientY;
    if (drawMode) {
      // Draw mode: mouse erases
      erase(e.clientX, e.clientY);
    } else {
      // Trace mode: mouse leaves dirt
      drawDirtTrace(e.clientX, e.clientY);
    }
  }
  document.addEventListener('mousemove', onMouseMove);

  // ─── Keyboard Character Drop ────────────────────────
  function randomTextColor() {
    if (!colorful) return 'rgb(255, 255, 255)';
    return 'hsl(' + Math.floor(Math.random() * 360) + ', 90%, 50%)';
  }

  function drawChar(ch) {
    var x = cursorX;
    var y = cursorY;
    var ox = (Math.random() - 0.5) * 50;
    var oy = (Math.random() - 0.5) * 50;
    var elapsed = Date.now() - appStartTime;
    var ratio = Math.min(Math.max(elapsed / TEXT_GROWTH_DURATION, 0), 1);
    var size = TEXT_SIZE_MIN + ratio * (TEXT_SIZE_MAX - TEXT_SIZE_MIN);

    kdCtx.save();
    kdCtx.fillStyle = randomTextColor();
    kdCtx.font = Math.round(size) + 'px monospace';
    kdCtx.textAlign = 'center';
    kdCtx.textBaseline = 'middle';
    kdCtx.fillText(ch, x + ox, y + oy);
    kdCtx.restore();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') return;
    if (e.key.length === 1) {
      drawChar(e.key);
    }
  }
  document.addEventListener('keydown', onKeyDown);

  // ─── Animation Loop ────────────────────────────────
  function animate() {
    frameCount++;
    rafId = requestAnimationFrame(animate);
  }
  rafId = requestAnimationFrame(animate);

  // ─── Resize ────────────────────────────────────────
  function onResize() {
    W = container.offsetWidth;
    H = container.offsetHeight;
    dpr = window.devicePixelRatio || 1;
    initCanvas(dirtCanvas, dirtCtx);
    initCanvas(kdCanvas, kdCtx);
    initCanvas(sketchCanvas, sketchCtx);
    initCanvas(handCanvas, handCtx);
  }
  window.addEventListener('resize', onResize);

  // ─── Exposed Controls ──────────────────────────────
  window._dirtyToggleColor = function () {
    colorful = !colorful;
    return colorful;
  };

  window._dirtyToggleMode = function () {
    drawMode = !drawMode;
    prevCursorX = -1;
    prevCursorY = -1;
    return drawMode;
  };

  // ─── Optional Hand Tracking (MediaPipe) ────────────
  var HAND_CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [0,9],[9,10],[10,11],[11,12],
    [0,13],[13,14],[14,15],[15,16],
    [0,17],[17,18],[18,19],[19,20],
    [5,9],[9,13],[13,17],
  ];

  // ─── Pinch detection helpers ──────────────────────────
  function landmarkDist(lms, i, j) {
    var dx = lms[i].x - lms[j].x;
    var dy = lms[i].y - lms[j].y;
    var dz = (lms[i].z || 0) - (lms[j].z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function getSketchBrushSize(lms) {
    var handScale = landmarkDist(lms, WRIST, MIDDLE_MCP);
    // Map hand scale (roughly 0.1–0.4) to brush size 1–50px
    var size = ((handScale - 0.1) / 0.3) * 49 + 1;
    return Math.max(1, Math.min(50, size));
  }

  function sketchColor() {
    if (!colorful) return 'rgba(255, 255, 255, 0.9)';
    hue += 0.5;
    return 'hsla(' + (hue % 2160) + ', 95%, 60%, 0.9)';
  }

  window._dirtyLoadHands = function () {
    return new Promise(function (resolve, reject) {
      // Dynamic import of MediaPipe
      import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest')
        .then(function (vision) {
          var HandLandmarker = vision.HandLandmarker;
          var FilesetResolver = vision.FilesetResolver;

          return FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
          ).then(function (wasm) {
            return HandLandmarker.createFromOptions(wasm, {
              baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
                delegate: 'GPU',
              },
              runningMode: 'VIDEO',
              numHands: 2,
            });
          });
        })
        .then(function (handLandmarker) {
          // Start webcam
          return navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' }
          }).then(function (stream) {
            handStream = stream;

            // Hidden video for detection
            var video = document.createElement('video');
            video.srcObject = stream;
            video.setAttribute('playsinline', '');
            video.play();

            var lastTs = -1;
            function detect() {
              if (video.readyState >= 2) {
                var now = performance.now();
                if (now !== lastTs) {
                  var results = handLandmarker.detectForVideo(video, now);
                  handCtx.clearRect(0, 0, W, H);

                  // Reset pinch state for hands no longer detected
                  var numHands = (results && results.landmarks) ? results.landmarks.length : 0;
                  for (var r = numHands; r < 2; r++) {
                    sketchPinching[r] = false;
                    lastFingerPos[r] = null;
                    smoothedPos[r] = null;
                  }

                  if (results && results.landmarks) {
                    for (var h = 0; h < results.landmarks.length; h++) {
                      var lms = results.landmarks[h];
                      drawHandSkeleton(lms);

                      var isRight = results.handednesses && results.handednesses[h] && results.handednesses[h][0].categoryName === 'Right';
                      var palmFacing = isPalmFacing(lms, isRight);

                      if (drawMode) {
                        // Draw mode: pinch to sketch, palm erases
                        var pinchDist = landmarkDist(lms, THUMB_TIP, INDEX_TIP);
                        if (!sketchPinching[h] && pinchDist < PINCH_RELEASE_THRESHOLD) {
                          sketchPinching[h] = true;
                          lastFingerPos[h] = null;
                          smoothedPos[h] = null;
                        } else if (sketchPinching[h] && pinchDist > PINCH_THRESHOLD) {
                          sketchPinching[h] = false;
                          lastFingerPos[h] = null;
                          smoothedPos[h] = null;
                        }

                        if (sketchPinching[h]) {
                          var thumb = toScreen(lms[THUMB_TIP]);
                          var index = toScreen(lms[INDEX_TIP]);
                          var rawX = (thumb.x + index.x) / 2;
                          var rawY = (thumb.y + index.y) / 2;

                          if (!smoothedPos[h]) {
                            smoothedPos[h] = { x: rawX, y: rawY };
                          } else {
                            smoothedPos[h].x += (rawX - smoothedPos[h].x) * SMOOTHING;
                            smoothedPos[h].y += (rawY - smoothedPos[h].y) * SMOOTHING;
                          }

                          var brushSize = getSketchBrushSize(lms);
                          sketchCtx.strokeStyle = sketchColor();
                          sketchCtx.lineWidth = brushSize;
                          sketchCtx.lineCap = 'round';
                          sketchCtx.lineJoin = 'round';

                          if (lastFingerPos[h]) {
                            sketchCtx.beginPath();
                            sketchCtx.moveTo(lastFingerPos[h].x, lastFingerPos[h].y);
                            sketchCtx.lineTo(smoothedPos[h].x, smoothedPos[h].y);
                            sketchCtx.stroke();
                          }

                          lastFingerPos[h] = { x: smoothedPos[h].x, y: smoothedPos[h].y };
                        } else {
                          // Palm eraser when not pinching
                          var palm = getPalmCenter(lms);
                          if (palmFacing) eraseKeydrop(palm.x, palm.y);
                          else eraseDirt(palm.x, palm.y);
                        }
                      } else {
                        // Trace mode: palm erase based on facing
                        var palm = getPalmCenter(lms);
                        if (palmFacing) eraseKeydrop(palm.x, palm.y);
                        else eraseDirt(palm.x, palm.y);
                      }
                    }
                  }
                  lastTs = now;
                }
              }
              handRafId = requestAnimationFrame(detect);
            }
            detect();
            resolve();
          });
        })
        .catch(reject);
    });
  };

  function toScreen(lm) {
    return { x: (1 - lm.x) * W, y: lm.y * H };
  }

  function getPalmCenter(landmarks) {
    var indices = [0, 5, 9, 13, 17];
    var sx = 0, sy = 0;
    for (var i = 0; i < indices.length; i++) {
      sx += landmarks[indices[i]].x;
      sy += landmarks[indices[i]].y;
    }
    return {
      x: (1 - sx / indices.length) * W,
      y: (sy / indices.length) * H
    };
  }

  function isPalmFacing(lms, isRightHand) {
    // Compare thumb tip (4) x vs pinky MCP (17) x in raw image coords.
    // When palm faces camera, thumb is on the opposite side from pinky
    // relative to what we'd see with the back of the hand.
    if (isRightHand) return lms[4].x < lms[17].x;
    return lms[4].x > lms[17].x;
  }

  function drawHandSkeleton(landmarks) {
    handCtx.strokeStyle = '#00ff00';
    handCtx.lineWidth = 2;
    for (var c = 0; c < HAND_CONNECTIONS.length; c++) {
      var a = toScreen(landmarks[HAND_CONNECTIONS[c][0]]);
      var b = toScreen(landmarks[HAND_CONNECTIONS[c][1]]);
      handCtx.beginPath();
      handCtx.moveTo(a.x, a.y);
      handCtx.lineTo(b.x, b.y);
      handCtx.stroke();
    }
    handCtx.fillStyle = '#00ff00';
    for (var i = 0; i < landmarks.length; i++) {
      var p = toScreen(landmarks[i]);
      handCtx.beginPath();
      handCtx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      handCtx.fill();
    }
  }

  // ─── Cleanup ────────────────────────────────────────
  window._dirtyCleanup = function () {
    // Cancel animation frames
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (handRafId) {
      cancelAnimationFrame(handRafId);
      handRafId = null;
    }
    // Stop hand tracking camera
    if (handStream) {
      var tracks = handStream.getTracks();
      for (var i = 0; i < tracks.length; i++) {
        tracks[i].stop();
      }
      handStream = null;
    }
    // Reset state
    drawMode = false;
    prevCursorX = -1;
    prevCursorY = -1;
    sketchPinching = [false, false];
    lastFingerPos = [null, null];
    smoothedPos = [null, null];
    // Clear prompt interval
    if (promptInterval) { clearInterval(promptInterval); promptInterval = null; }
    // Remove document-level listeners
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onResize);
    // Null out exposed functions
    window._dirtyToggleMode = null;
  };

  // ─── Auto-start camera ────────────────────────────
  window._dirtyLoadHands();
})();
