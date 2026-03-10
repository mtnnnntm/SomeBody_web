// Posture Tracker Demo — p5.js instance mode with ML5 PoseNet
// Ported from posture tracker/src/tracker.js
(function () {
  var container = document.getElementById('demo-overlay-content');

  var settings = {
    timers: { sittingStart: 0, lastUpdate: 0 },
    scores: { sitting: 0, eyes: 0, neck: 0, back: 0 }
  };

  var poses = [];
  var videoEl;
  var drawW = 0, drawH = 0, offsetX = 0, offsetY = 0;
  var p5Instance = null;

  // Bouncing alert GIFs
  var bounceGifs = {
    sitting: ['images/stretching/sitting1.gif', 'images/stretching/sitting2.gif'],
    neck: ['images/stretching/neck1.webp', 'images/stretching/neck2.webp', 'images/stretching/neck3.webp'],
    back: ['images/stretching/back3.gif', 'images/stretching/back1.webp', 'images/stretching/back2.webp']
  };
  var bounceImgEl = null;
  var bounceAlert = { active: false, x: 100, y: 100, vx: 3, vy: 2.2, w: 200, h: 200, category: null, bounceCount: 0 };

  // Notification threshold tracking
  var notifState = { sitting: false, eyes: false, neck: false, back: false, permissionAsked: false };

  // Sound alert
  var soundEnabled = true;
  var audioCtx = null;
  var activeOsc = null;
  var soundTriggered = { sitting: false, eyes: false, neck: false, back: false };
  var eyesPrintTriggered = false;
  var eyesPrintLastTime = 0;

  // Camera visibility
  var cameraVisible = true;

  // Speech warning phrases
  var speechPhrases = {
    sitting: 'Hey!!',
    eyes: 'Ow!!',
    neck: 'Hey!!',
    back: 'Oh!!'
  };
  var notifToastEl = null;
  var notifToastTimeout = null;

  function getKP(pose) {
    if (!pose || !pose.keypoints) return null;
    function clean(kp) {
      if (!kp || !kp.position) return null;
      return { x: kp.position.x, y: kp.position.y, score: kp.score };
    }
    return {
      nose: clean(pose.keypoints[0]),
      leftEye: clean(pose.keypoints[1]),
      rightEye: clean(pose.keypoints[2]),
      leftEar: clean(pose.keypoints[3]),
      rightEar: clean(pose.keypoints[4]),
      leftShoulder: clean(pose.keypoints[5]),
      rightShoulder: clean(pose.keypoints[6])
    };
  }

  function getScoreColor(p, score) {
    if (score < 50) return p.color(50, 200, 120);
    if (score < 75) return p.color(255, 140, 0);
    return p.color(255, 80, 80);
  }

  function getScoreColorCSS(score) {
    if (score < 50) return 'rgb(50, 200, 120)';
    if (score < 75) return 'rgb(255, 140, 0)';
    return 'rgb(255, 80, 80)';
  }

  // ─── Score Checks ──────────────────────────────────
  function eyeCheck(p, pose) {
    var kp = getKP(pose);
    if (!kp || !kp.leftEye || !kp.rightEye) return;
    if (kp.leftEye.score > 0.5 && kp.rightEye.score > 0.5) {
      var eyesDist = p.dist(kp.leftEye.x, kp.leftEye.y, kp.rightEye.x, kp.rightEye.y);
      if (eyesDist > 100) {
        settings.scores.eyes += 0.25;
      } else {
        settings.scores.eyes = Math.max(settings.scores.eyes - 0.05, 0);
      }
    }
  }

  function neckCheck(p, pose) {
    var kp = getKP(pose);
    if (!kp || !kp.leftEar || !kp.rightEar || !kp.leftShoulder || !kp.rightShoulder) return;
    if (kp.leftEar.score > 0.5 && kp.rightEar.score > 0.5 &&
        kp.leftShoulder.score > 0.5 && kp.rightShoulder.score > 0.5) {
      var earVec = p.createVector(kp.rightEar.x - kp.leftEar.x, kp.rightEar.y - kp.leftEar.y);
      var shoulderVec = p.createVector(kp.rightShoulder.x - kp.leftShoulder.x, kp.rightShoulder.y - kp.leftShoulder.y);
      var angle = p.degrees(earVec.angleBetween(shoulderVec));
      if ((earVec.y < 0) !== (shoulderVec.y < 0)) angle = -angle;
      if (Math.abs(angle) > 20) {
        settings.scores.neck += 0.5;
      } else {
        settings.scores.neck = Math.max(settings.scores.neck - 0.05, 0);
      }
    }
  }

  function backCheck(p, pose) {
    var kp = getKP(pose);
    if (!kp) return;
    if (kp.leftEye && kp.rightEye && kp.leftEar && kp.rightEar &&
        kp.leftShoulder && kp.rightShoulder) {
      var eyeVec = p.createVector(kp.rightEye.x - kp.leftEye.x, kp.rightEye.y - kp.leftEye.y);
      var shoulderVec = p.createVector(kp.rightShoulder.x - kp.leftShoulder.x, kp.rightShoulder.y - kp.leftShoulder.y);
      var lengthEar = p.dist(kp.rightEar.x, kp.rightEar.y, kp.leftEar.x, kp.leftEar.y);
      var lengthEyeToShoulder = eyeVec.dist(shoulderVec);
      var ratio = lengthEyeToShoulder / lengthEar;
      if (ratio < 1.25) {
        settings.scores.back += 0.25;
      } else {
        settings.scores.back = Math.max(settings.scores.back - 0.05, 0);
      }
    }
  }

  function sittingCheck(p) {
    var visible = poses.length > 0;
    if (visible) {
      if (!settings.timers.sittingStart) {
        settings.timers.sittingStart = p.millis();
        settings.timers.lastUpdate = settings.timers.sittingStart;
      }
      var now = p.millis();
      var elapsed = now - settings.timers.lastUpdate;
      if (elapsed >= 10000) {
        var chunks = Math.floor(elapsed / 10000);
        settings.scores.sitting += chunks;
        settings.timers.lastUpdate += chunks * 10000;
      }
    } else {
      settings.timers.sittingStart = null;
    }
  }

  // ─── p5 Sketch ─────────────────────────────────────
  var sketch = function (p) {
    p.setup = function () {
      var w = container.offsetWidth;
      var h = container.offsetHeight;
      p.createCanvas(w, h);
      p.noStroke();

      // Create video capture (request HD resolution)
      videoEl = p.createCapture({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false
      },
        function () { console.log('Posture demo: camera started'); },
        function (err) { console.error('Posture demo: camera failed', err); }
      );
      videoEl.hide();

      // Init PoseNet
      var poseNet = ml5.poseNet(videoEl, function () {
        console.log('PoseNet model loaded');
      });
      poseNet.on('pose', function (results) {
        poses = results;
      });

    };

    p.windowResized = function () {
      var w = container.offsetWidth;
      var h = container.offsetHeight;
      p.resizeCanvas(w, h);
    };

    p.draw = function () {
      p.clear();

      if (!videoEl || videoEl.width === 0) return;

      // Calculate cover-mode dimensions
      var videoAspect = videoEl.width / videoEl.height;
      var canvasAspect = p.width / p.height;
      if (canvasAspect > videoAspect) {
        drawW = p.width;
        drawH = p.width / videoAspect;
        offsetX = 0;
        offsetY = (p.height - drawH) / 2;
      } else {
        drawH = p.height;
        drawW = p.height * videoAspect;
        offsetX = (p.width - drawW) / 2;
        offsetY = 0;
      }

      // Draw mirrored webcam (B&W, half-transparent)
      if (cameraVisible) {
        p.push();
        p.translate(p.width, 0);
        p.scale(-1, 1);
        p.tint(255, 128);
        p.drawingContext.filter = 'grayscale(1)';
        p.image(videoEl, offsetX, offsetY, drawW, drawH);
        p.drawingContext.filter = 'none';
        p.noTint();
        p.pop();
      }

      // Run checks
      if (poses.length > 0) {
        var pose = poses[0].pose;
        eyeCheck(p, pose);
        neckCheck(p, pose);
        backCheck(p, pose);
      }
      sittingCheck(p);

      // Eyes auto-print at 100 (before reset zeroes the score)
      checkEyesAutoPrint(p);

      // Auto-reset scores at 100
      autoResetScores();

      // Check notification/sound thresholds
      checkNotifications();
      checkSoundAlerts();

      // Draw pulsing border
      drawPulsingBorder(p);

      // Draw keypoints
      drawOverlay(p);

      // Draw dashboard
      drawDashboard(p);

      // Bouncing GIF alert overlay
      updateBouncingAlert(p);
    };
  };

  function drawOverlay(p) {
    if (poses.length === 0) return;
    var pose = poses[0].pose;
    p.push();
    p.translate(p.width, 0);
    p.scale(-1, 1);

    var allowed = [0, 1, 2, 3, 4, 5, 6];
    for (var idx = 0; idx < allowed.length; idx++) {
      var i = allowed[idx];
      var kp = pose.keypoints[i];
      if (!kp || kp.score < 0.5) continue;

      var x = p.map(kp.position.x, 0, videoEl.width, offsetX, offsetX + drawW);
      var y = p.map(kp.position.y, 0, videoEl.height, offsetY, offsetY + drawH);

      var scoreToUse =
        (i === 1 || i === 2) ? settings.scores.eyes :
        (i === 5 || i === 6) ? settings.scores.back :
        (i === 3 || i === 4) ? settings.scores.neck : 0;

      p.noStroke();
      p.fill(getScoreColor(p, scoreToUse));
      p.ellipse(x, y, 10, 10);
    }

    // Neck point
    var kpData = getKP(pose);
    if (kpData && kpData.nose && kpData.leftShoulder && kpData.rightShoulder) {
      var midSX = (kpData.leftShoulder.x + kpData.rightShoulder.x) / 2;
      var midSY = (kpData.leftShoulder.y + kpData.rightShoulder.y) / 2;
      var nx = kpData.nose.x + (midSX - kpData.nose.x) * 0.7;
      var ny = kpData.nose.y + (midSY - kpData.nose.y) * 0.7;
      var sx = p.map(nx, 0, videoEl.width, offsetX, offsetX + drawW);
      var sy = p.map(ny, 0, videoEl.height, offsetY, offsetY + drawH);
      p.noStroke();
      p.fill(getScoreColor(p, settings.scores.neck));
      p.ellipse(sx, sy, 12, 12);
    }
    p.pop();
  }

  function drawDashboard(p) {
    var padding = 14;
    var boxW = 180;
    var boxH = 155;
    var x = padding;
    var y = padding;

    p.push();
    p.noStroke();
    p.fill(0, 0, 0, 150);
    p.rect(x, y, boxW, boxH, 8);

    var lineH = 30;
    var barH = 8;
    var keys = ['sitting', 'eyes', 'neck', 'back'];

    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var score = settings.scores[key];
      var bx = x + 8;
      var by = y + 8 + i * lineH + 14;
      var bw = boxW - 16;

      p.fill(255);
      p.noStroke();
      p.textSize(12);
      p.textAlign(p.LEFT, p.TOP);
      p.textFont('monospace');
      p.text(key.charAt(0).toUpperCase() + key.slice(1) + ': ' + Math.round(score), x + 8, y + 8 + i * lineH);

      // Bar bg
      p.fill(80);
      p.rect(bx, by, bw, barH, 3);

      // Bar fg
      p.fill(getScoreColor(p, score));
      p.rect(bx, by, bw * (Math.min(score, 100) / 100), barH, 3);
    }

    p.pop();
  }

  function drawPulsingBorder(p) {
    var maxScore = Math.max(
      settings.scores.sitting,
      settings.scores.eyes,
      settings.scores.neck,
      settings.scores.back
    );
    if (maxScore < 50) return;

    var speed = maxScore >= 75 ? 2.0 : 1.0;
    var t = p.millis() * 0.001 * speed;
    var pulseAlpha = p.map(p.sin(t * p.TWO_PI), -1, 1, 0.4, 1.0);
    var transparentRadius = p.map(p.sin(t * p.TWO_PI), -1, 1, 0.3, 0.7);

    var r, g, b;
    if (maxScore >= 75) { r = 255; g = 80; b = 80; }
    else { r = 255; g = 140; b = 0; }

    var maxAlpha = pulseAlpha;
    var cx = p.width / 2;
    var cy = p.height / 2;
    var outerR = Math.sqrt(cx * cx + cy * cy);
    var innerR = outerR * transparentRadius;

    var ctx = p.drawingContext;
    var gradient = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    gradient.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    gradient.addColorStop(0.4, 'rgba(' + r + ',' + g + ',' + b + ',' + (maxAlpha * 0.3) + ')');
    gradient.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',' + maxAlpha + ')');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, p.width, p.height);
  }

  // ─── Bouncing Alert ────────────────────────────────
  function getWorstCategory() {
    var worst = 'sitting';
    var keys = ['sitting', 'neck', 'back'];
    for (var i = 1; i < keys.length; i++) {
      if (settings.scores[keys[i]] > settings.scores[worst]) worst = keys[i];
    }
    return worst;
  }

  function showBounceGif(category) {
    var pool = bounceGifs[category];
    var src = pool[Math.floor(Math.random() * pool.length)];
    if (!bounceImgEl) {
      bounceImgEl = document.createElement('img');
      bounceImgEl.style.position = 'absolute';
      bounceImgEl.style.pointerEvents = 'none';
      bounceImgEl.style.zIndex = '10';
      bounceImgEl.style.borderRadius = '10px';
      bounceImgEl.style.objectFit = 'contain';
      bounceImgEl.style.background = 'transparent';
      container.appendChild(bounceImgEl);
    }
    bounceImgEl.src = src;
    bounceImgEl.style.width = bounceAlert.w + 'px';
    bounceImgEl.style.height = bounceAlert.h + 'px';
    bounceImgEl.style.display = 'block';
    bounceAlert.category = category;
  }

  function hideBounceGif() {
    if (bounceImgEl) bounceImgEl.style.display = 'none';
    bounceAlert.category = null;
  }

  function updateBouncingAlert(p) {
    var maxScore = Math.max(settings.scores.sitting, settings.scores.neck, settings.scores.back);
    if (maxScore >= 75 && !bounceAlert.active) {
      bounceAlert.active = true;
      bounceAlert.bounceCount = 0;
      bounceAlert.x = Math.random() * (p.width - bounceAlert.w - 50) + 25;
      bounceAlert.y = Math.random() * (p.height - bounceAlert.h - 50) + 25;
      showBounceGif(getWorstCategory());
    }
    if (!bounceAlert.active) return;

    // Move
    bounceAlert.x += bounceAlert.vx;
    bounceAlert.y += bounceAlert.vy;

    // Bounce off edges and count bounces
    if (bounceAlert.x <= 0 || bounceAlert.x + bounceAlert.w >= p.width) {
      bounceAlert.vx *= -1;
      bounceAlert.bounceCount++;
    }
    if (bounceAlert.y <= 0 || bounceAlert.y + bounceAlert.h >= p.height) {
      bounceAlert.vy *= -1;
      bounceAlert.bounceCount++;
    }
    bounceAlert.x = Math.max(0, Math.min(bounceAlert.x, p.width - bounceAlert.w));
    bounceAlert.y = Math.max(0, Math.min(bounceAlert.y, p.height - bounceAlert.h));

    // Deactivate after 5 bounces
    if (bounceAlert.bounceCount >= 5) {
      bounceAlert.active = false;
      hideBounceGif();
      return;
    }

    // Position the img element
    if (bounceImgEl) {
      bounceImgEl.style.left = bounceAlert.x + 'px';
      bounceImgEl.style.top = bounceAlert.y + 'px';
    }
  }

  // ─── Notifications (on-screen + speech) ──────────
  function showOnScreenNotif(title, body) {
    if (!notifToastEl) {
      notifToastEl = document.createElement('div');
      notifToastEl.style.cssText = 'position:absolute;top:20px;right:20px;z-index:20;background:rgba(0,0,0,0.85);color:#fff;padding:14px 20px;border-radius:10px;font-family:monospace;font-size:13px;max-width:280px;pointer-events:none;opacity:0;transition:opacity 0.3s;';
      container.appendChild(notifToastEl);
    }
    notifToastEl.innerHTML = '<div style="font-weight:bold;margin-bottom:4px;color:rgb(255,80,80)">' + title + '</div><div>' + body + '</div>';
    notifToastEl.style.opacity = '1';
    if (notifToastTimeout) clearTimeout(notifToastTimeout);
    notifToastTimeout = setTimeout(function () {
      notifToastEl.style.opacity = '0';
    }, 4000);
  }

  function speakWarning(category) {
    if (!soundEnabled) return;
    if (!('speechSynthesis' in window)) return;
    var phrase = speechPhrases[category] || 'Hey! Fix your posture!';
    var utter = new SpeechSynthesisUtterance(phrase);
    utter.rate = 1.1;
    utter.pitch = 1.0;
    utter.volume = 0.8;
    speechSynthesis.speak(utter);
  }

  function checkNotifications() {
    var keys = ['sitting', 'eyes', 'neck', 'back'];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (settings.scores[key] >= 75 && !notifState[key]) {
        notifState[key] = true;
        var title = 'Posture Alert';
        var body = key.charAt(0).toUpperCase() + key.slice(1) + ' score is high! Fix your posture.';
        showOnScreenNotif(title, body);
        speakWarning(key);
      } else if (settings.scores[key] < 75) {
        notifState[key] = false;
      }
    }
  }

  // ─── Sound Alert ──────────────────────────────────
  function playAlertTone() {
    if (!soundEnabled) return;
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (activeOsc) { try { activeOsc.stop(); } catch (e) {} }

    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'square';
    osc.frequency.value = 440;

    var now = audioCtx.currentTime;
    var dur = 0.3;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
    gain.gain.setValueAtTime(0.08, now + dur * 0.6);
    gain.gain.linearRampToValueAtTime(0, now + dur);
    osc.start(now);
    osc.stop(now + dur);
    activeOsc = osc;
  }

  function checkSoundAlerts() {
    if (!soundEnabled) return;
    var keys = ['sitting', 'eyes', 'neck', 'back'];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (settings.scores[key] >= 75 && !soundTriggered[key]) {
        soundTriggered[key] = true;
        playAlertTone();
      } else if (settings.scores[key] < 75) {
        soundTriggered[key] = false;
      }
    }
  }

  // ─── Webcam Capture + Eyes Auto-Print ─────────────
  function captureWebcamFrame(p) {
    if (!videoEl || videoEl.width === 0 || videoEl.height === 0) return null;
    var buf = p.createGraphics(drawW, drawH);
    buf.push();
    buf.translate(drawW, 0);
    buf.scale(-1, 1);
    buf.image(videoEl, 0, 0, drawW, drawH);
    buf.pop();
    var dataURL = buf.canvas.toDataURL('image/jpeg', 0.85);
    buf.remove();
    return dataURL;
  }

  function checkEyesAutoPrint(p) {
    // DEBUG: log eye score every 60 frames
    if (p.frameCount % 60 === 0) {
      console.log('[DEBUG eyes] score:', settings.scores.eyes.toFixed(1),
        'triggered:', eyesPrintTriggered,
        'poses:', poses.length,
        'cooldown:', Math.max(0, 60000 - (Date.now() - eyesPrintLastTime)) + 'ms');
    }
    if (settings.scores.eyes >= 100 && !eyesPrintTriggered && Date.now() - eyesPrintLastTime > 60000) {
      console.log('[DEBUG eyes] PRINTING! score:', settings.scores.eyes);
      eyesPrintTriggered = true;
      eyesPrintLastTime = Date.now();
      var imageData = captureWebcamFrame(p);
      fetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: new Date().toISOString(), captureImage: imageData })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) { console.log('[DEBUG eyes] print response:', data); })
      .catch(function (err) { console.error('[DEBUG eyes] print failed:', err.message); });
    }
    if (settings.scores.eyes < 100) eyesPrintTriggered = false;
  }

  // ─── Auto Reset ───────────────────────────────────
  function autoResetScores() {
    var keys = ['sitting', 'eyes', 'neck', 'back'];
    for (var i = 0; i < keys.length; i++) {
      if (settings.scores[keys[i]] >= 100) settings.scores[keys[i]] = 0;
    }
  }

  // ─── Start ─────────────────────────────────────────
  container.innerHTML = '';
  p5Instance = new p5(sketch, container);

  // ─── Looping instruction prompt ─────────────────────
  var promptTexts = [
    'turn the camera off to continue working as usual',
    'make an effort to correct your posture when a warning goes off',
    'follow the bouncing GIFs to do some streching',
    'DO NOT GET YOUR EYES TOO CLOSE TO THE SCREEN!!',
  ];
  var promptIdx = 0;
  var promptEl = document.createElement('div');
  promptEl.textContent = promptTexts[0];
  promptEl.style.cssText = 'position:absolute;top:20px;left:0;right:0;text-align:center;color:rgba(255,255,255,1);font-size:0.85rem;font-family:monospace;pointer-events:none;transition:opacity 0.6s;z-index:2';
  container.appendChild(promptEl);
  var promptInterval = setInterval(function () {
    promptEl.style.opacity = '0';
    setTimeout(function () {
      promptIdx = (promptIdx + 1) % promptTexts.length;
      promptEl.textContent = promptTexts[promptIdx];
      promptEl.style.opacity = '1';
    }, 600);
  }, 5000);

  // ─── Exposed Controls ──────────────────────────────

  // ─── Camera Toggle ─────────────────────────────────
  window._postureToggleCamera = function () {
    cameraVisible = !cameraVisible;
    return cameraVisible;
  };

  // ─── Sound Toggle ──────────────────────────────────
  window._postureToggleSound = function () {
    soundEnabled = !soundEnabled;
    if (soundEnabled && !audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!soundEnabled && activeOsc) {
      try { activeOsc.stop(); } catch (e) {}
      activeOsc = null;
    }
    return soundEnabled;
  };

  // ─── Cleanup ────────────────────────────────────────
  window._postureCleanup = function () {
    // Clear prompt interval
    if (promptInterval) { clearInterval(promptInterval); promptInterval = null; }
    // Remove bouncing GIF
    if (bounceImgEl && bounceImgEl.parentNode) {
      bounceImgEl.parentNode.removeChild(bounceImgEl);
      bounceImgEl = null;
    }
    bounceAlert.active = false;

    // Remove notification toast
    if (notifToastEl && notifToastEl.parentNode) {
      notifToastEl.parentNode.removeChild(notifToastEl);
      notifToastEl = null;
    }
    if (notifToastTimeout) { clearTimeout(notifToastTimeout); notifToastTimeout = null; }

    // Cancel speech
    if ('speechSynthesis' in window) speechSynthesis.cancel();

    // Stop sound
    if (activeOsc) {
      try { activeOsc.stop(); } catch (e) {}
      activeOsc = null;
    }
    if (audioCtx) {
      try { audioCtx.close(); } catch (e) {}
      audioCtx = null;
    }
    soundEnabled = false;
    eyesPrintTriggered = false;

    // Stop video tracks
    if (videoEl && videoEl.elt && videoEl.elt.srcObject) {
      var tracks = videoEl.elt.srcObject.getTracks();
      for (var i = 0; i < tracks.length; i++) {
        tracks[i].stop();
      }
    }
    if (p5Instance) {
      p5Instance.remove();
      p5Instance = null;
    }
  };
})();
