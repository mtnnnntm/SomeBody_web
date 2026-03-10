// Breathing Guide Demo — p5.js instance mode
// Ported from breathing guide/index.html
(function () {
  var container = document.getElementById('demo-overlay-content');
  var mode = 'gradient';
  var soundEnabled = true;
  var rhythm = BREATHING_RHYTHMS['relaxed'];
  var cycleStart = 0;
  var lastPhase = '';
  var displayColor = { r: 255, g: 255, b: 255 };

  // Particles state
  var NUM_CURLIES = 200;
  var NUM_SIDES = 7;
  var curlies = [];

  // Audio
  var audioCtx = null;
  var activeOsc = null;
  var SOUND_PRESET = { wave: 'sine', inhaleFreq: 180, exhaleFreq: 120, vol: 0.10 };

  // Color picker state
  var showColorPicker = false;
  var pickerHue = 0;
  var pickerBri = 1;
  var dragging = null;
  var canvasEl = null;
  var pRef = null;
  var CP_SLIDER_W = 300;
  var CP_SLIDER_H = 6;
  var CP_GAP = 60;

  var p5Instance = null;

  // ─── RGB → HSB helper ──────────────────────────────────
  function rgbToHsb(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, v = max;
    var d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) {
      h = 0;
    } else {
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return { h: h * 360, s: s, v: v };
  }

  // ─── Audio ─────────────────────────────────────────────
  function playTone(freq, duration) {
    if (!soundEnabled) return;
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (activeOsc) { try { activeOsc.stop(); } catch (e) {} }

    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = SOUND_PRESET.wave;
    osc.frequency.value = freq;

    var now = audioCtx.currentTime;
    var dur = duration / 1000;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(SOUND_PRESET.vol, now + 0.3);
    gain.gain.setValueAtTime(SOUND_PRESET.vol, now + dur * 0.6);
    gain.gain.linearRampToValueAtTime(0, now + dur);
    osc.start(now);
    osc.stop(now + dur);
    activeOsc = osc;
  }

  function getPhaseColor(phase) {
    var hue1, hue2, sat, bright;
    if (phase.name === 'inhale') {
      var pr = easeInOutCubic(phase.progress);
      hue1 = 210 + (180 - 210) * pr;
      sat = 60 + (50 - 60) * pr;
      bright = 40 + (70 - 40) * pr;
    } else if (phase.name === 'hold') {
      hue1 = 180; sat = 50;
      bright = 70 + 5 * Math.sin(phase.progress * Math.PI * 2);
    } else if (phase.name === 'exhale') {
      var pr = easeInOutCubic(phase.progress);
      hue1 = 180 + (30 - 180) * pr;
      sat = 50 + (55 - 50) * pr;
      bright = 70 + (35 - 70) * pr;
    } else {
      hue1 = 30; sat = 45; bright = 35;
    }
    return { hue1: hue1, sat: sat, bright: bright };
  }

  function initParticles(p) {
    curlies = [];
    for (var i = 0; i < NUM_CURLIES; i++) {
      curlies.push({
        r: p.random(5, 25),
        b: p.random(15, 160),
        theta: p.random(0, 360)
      });
    }
  }

  // ─── Color picker functions ────────────────────────────
  function openPicker() {
    showColorPicker = true;
    var hsb = rgbToHsb(displayColor.r, displayColor.g, displayColor.b);
    pickerHue = hsb.h;
    pickerBri = hsb.v;
  }

  function closePicker() {
    showColorPicker = false;
    dragging = null;
  }

  function drawColorPicker(p) {
    // Dimmed backdrop
    p.fill(0, 0, 0, 160);
    p.noStroke();
    p.rect(0, 0, p.width, p.height);

    var cx = p.width / 2;
    var cy = p.height / 2;
    var sliderX = cx - CP_SLIDER_W / 2;

    // ── Hue slider ──
    var hueY = cy - CP_GAP / 2;
    // Label
    p.fill(255);
    p.noStroke();
    p.textAlign(p.CENTER, p.BOTTOM);
    p.textSize(12);
    p.textFont('monospace');
    p.text('hue', cx, hueY - CP_SLIDER_H / 2 - 6);

    // Draw hue spectrum bar
    for (var i = 0; i < CP_SLIDER_W; i++) {
      var hFrac = i / CP_SLIDER_W;
      var c = hsbToRgb(hFrac, 1, 1);
      p.stroke(c.r, c.g, c.b);
      p.line(sliderX + i, hueY - CP_SLIDER_H / 2, sliderX + i, hueY + CP_SLIDER_H / 2);
    }
    p.noStroke();

    // Hue thumb
    var hueThumbX = sliderX + (pickerHue / 360) * CP_SLIDER_W;
    p.fill(255);
    p.ellipse(hueThumbX, hueY, 14, 14);
    var thumbCol = hsbToRgb(pickerHue / 360, 1, 1);
    p.fill(thumbCol.r, thumbCol.g, thumbCol.b);
    p.ellipse(hueThumbX, hueY, 10, 10);

    // ── Brightness slider ──
    var briY = cy + CP_GAP / 2;
    // Label
    p.fill(255);
    p.noStroke();
    p.textAlign(p.CENTER, p.BOTTOM);
    p.textSize(12);
    p.text('brightness', cx, briY - CP_SLIDER_H / 2 - 6);

    // Draw brightness gradient bar
    for (var i = 0; i < CP_SLIDER_W; i++) {
      var bFrac = i / CP_SLIDER_W;
      var c = hsbToRgb(pickerHue / 360, 1, bFrac);
      p.stroke(c.r, c.g, c.b);
      p.line(sliderX + i, briY - CP_SLIDER_H / 2, sliderX + i, briY + CP_SLIDER_H / 2);
    }
    p.noStroke();

    // Brightness thumb
    var briThumbX = sliderX + pickerBri * CP_SLIDER_W;
    p.fill(255);
    p.ellipse(briThumbX, briY, 14, 14);
    p.fill(displayColor.r, displayColor.g, displayColor.b);
    p.ellipse(briThumbX, briY, 10, 10);

    // Preview swatch
    var swatchY = briY + CP_GAP / 2 + 10;
    p.fill(displayColor.r, displayColor.g, displayColor.b);
    p.noStroke();
    p.rect(cx - 20, swatchY, 40, 40, 6);
  }

  function pickerMouseDown(mx, my) {
    var cx = pRef.width / 2;
    var sliderX = cx - CP_SLIDER_W / 2;
    var hueY = pRef.height / 2 - CP_GAP / 2;
    var briY = pRef.height / 2 + CP_GAP / 2;
    var tolerance = 20;

    if (mx >= sliderX - tolerance && mx <= sliderX + CP_SLIDER_W + tolerance &&
        my >= hueY - tolerance && my <= hueY + tolerance) {
      dragging = 'hue';
      updateHueSlider(mx);
      return;
    }
    if (mx >= sliderX - tolerance && mx <= sliderX + CP_SLIDER_W + tolerance &&
        my >= briY - tolerance && my <= briY + tolerance) {
      dragging = 'bri';
      updateBriSlider(mx);
      return;
    }
    // Click outside sliders → close
    closePicker();
  }

  function updateHueSlider(mx) {
    var cx = pRef.width / 2;
    var sliderX = cx - CP_SLIDER_W / 2;
    var clamped = Math.max(sliderX, Math.min(sliderX + CP_SLIDER_W, mx));
    pickerHue = ((clamped - sliderX) / CP_SLIDER_W) * 360;
    applyPickerColor();
  }

  function updateBriSlider(mx) {
    var cx = pRef.width / 2;
    var sliderX = cx - CP_SLIDER_W / 2;
    var clamped = Math.max(sliderX, Math.min(sliderX + CP_SLIDER_W, mx));
    pickerBri = (clamped - sliderX) / CP_SLIDER_W;
    applyPickerColor();
  }

  function applyPickerColor() {
    displayColor = hsbToRgb(pickerHue / 360, 1, pickerBri);
  }

  // ─── p5 sketch ─────────────────────────────────────────
  var sketch = function (p) {
    p.setup = function () {
      var w = container.offsetWidth;
      var h = container.offsetHeight;
      p.createCanvas(w, h);
      p.noStroke();
      cycleStart = p.millis();
      initParticles(p);
      canvasEl = p.canvas;
      pRef = p;
    };

    p.windowResized = function () {
      var w = container.offsetWidth;
      var h = container.offsetHeight;
      p.resizeCanvas(w, h);
      initParticles(p);
    };

    p.draw = function () {
      p.clear();

      var t = p.millis() - cycleStart;
      var phase = getBreathingPhase(t, rhythm);
      var sizeFactor = getSizeFactor(phase);

      // Trigger audio at phase transitions
      if (phase.name !== lastPhase) {
        if (phase.name === 'inhale') {
          playTone(SOUND_PRESET.inhaleFreq, rhythm.inhale);
        } else if (phase.name === 'exhale') {
          playTone(SOUND_PRESET.exhaleFreq, rhythm.exhale);
        }
        lastPhase = phase.name;
      }

      if (mode === 'sinewave') {
        drawSineWave(p, phase, sizeFactor);
      } else if (mode === 'particles') {
        drawParticles(p, phase, sizeFactor);
      } else {
        drawGradient(p, phase, sizeFactor);
      }

      // (phase label removed — replaced by DOM looping prompt)

      // Color picker overlay
      if (showColorPicker) drawColorPicker(p);
    };

    p.mousePressed = function () {
      if (showColorPicker) {
        pickerMouseDown(p.mouseX, p.mouseY);
      }
    };

    p.mouseDragged = function () {
      if (dragging === 'hue') updateHueSlider(p.mouseX);
      else if (dragging === 'bri') updateBriSlider(p.mouseX);
    };

    p.mouseReleased = function () {
      dragging = null;
    };
  };

  function drawGradient(p, phase, sizeFactor) {
    var cx = p.width / 2;
    var cy = p.height / 2;
    var maxR = Math.min(p.width, p.height) * 0.3;

    var t = Math.max(0, (sizeFactor - 0.2) / 0.8);
    var s = Math.sin(t * Math.PI * 0.5);
    var alpha = s * s * 0.6;

    var layers = 80;
    p.noStroke();
    for (var i = layers; i >= 0; i--) {
      var frac = i / layers;
      var r = maxR * frac;
      var a = (1 - frac) * alpha * 255;
      p.fill(displayColor.r, displayColor.g, displayColor.b, a);
      p.ellipse(cx, cy, r * 3.5, r * 3.5);
    }
  }

  function drawSineWave(p, phase, sizeFactor) {
    var maxAmp = p.height * 0.25;
    var amp;
    if (phase.name === 'inhale') amp = maxAmp * easeInOutCubic(phase.progress);
    else if (phase.name === 'hold') amp = maxAmp;
    else if (phase.name === 'exhale') amp = maxAmp * (1 - easeInOutCubic(phase.progress));
    else amp = 0;

    var waveFreq = 0.008 + 0.004 * sizeFactor;
    var speed = p.millis() * 0.002;
    var cy = p.height / 2;

    p.stroke(displayColor.r, displayColor.g, displayColor.b);
    p.strokeWeight(1);
    p.noFill();
    p.beginShape();
    for (var x = 0; x <= p.width; x += 3) {
      var y = cy + Math.sin(x * waveFreq + speed + 0.5) * amp
                 + Math.sin(x * waveFreq * 0.5 + speed * 0.7) * amp * 0.3;
      p.vertex(x, y);
    }
    p.endShape();
    p.noStroke();
  }

  function drawParticles(p, phase, sizeFactor) {
    var gather = (sizeFactor - 0.2) / 0.8;
    var t = 180 * (1 - gather);

    p.push();
    p.angleMode(p.DEGREES);
    p.noStroke();
    p.translate(p.width / 2, p.height / 2);
    p.scale(1, -1);
    p.fill(displayColor.r, displayColor.g, displayColor.b);

    for (var j = 0; j < NUM_SIDES; j++) {
      p.push();
      p.rotate(j * (360 / NUM_SIDES) + t / 5);
      p.translate(p.width / 5, 0);
      for (var i = 0; i < curlies.length; i++) {
        var c = curlies[i];
        p.push();
        p.rotate(c.theta);
        var x = t;
        var y = c.b * p.sin(t/2 + c.b) + c.b * p.sin(t/6) * p.cos(t) + c.b/2 * p.cos(t/4 - c.b) * p.sin(t*2 - c.b);
        var size = c.r - p.abs(x) / 10;
        if (size > 0) p.circle(x, y, size);
        p.pop();
      }
      p.pop();
    }

    p.pop();
  }

  // Start the sketch
  container.innerHTML = '';
  p5Instance = new p5(sketch, container);

  // ─── Looping instruction prompt ─────────────────────
  // Phases sync to the breathing rhythm; extra tips use a flat 5s timer
  var breatheTexts = ['inhale', 'hold', 'exhale', 'rest'];
  var breatheDurations = [rhythm.inhale, rhythm.hold, rhythm.exhale, rhythm.rest];
  var tipTexts = ['breathe along with the visual and sound', 'use controls below to customize'];
  var TIP_DURATION = 5000;
  var FADE = 600;
  var promptIdx = 0;
  var promptPhase = 'breathe'; // 'breathe' or 'tip'
  var tipIdx = 0;
  var promptTimeout = null;

  var promptEl = document.createElement('div');
  promptEl.textContent = breatheTexts[0];
  promptEl.style.cssText = 'position:absolute;top:20px;left:0;right:0;text-align:center;color:rgba(255,255,255,1);font-size:0.85rem;font-family:monospace;pointer-events:none;transition:opacity 0.6s;z-index:2';
  container.appendChild(promptEl);

  function scheduleNext() {
    var duration, nextText;
    if (promptPhase === 'breathe') {
      duration = breatheDurations[promptIdx];
      // Skip phases with 0 duration
      if (duration <= 0) {
        promptIdx = (promptIdx + 1) % breatheTexts.length;
        if (promptIdx === 0) promptPhase = 'tip';
        scheduleNext();
        return;
      }
      nextText = null; // resolved on fade-in
    } else {
      duration = TIP_DURATION;
    }
    promptTimeout = setTimeout(function () {
      promptEl.style.opacity = '0';
      promptTimeout = setTimeout(function () {
        // Advance to next item
        if (promptPhase === 'breathe') {
          promptIdx = (promptIdx + 1) % breatheTexts.length;
          if (promptIdx === 0) promptPhase = 'tip';
        } else {
          tipIdx = (tipIdx + 1) % tipTexts.length;
          if (tipIdx === 0) promptPhase = 'breathe';
        }
        // Set text
        if (promptPhase === 'breathe') {
          promptEl.textContent = breatheTexts[promptIdx];
        } else {
          promptEl.textContent = tipTexts[tipIdx];
        }
        promptEl.style.opacity = '1';
        scheduleNext();
      }, FADE);
    }, duration - FADE);
  }
  scheduleNext();

  // ─── Expose controls ───────────────────────────
  window._breathingSetMode = function (m) { mode = m; };
  window._breathingToggleSound = function () {
    soundEnabled = !soundEnabled;
    if (soundEnabled && !audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!soundEnabled && activeOsc) {
      try { activeOsc.stop(); } catch (e) {}
    }
    return soundEnabled;
  };

  window._breathingToggleColorPicker = function () {
    showColorPicker ? closePicker() : openPicker();
    return showColorPicker;
  };

  // ─── Cleanup ────────────────────────────────────
  window._breathingCleanup = function () {
    if (promptTimeout) { clearTimeout(promptTimeout); promptTimeout = null; }
    if (p5Instance) {
      p5Instance.remove();
      p5Instance = null;
    }
    if (activeOsc) {
      try { activeOsc.stop(); } catch (e) {}
      activeOsc = null;
    }
    if (audioCtx) {
      try { audioCtx.close(); } catch (e) {}
      audioCtx = null;
    }
  };
})();
