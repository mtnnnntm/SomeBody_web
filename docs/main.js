// ─── Intersection Observer: Video Autoplay ─────────────────
(function () {
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var video = entry.target.querySelector('video');
      if (!video) return;
      if (entry.isIntersecting) {
        video.play().catch(function () {});
      } else {
        video.pause();
      }
    });
  }, { threshold: 0.3 });

  document.querySelectorAll('.video-container').forEach(function (el) {
    observer.observe(el);
  });
})();

// ─── Print Flyer ──────────────────────────────────────────
var printerAvailable = null;

function checkPrinter() {
  fetch('/api/health')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      printerAvailable = data.printer;
    })
    .catch(function () {
      printerAvailable = false;
      var statusEl = document.getElementById('print-status');
      var btn = document.getElementById('print-btn');
      if (btn) btn.disabled = true;
    });
}
checkPrinter();

function printFlyer() {
  var statusEl = document.getElementById('print-status');
  if (statusEl) statusEl.textContent = 'Printing...';
  fetch('/api/print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timestamp: new Date().toISOString() })
  })
  .then(function (r) { return r.json(); })
  .then(function (data) {
    if (statusEl) statusEl.textContent = data.ok ? 'Sent!' : 'Error';
    setTimeout(function () { if (statusEl) statusEl.textContent = ''; }, 3000);
  })
  .catch(function (err) {
    console.error('Print failed:', err.message);
    if (statusEl) statusEl.textContent = 'Failed';
    setTimeout(function () { if (statusEl) statusEl.textContent = ''; }, 3000);
  });
}

// ─── Tab Switching ────────────────────────────────────────
function switchApp(appName) {
  // Update active tab styling
  document.querySelectorAll('.tab-btn').forEach(function (b) {
    b.classList.remove('active');
  });
  var btn = document.querySelector('.tab-btn[data-app="' + appName + '"]');
  if (btn) btn.classList.add('active');

  // Scroll to the section
  var section = document.getElementById('section-' + appName);
  if (section) section.scrollIntoView({ behavior: 'smooth' });
}

// ─── Fullscreen Demo Overlay ──────────────────────────────
var activeDemo = null;

function openDemoOverlay(appName) {
  // Clean up any already-running demo before starting the new one
  if (activeDemo) {
    cleanupDemo();
    document.getElementById('demo-overlay-content').innerHTML = '';
    document.getElementById('overlay-controls').innerHTML = '';
  }

  var overlay = document.getElementById('demo-overlay');
  overlay.classList.remove('hidden');
  document.body.classList.add('demo-active');
  document.body.dataset.activeDemo = appName;
  activeDemo = appName;
  loadDemo(appName);
}

function closeDemoOverlay() {
  var overlay = document.getElementById('demo-overlay');
  overlay.classList.add('hidden');
  document.body.classList.remove('demo-active');
  delete document.body.dataset.activeDemo;

  // Cleanup active demo
  cleanupDemo();

  document.getElementById('demo-overlay-content').innerHTML = '';
  document.getElementById('overlay-controls').innerHTML = '';
  activeDemo = null;
}

function cleanupDemo() {
  if (window._breathingCleanup) {
    try { window._breathingCleanup(); } catch (e) {}
    window._breathingCleanup = null;
  }
  if (window._postureCleanup) {
    try { window._postureCleanup(); } catch (e) {}
    window._postureCleanup = null;
  }
  if (window._dirtyCleanup) {
    try { window._dirtyCleanup(); } catch (e) {}
    window._dirtyCleanup = null;
  }
  // Clear demo globals
  window._breathingSetMode = null;
  window._breathingToggleSound = null;
  window._breathingToggleColorPicker = null;
  window._postureToggleCamera = null;
  window._postureToggleSound = null;
  window._dirtyToggleColor = null;
  window._dirtyLoadHands = null;
  window._dirtyToggleMode = null;
}

// Escape key closes overlay
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && activeDemo) {
    closeDemoOverlay();
  }
});

// ─── Demo Loaders ─────────────────────────────────────────

