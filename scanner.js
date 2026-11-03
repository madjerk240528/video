// ============================================================
// scanner.js — Logic for scan.html (Scanner App)
// Artivive-style: camera recognises the physical photo,
// plays the paired video locked in 3D AR ("VR hold").
// ============================================================
import { getAllMemories, downloadBlob } from './db.js';

// ---- State ----
let memories        = [];   // Array sorted by targetIndex
let targetVideoBlobUrls = {}; // { targetIndex: blobUrl }
let isMuted         = true;
let isArRunning     = false;
let arScene         = null;
let currentArPlanes = {}; // { targetIndex: aPlaneEl }
let currentArVideos = {}; // { targetIndex: videoEl }

// ---- DOM ----
const loadingScreen = document.getElementById('loading-screen');
const errorScreen   = document.getElementById('error-screen');
const errorMsg      = document.getElementById('error-msg');
const homeScreen    = document.getElementById('home-screen');
const arOverlay     = document.getElementById('ar-overlay');
const arContainer   = document.getElementById('ar-container');
const statusPill    = document.getElementById('ar-status-pill');
const btnStartScan  = document.getElementById('btn-start-scan');
const btnCloseAr    = document.getElementById('btn-close-ar');
const btnToggleMute = document.getElementById('btn-toggle-mute');
const memoriesPreview = document.getElementById('memories-preview');
const loadingBar    = document.getElementById('loading-bar-fill');
const loadingMsg    = document.getElementById('loading-msg');

// ============================================================
//  INIT — Fetch memories + download targets.mind
// ============================================================
(async function init() {
  showScreen('loading');
  setLoadingMsg('Connecting to cloud...', 0.05);

  try {
    // 1. Fetch all memories from Firebase DB
    const raw = await getAllMemories();
    memories = Object.values(raw).sort((a, b) => a.targetIndex - b.targetIndex);

    if (memories.length === 0) {
      showError(
        'No AR memories registered yet.<br>' +
        '<a href="index.html" style="color:#d4a017">Open Creator to add your first memory →</a>'
      );
      return;
    }

    setLoadingMsg(`Found ${memories.length} memory(s). Downloading AR targets...`, 0.25);

    // 2. Download targets.mind from Firebase Storage → Blob URL
    const mindBlob   = await downloadBlob('targets.mind');
    const mindBlobUrl = URL.createObjectURL(mindBlob);

    setLoadingMsg('AR targets loaded. Ready to scan!', 1.0);
    await sleep(300);

    // 3. Render memory thumbnails in home screen
    renderMemoriesPreview(memories);

    // 4. Store mind blob URL for when user starts scanning
    window._mindBlobUrl = mindBlobUrl;

    showScreen('home');

  } catch (err) {
    console.error('Scanner init error:', err);
    if (err.message && err.message.includes('PASTE_YOUR')) {
      showError('Firebase is not configured yet.<br>Fill in <code>firebase-config.js</code> with your Firebase project details.');
    } else if (err.code === 'storage/object-not-found') {
      showError('No AR targets file found.<br><a href="index.html" style="color:#d4a017">Create your first memory first →</a>');
    } else {
      showError('Could not load AR data.<br>' + (err.message || String(err)));
    }
  }
})();

// ============================================================
//  RENDER MEMORY THUMBNAILS
// ============================================================
function renderMemoriesPreview(mems) {
  if (!memoriesPreview) return;
  memoriesPreview.innerHTML = mems.map(m => `
    <div class="mem-thumb-wrap">
      <img src="${m.photoUrl}" class="mem-thumb-img" alt="${m.title}">
      <div class="mem-thumb-title">${m.title}</div>
    </div>
  `).join('');
}

// ============================================================
//  START SCANNER
// ============================================================
btnStartScan && btnStartScan.addEventListener('click', startScanner);

async function startScanner() {
  if (isArRunning) return;
  if (!window._mindBlobUrl) { alert('AR targets not loaded. Please refresh.'); return; }

  showScreen('ar');
  isArRunning = true;
  setStatusPill('🔍 Point camera at the photo', false);

  try {
    buildArScene(window._mindBlobUrl, memories);

    const scene = document.getElementById('ar-scene');

    const launch = async () => {
      arScene = scene;
      const sys = scene.systems['mindar-image-system'];
      if (sys) {
        await sys.start();
        registerAnchorEvents();
      }
    };

    if (scene.hasLoaded) {
      await launch();
    } else {
      scene.addEventListener('loaded', launch, { once: true });
    }

  } catch (err) {
    console.error('AR start error:', err);
    stopScanner();
    showError('Camera failed to launch.<br>Please use HTTPS (not http://) and allow camera permission.<br>' + err.message);
  }
}