function loadDemo(appName) {
  if (appName === 'breathing') loadBreathingDemo();
  else if (appName === 'posture') loadPostureDemo();
  else if (appName === 'hand') loadDirtyDemo();
}

function loadBreathingDemo() {
  var content = document.getElementById('demo-overlay-content');
  var controls = document.getElementById('overlay-controls');
  content.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#00aa00;font-size:0.8rem">Loading p5.js...</div>';

  // Build controls
  controls.innerHTML = '';
  var btnGrad = document.createElement('button');
  btnGrad.textContent = 'Gradient';
  btnGrad.className = 'active';
  btnGrad.onclick = function () { setBreathingMode('gradient', btnGrad); };

  var btnWave = document.createElement('button');
  btnWave.textContent = 'Wave';
  btnWave.onclick = function () { setBreathingMode('sinewave', btnWave); };

  var btnPart = document.createElement('button');
  btnPart.textContent = 'Particles';
  btnPart.onclick = function () { setBreathingMode('particles', btnPart); };

  var btnColor = document.createElement('button');
  btnColor.textContent = 'Color';
  btnColor.onclick = function () { toggleBreathingColorPicker(btnColor); };

  var btnSound = document.createElement('button');
  btnSound.textContent = 'Sound: On';
  btnSound.className = 'active';
  btnSound.onclick = function () { toggleBreathingSound(btnSound); };

  controls.appendChild(btnGrad);
  controls.appendChild(btnWave);
  controls.appendChild(btnPart);
  controls.appendChild(btnColor);
  controls.appendChild(btnSound);

  function loadP5(cb) {
    if (window.p5) return cb();
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.2/p5.min.js';
    s.onload = cb;
    document.body.appendChild(s);
  }

  loadP5(function () {
    var demo = document.createElement('script');
    demo.src = 'demos/breathing-demo.js';
    document.body.appendChild(demo);
  });
}

function loadPostureDemo() {
  var content = document.getElementById('demo-overlay-content');
  var controls = document.getElementById('overlay-controls');
  content.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#00aa00;font-size:0.8rem">Loading p5.js + ML5...</div>';

  // Build controls
  controls.innerHTML = '';
  var btnCamera = document.createElement('button');
  btnCamera.textContent = 'Camera: On';
  btnCamera.className = 'active';
  btnCamera.onclick = function () { togglePostureCamera(btnCamera); };
  controls.appendChild(btnCamera);

  var btnSound = document.createElement('button');
  btnSound.textContent = 'Sound: On';
  btnSound.className = 'active';
  btnSound.onclick = function () { togglePostureSound(btnSound); };
  controls.appendChild(btnSound);

  function loadP5(cb) {
    if (window.p5) return cb();
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.2/p5.min.js';
    s.onload = cb;
    document.body.appendChild(s);
  }

  loadP5(function () {
    // Load ml5 if not already loaded
    if (window.ml5) {
      var demo = document.createElement('script');
      demo.src = 'demos/posture-demo.js';
      document.body.appendChild(demo);
      return;
    }
    var s2 = document.createElement('script');
    s2.src = 'https://unpkg.com/ml5@0.12.2/dist/ml5.min.js';
    s2.onload = function () {
      var demo = document.createElement('script');
      demo.src = 'demos/posture-demo.js';
      document.body.appendChild(demo);
    };
    document.body.appendChild(s2);
  });
}

function loadDirtyDemo() {
  var content = document.getElementById('demo-overlay-content');
  var controls = document.getElementById('overlay-controls');
  content.innerHTML = '';

  // Build controls
  controls.innerHTML = '';
  var btnColor = document.createElement('button');
  btnColor.textContent = 'Colorful: On';
  btnColor.className = 'active';
  btnColor.onclick = function () { toggleDirtyColor(btnColor); };

  var btnMode = document.createElement('button');
  btnMode.textContent = 'Mode: Trace';
  btnMode.onclick = function () {
    if (window._dirtyToggleMode) {
      var isDraw = window._dirtyToggleMode();
      btnMode.textContent = 'Mode: ' + (isDraw ? 'Draw' : 'Trace');
      btnMode.classList.toggle('active', isDraw);
    }
  };

  controls.appendChild(btnColor);
  controls.appendChild(btnMode);

  var demo = document.createElement('script');
  demo.src = 'demos/dirty-window-demo.js';
  document.body.appendChild(demo);
}

// ─── Demo Control Wrappers ─────────────────────────────────

function setBreathingMode(mode, btn) {
  if (window._breathingSetMode) window._breathingSetMode(mode);
  var btns = document.querySelectorAll('#overlay-controls button');
  // Only toggle active on the first 3 mode buttons, not color/sound buttons
  for (var i = 0; i < 3 && i < btns.length; i++) btns[i].classList.remove('active');
  btn.classList.add('active');
}

function toggleBreathingSound(btn) {
  if (window._breathingToggleSound) {
    var on = window._breathingToggleSound();
    btn.textContent = 'Sound: ' + (on ? 'On' : 'Off');
    btn.classList.toggle('active', on);
  }
}

function toggleBreathingColorPicker(btn) {
  if (window._breathingToggleColorPicker) {
    var on = window._breathingToggleColorPicker();
    btn.classList.toggle('active', on);
  }
}

function togglePostureCamera(btn) {
  if (window._postureToggleCamera) {
    var on = window._postureToggleCamera();
    btn.textContent = 'Camera: ' + (on ? 'On' : 'Off');
    btn.classList.toggle('active', on);
  }
}

function togglePostureSound(btn) {
  if (window._postureToggleSound) {
    var on = window._postureToggleSound();
    btn.textContent = 'Sound: ' + (on ? 'On' : 'Off');
    btn.classList.toggle('active', on);
  }
}

function toggleDirtyColor(btn) {
  if (window._dirtyToggleColor) {
    var on = window._dirtyToggleColor();
    btn.textContent = 'Colorful: ' + (on ? 'On' : 'Off');
    btn.classList.toggle('active', on);
  }
}

// ─── Random Initial Position for Info Cards ───────────────
(function () {
  document.querySelectorAll('.info-card').forEach(function (card) {
    var rx = Math.round((Math.random() - 0.5) * 100); // ±150px horizontal
    var ry = Math.round((Math.random() - 0.5) * 50); // ±80px vertical
    card.style.transform = 'translate(' + rx + 'px,' + ry + 'px)';
    card.dataset.tx = rx;
    card.dataset.ty = ry;
  });
})();