// ============================================================
//  BUILD A-FRAME + MindAR SCENE
// ============================================================
function buildArScene(mindBlobUrl, mems) {
  // Remove old scene if any
  const old = document.getElementById('ar-scene');
  if (old) old.remove();
  currentArPlanes = {};
  currentArVideos = {};

  // <a-scene>
  const scene = document.createElement('a-scene');
  scene.id = 'ar-scene';
  scene.setAttribute('mindar-image',
    `imageTargetSrc: ${mindBlobUrl}; ` +
    `autoStart: false; ` +
    `uiLoading: no; uiScanning: no; ` +
    `filterMinCF: 0.0001; filterBeta: 0.001; missTolerance: 5;`
  );
  scene.setAttribute('color-space', 'sRGB');
  scene.setAttribute('renderer', 'colorManagement: true; alpha: true;');
  scene.setAttribute('vr-mode-ui', 'enabled: false');
  scene.setAttribute('device-orientation-permission-ui', 'enabled: false');
  scene.setAttribute('embedded', '');

  // <a-assets> — one <video> per memory
  const assets = document.createElement('a-assets');
  assets.setAttribute('timeout', '30000');

  mems.forEach((mem) => {
    const vid = document.createElement('video');
    vid.id = `vid-${mem.targetIndex}`;
    vid.setAttribute('preload', 'none');  // lazy-load; filled on targetFound
    vid.setAttribute('playsinline', '');
    vid.setAttribute('webkit-playsinline', '');
    vid.setAttribute('muted', '');
    vid.setAttribute('loop', '');
    assets.appendChild(vid);
    currentArVideos[mem.targetIndex] = vid;
  });
  scene.appendChild(assets);

  // <a-camera>
  const cam = document.createElement('a-camera');
  cam.setAttribute('position', '0 0 0');
  cam.setAttribute('look-controls', 'enabled: false');
  scene.appendChild(cam);

  // One <a-entity> anchor + <a-plane> per memory
  mems.forEach((mem) => {
    const anchor = document.createElement('a-entity');
    anchor.id = `anchor-${mem.targetIndex}`;
    anchor.setAttribute('mindar-image-target', `targetIndex: ${mem.targetIndex}`);

    const plane = document.createElement('a-plane');
    plane.id = `plane-${mem.targetIndex}`;
    // Width normalized to 1 (MindAR standard); height = photo aspect ratio
    plane.setAttribute('width',  '1');
    plane.setAttribute('height', (mem.photoAspect || 1.25).toString());
    plane.setAttribute('position', '0 0 0');
    plane.setAttribute('src', `#vid-${mem.targetIndex}`);
    // 'flat' shader = unlit, shows video exactly; transparent so black edges don't show
    plane.setAttribute('material', 'shader: flat; side: double; transparent: true; opacity: 0;');
    anchor.appendChild(plane);
    scene.appendChild(anchor);

    currentArPlanes[mem.targetIndex] = plane;
  });

  arContainer.insertBefore(scene, arContainer.firstChild);
  return scene;
}

// ============================================================
//  ANCHOR EVENTS  (targetFound / targetLost)
// ============================================================
function registerAnchorEvents() {
  memories.forEach((mem) => {
    const anchor = document.getElementById(`anchor-${mem.targetIndex}`);
    if (!anchor) return;

    anchor.addEventListener('targetFound', () => onTargetFound(mem));
    anchor.addEventListener('targetLost',  () => onTargetLost(mem));
  });
}

async function onTargetFound(mem) {
  const idx   = mem.targetIndex;
  const vid   = currentArVideos[idx];
  const plane = currentArPlanes[idx];
  if (!vid || !plane) return;

  setStatusPill('⏳ Loading video...', false);

  // Fetch or assign video on first detection (lazy load)
  if (!targetVideoBlobUrls[idx]) {
    try {
      if (mem.videoStoragePath && !mem.videoStoragePath.startsWith('http') && !mem.videoStoragePath.startsWith('videos/')) {
        // Direct local file (like video.mp4)
        targetVideoBlobUrls[idx] = mem.videoStoragePath;
        vid.src = mem.videoStoragePath;
      } else {
        // Cloud video or Google Drive link — download as Blob URL to eliminate CORS in WebGL
        const blob    = await downloadBlob(mem.videoStoragePath || mem.videoUrl);
        const blobUrl = URL.createObjectURL(blob);
        targetVideoBlobUrls[idx] = blobUrl;
        vid.src = blobUrl;
      }
      vid.load();
      await new Promise((resolve) => {
        vid.addEventListener('loadeddata', resolve, { once: true });
        setTimeout(resolve, 3000);
      });
    } catch (e) {
      console.error('Video fetch failed:', e);
      // Fallback
      vid.src = mem.videoUrl || 'video.mp4';
      vid.load();
    }
  } else if (!vid.src || vid.src === window.location.href) {
    vid.src = targetVideoBlobUrls[idx];
    vid.load();
  }

  // Adjust plane height to video's actual aspect ratio
  if (vid.videoWidth && vid.videoHeight) {
    plane.setAttribute('height', (vid.videoHeight / vid.videoWidth).toString());
  }

  // Show the plane and play
  plane.setAttribute('material', 'shader: flat; side: double; transparent: true; opacity: 1;');
  vid.muted = isMuted;
  vid.currentTime = 0;
  vid.play().catch(() => {});

  setStatusPill('✨ Memory Playing!', true);
  if (!isMuted) return;
  // Show unmute hint
  showMuteHint();
}

function onTargetLost(mem) {
  const idx   = mem.targetIndex;
  const vid   = currentArVideos[idx];
  const plane = currentArPlanes[idx];
  if (vid)   vid.pause();
  if (plane) plane.setAttribute('material', 'shader: flat; side: double; transparent: true; opacity: 0;');
  setStatusPill('🔍 Point camera at the photo', false);
}

// ============================================================
//  SOUND TOGGLE
// ============================================================
btnToggleMute && btnToggleMute.addEventListener('click', () => {
  isMuted = !isMuted;
  btnToggleMute.textContent = isMuted ? '🔇' : '🔊';
  Object.values(currentArVideos).forEach(vid => { vid.muted = isMuted; });
  hideMuteHint();
});

let muteHint = null;
function showMuteHint() {
  if (!muteHint) {
    muteHint = document.createElement('div');
    muteHint.id = 'mute-hint';
    muteHint.textContent = '🔇 Tap 🔊 to enable sound';
    muteHint.style.cssText = `
      position:fixed;top:72px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,.7);color:#fff;padding:8px 18px;
      border-radius:24px;font-size:14px;z-index:9999;
      pointer-events:none;white-space:nowrap;
    `;
    document.body.appendChild(muteHint);
  }
  muteHint.style.display = 'block';
  clearTimeout(muteHint._t);
  muteHint._t = setTimeout(() => { if (muteHint) muteHint.style.display = 'none'; }, 3500);
}
function hideMuteHint() {
  if (muteHint) muteHint.style.display = 'none';
}

// ============================================================
//  CLOSE SCANNER
// ============================================================
btnCloseAr && btnCloseAr.addEventListener('click', stopScanner);

function stopScanner() {
  isArRunning = false;
  // Stop MindAR
  if (arScene) {
    const sys = arScene.systems && arScene.systems['mindar-image-system'];
    if (sys) { try { sys.stop(); } catch (_) {} }
  }
  // Pause all videos
  Object.values(currentArVideos).forEach(vid => { try { vid.pause(); } catch (_) {} });
  // Remove scene
  const old = document.getElementById('ar-scene');
  if (old) old.remove();
  arScene = null;

  showScreen('home');
}

// ============================================================
//  SCREEN MANAGEMENT
// ============================================================
function showScreen(name) {
  [loadingScreen, errorScreen, homeScreen, arOverlay, arContainer].forEach(el => {
    if (el) el.style.display = 'none';
  });
  if (name === 'loading') {
    if (loadingScreen) loadingScreen.style.display = 'flex';
  } else if (name === 'error') {
    if (errorScreen) errorScreen.style.display = 'flex';
  } else if (name === 'home') {
    if (homeScreen) homeScreen.style.display = 'flex';
  } else if (name === 'ar') {
    if (arContainer) arContainer.style.display = 'block';
    if (arOverlay)   arOverlay.style.display   = 'flex';
  }
}

function showError(msg) {
  showScreen('error');
  if (errorMsg) errorMsg.innerHTML = msg;
}

function setStatusPill(text, isActive) {
  if (!statusPill) return;
  statusPill.textContent = text;
  statusPill.className = 'ar-status-pill' + (isActive ? ' active' : '');
}

function setLoadingMsg(msg, fraction) {
  if (loadingMsg) loadingMsg.textContent = msg;
  if (loadingBar)  loadingBar.style.width = (fraction * 100).toFixed(0) + '%';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