// ─── Draggable & Resizable Info Cards ─────────────────────
// Uses CSS translate for drag so card stays in document flow and scrolls with page.
// On first resize, pins the left edge so width grows to the right.
// All four corners support resize.
(function () {
  document.querySelectorAll('.info-card').forEach(function (card) {
    var titlebar = card.querySelector('.card-titlebar');
    var handleBR = card.querySelector('.resize-handle');
    var handleTL = card.querySelector('.resize-handle-tl');
    var handleTR = card.querySelector('.resize-handle-tr');
    var handleBL = card.querySelector('.resize-handle-bl');
    if (!titlebar) return;

    var isDragging = false;
    var isResizing = false;
    var resizeCorner = '';
    var startX, startY;
    var tx = parseFloat(card.dataset.tx) || 0;
    var ty = parseFloat(card.dataset.ty) || 0;
    var dragTx, dragTy;
    var origW, origH, origTx, origTy;

    // Pin to left-based positioning so resize works predictably
    function pinLeft() {
      if (card.dataset.pinned) return;
      var rect = card.getBoundingClientRect();
      var parentRect = card.parentElement.getBoundingClientRect();
      var left = rect.left - parentRect.left - tx;
      card.style.left = left + 'px';
      card.style.right = 'auto';
      card.dataset.pinned = '1';
    }

    // ── Drag via titlebar ──
    titlebar.addEventListener('mousedown', function (e) {
      if (e.target.closest('.traffic-lights')) return;
      e.preventDefault();
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      dragTx = tx;
      dragTy = ty;
      document.body.style.userSelect = 'none';
    });

    titlebar.addEventListener('touchstart', function (e) {
      if (e.target.closest('.traffic-lights')) return;
      isDragging = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dragTx = tx;
      dragTy = ty;
    }, { passive: true });

    // ── Resize via corner handles ──
    function startResize(corner, e) {
      e.preventDefault();
      e.stopPropagation();
      pinLeft();
      isResizing = true;
      resizeCorner = corner;
      startX = e.clientX;
      startY = e.clientY;
      origW = card.offsetWidth;
      origH = card.offsetHeight;
      origTx = tx;
      origTy = ty;
      document.body.style.userSelect = 'none';
    }

    function startResizeTouch(corner, e) {
      e.stopPropagation();
      pinLeft();
      isResizing = true;
      resizeCorner = corner;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      origW = card.offsetWidth;
      origH = card.offsetHeight;
      origTx = tx;
      origTy = ty;
    }

    if (handleBR) {
      handleBR.addEventListener('mousedown', function (e) { startResize('br', e); });
      handleBR.addEventListener('touchstart', function (e) { startResizeTouch('br', e); }, { passive: true });
    }
    if (handleTL) {
      handleTL.addEventListener('mousedown', function (e) { startResize('tl', e); });
      handleTL.addEventListener('touchstart', function (e) { startResizeTouch('tl', e); }, { passive: true });
    }
    if (handleTR) {
      handleTR.addEventListener('mousedown', function (e) { startResize('tr', e); });
      handleTR.addEventListener('touchstart', function (e) { startResizeTouch('tr', e); }, { passive: true });
    }
    if (handleBL) {
      handleBL.addEventListener('mousedown', function (e) { startResize('bl', e); });
      handleBL.addEventListener('touchstart', function (e) { startResizeTouch('bl', e); }, { passive: true });
    }

    function applyResize(cx, cy) {
      var dx = cx - startX;
      var dy = cy - startY;
      var newW, newH;

      if (resizeCorner === 'br') {
        newW = Math.max(240, origW + dx);
        newH = Math.max(120, origH + dy);
        card.style.width = newW + 'px';
        card.style.height = newH + 'px';
      } else if (resizeCorner === 'bl') {
        newW = Math.max(240, origW - dx);
        newH = Math.max(120, origH + dy);
        tx = origTx + (origW - newW);
        card.style.width = newW + 'px';
        card.style.height = newH + 'px';
        card.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
      } else if (resizeCorner === 'tr') {
        newW = Math.max(240, origW + dx);
        newH = Math.max(120, origH - dy);
        ty = origTy + (origH - newH);
        card.style.width = newW + 'px';
        card.style.height = newH + 'px';
        card.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
      } else if (resizeCorner === 'tl') {
        newW = Math.max(240, origW - dx);
        newH = Math.max(120, origH - dy);
        tx = origTx + (origW - newW);
        ty = origTy + (origH - newH);
        card.style.width = newW + 'px';
        card.style.height = newH + 'px';
        card.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
      }
    }

    // ── Mousemove / Touchmove ──
    document.addEventListener('mousemove', function (e) {
      if (isDragging) {
        tx = dragTx + e.clientX - startX;
        ty = dragTy + e.clientY - startY;
        card.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
      }
      if (isResizing) {
        applyResize(e.clientX, e.clientY);
      }
    });

    document.addEventListener('touchmove', function (e) {
      if (!isDragging && !isResizing) return;
      var t = e.touches[0];
      if (isDragging) {
        tx = dragTx + t.clientX - startX;
        ty = dragTy + t.clientY - startY;
        card.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
      }
      if (isResizing) {
        applyResize(t.clientX, t.clientY);
      }
    }, { passive: true });

    // ── Release ──
    function stop() {
      isDragging = false;
      isResizing = false;
      resizeCorner = '';
      document.body.style.userSelect = '';
    }
    document.addEventListener('mouseup', stop);
    document.addEventListener('touchend', stop);
  });
})();

