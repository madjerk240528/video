// ========================================================
//  Living Memory AR — app.js (ES Module)
//  User uploads photo + video → compiles in-browser → AR
// ========================================================
import { Compiler } from "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js";

// ---- State ----
let userPhotoDataUrl = null;  // data:image URL of the uploaded photo
let userVideoObjectUrl = null; // object URL of the uploaded video
let compiledMindBuffer = null; // ArrayBuffer of compiled .mind data
let compiledMindObjectUrl = null; // Object URL for the .mind file

let isArRunning = false;
let isMuted = true;
let arScene = null;
let arAnchor = null;
let arVideo = null;
let arVideoMesh = null;
let textureSyncInterval = null;

// ---- Element References ----
const photoBox       = document.getElementById('photo-box');
const photoInput     = document.getElementById('photo-input');
const photoThumb     = document.getElementById('photo-thumb');
const videoBox       = document.getElementById('video-box');
const videoInput     = document.getElementById('video-input');
const videoThumb     = document.getElementById('video-thumb');

const compileBarWrap = document.getElementById('compile-bar-wrap');
const compileBarFill = document.getElementById('compile-bar-fill');
const compileStatus  = document.getElementById('compile-status');

const dot1 = document.getElementById('dot-1');
const dot2 = document.getElementById('dot-2');
const dot3 = document.getElementById('dot-3');
const stepLabel = document.getElementById('step-label');

const uploadSection       = document.getElementById('upload-section');
const photoPreviewSection = document.getElementById('photo-preview-section');
const actionButtons       = document.getElementById('action-buttons');
const guideCard           = document.getElementById('guide-card');
const cardPhoto           = document.getElementById('card-photo');
const photoDims           = document.getElementById('photo-dims');

const btnStartAr    = document.getElementById('btn-start-ar');
const btnDirectPlay = document.getElementById('btn-direct-play');
const btnStartAr2   = document.getElementById('btn-start-ar-2');
const btnDirectPlay2 = document.getElementById('btn-direct-play-2');
const btnChangeFiles = document.getElementById('btn-change-files');

const arContainer    = document.getElementById('ar-container');
const btnExitAr      = document.getElementById('btn-exit-ar');
const btnToggleSound = document.getElementById('btn-toggle-sound');
const soundIcon      = document.getElementById('sound-icon');
const tapUnmutePill  = document.getElementById('tap-unmute-pill');
const promptPill     = document.getElementById('prompt-pill');
const promptIcon     = document.getElementById('prompt-icon');
const promptText     = document.getElementById('prompt-text');
const scanLaser      = document.getElementById('scan-laser');
const reticleBox     = document.getElementById('reticle-box');

const videoModal     = document.getElementById('video-modal');
const directVideo    = document.getElementById('direct-video');
const btnCloseModal  = document.getElementById('btn-close-modal');
const permissionModal = document.getElementById('permission-modal');
const btnModalWatchDirect = document.getElementById('btn-modal-watch-direct');
const btnModalCloseGuide  = document.getElementById('btn-modal-close-guide');
const inappBanner    = document.getElementById('inapp-banner');
const appContainer   = document.getElementById('app-container');

// ---- Detect In-App Browser ----
(function checkInApp() {
  const ua = navigator.userAgent || '';
  if (/(FBAN|FBAV|Instagram|TikTok|MicroMessenger|Line|Twitter|Snapchat)/i.test(ua)) {
    inappBanner && inappBanner.classList.add('active');
  }
})();

// ========================================================
//  UPLOAD: Photo
// ========================================================
photoBox.addEventListener('click', () => photoInput.click());
photoInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) handlePhotoFile(e.target.files[0]);
});

// Drag & drop on phone (desktop only, mobile uses tap)
photoBox.addEventListener('dragover', (e) => { e.preventDefault(); photoBox.classList.add('dragover'); });
photoBox.addEventListener('dragleave', () => photoBox.classList.remove('dragover'));
photoBox.addEventListener('drop', (e) => {
  e.preventDefault(); photoBox.classList.remove('dragover');
  if (e.dataTransfer.files[0]) handlePhotoFile(e.dataTransfer.files[0]);
});

async function handlePhotoFile(file) {
  userPhotoDataUrl = await fileToDataUrl(file);
  photoThumb.src = userPhotoDataUrl;
  photoBox.classList.add('done');
  checkBothUploaded();
}

// ========================================================
//  UPLOAD: Video
// ========================================================
videoBox.addEventListener('click', () => videoInput.click());
videoInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) handleVideoFile(e.target.files[0]);
});

videoBox.addEventListener('dragover', (e) => { e.preventDefault(); videoBox.classList.add('dragover'); });
videoBox.addEventListener('dragleave', () => videoBox.classList.remove('dragover'));
videoBox.addEventListener('drop', (e) => {
  e.preventDefault(); videoBox.classList.remove('dragover');
  if (e.dataTransfer.files[0]) handleVideoFile(e.dataTransfer.files[0]);
});

function handleVideoFile(file) {
  if (userVideoObjectUrl) URL.revokeObjectURL(userVideoObjectUrl);
  userVideoObjectUrl = URL.createObjectURL(file);
  videoThumb.src = userVideoObjectUrl;
  videoBox.classList.add('done');
  checkBothUploaded();
}

// ========================================================
//  Once BOTH are uploaded → compile the .mind file
// ========================================================
async function checkBothUploaded() {
  if (!userPhotoDataUrl || !userVideoObjectUrl) return;
  await compilePhotoForAR();
}

async function compilePhotoForAR() {
  // Show compile progress bar
  compileBarWrap.classList.add('active');
  compileBarFill.style.width = '0%';
  compileStatus.textContent = 'Analysing photo for AR tracking… (5–15 sec)';

  // Update step dots
  dot1.classList.remove('active');
  dot2.classList.add('active');
  stepLabel.textContent = 'Processing AR tracking…';
  stepLabel.classList.remove('active');
  dot2.classList.add('active');

  try {
    const compiler = new Compiler();

    // Load photo as HTMLImageElement
    const img = new Image();
    img.src = userPhotoDataUrl;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

    // Compile
    await compiler.compileImageTargets([img], (pct) => {
      compileBarFill.style.width = `${pct.toFixed(0)}%`;
      compileStatus.textContent = `Processing: ${pct.toFixed(0)}% complete…`;
    });

    compiledMindBuffer = await compiler.exportData();
    if (compiledMindObjectUrl) URL.revokeObjectURL(compiledMindObjectUrl);
    compiledMindObjectUrl = URL.createObjectURL(new Blob([compiledMindBuffer]));

    compileBarFill.style.width = '100%';
    compileStatus.textContent = '✅ Ready! You can now scan in AR.';

    // Step done
    dot2.classList.remove('active');
    dot3.classList.add('active');
    stepLabel.textContent = 'Ready! Tap below to start.';
    stepLabel.classList.add('active');

    // Show preview & buttons
    showPreviewAndButtons();

  } catch (err) {
    console.error('Compile error:', err);
    compileStatus.textContent = '⚠️ Processing failed. Try a different photo (JPG/PNG with good contrast).';
  }
}

function showPreviewAndButtons() {
  // Set card photo
  cardPhoto.src = userPhotoDataUrl;
  cardPhoto.onload = () => {
    const w = cardPhoto.naturalWidth;
    const h = cardPhoto.naturalHeight;
    const isPortrait = h >= w;
    photoDims.textContent = `${w}×${h} • ${isPortrait ? 'Portrait' : 'Landscape'}`;
  };

  // Set direct video
  directVideo.src = userVideoObjectUrl;

  // Show photo section & action buttons, hide upload compile bar
  compileBarWrap.classList.remove('active');
  photoPreviewSection.style.display = 'block';
  actionButtons.style.display = 'flex';
  guideCard.style.display = 'none';

  // On the upload card: show watch video + start AR buttons  
  btnStartAr.style.display = 'flex';
  btnDirectPlay.style.display = 'flex';
}

// Change files button: reset to upload view
btnChangeFiles && btnChangeFiles.addEventListener('click', resetToUpload);

function resetToUpload() {
  userPhotoDataUrl = null;
  userVideoObjectUrl = null;
  compiledMindBuffer = null;
  compiledMindObjectUrl = null;

  photoBox.classList.remove('done');
  videoBox.classList.remove('done');
  photoThumb.src = '';
  videoThumb.src = '';
  photoInput.value = '';
  videoInput.value = '';

  compileBarWrap.classList.remove('active');
  photoPreviewSection.style.display = 'none';
  actionButtons.style.display = 'none';
  guideCard.style.display = 'block';
  btnStartAr.style.display = 'none';
  btnDirectPlay.style.display = 'none';

  dot1.classList.add('active');
  dot2.classList.remove('active');
  dot3.classList.remove('active');
  stepLabel.textContent = 'Upload your photo & video';
}

// ========================================================
//  START AR
// ========================================================
async function startAR() {
  if (!compiledMindObjectUrl || !userVideoObjectUrl) {
    alert('Please upload both a photo and a video first.');
    return;
  }

  try {
    // Build AR scene dynamically with user's compiled targets & video
    buildArScene();

    appContainer.style.display = 'none';
    arContainer.classList.add('active');
    isArRunning = true;

    // Wait for scene to initialise then start tracking
    const scene = document.getElementById('ar-scene');
    const startTracking = async () => {
      arScene = scene;
      arAnchor = document.getElementById('ar-anchor');
      arVideo = document.getElementById('ar-video-asset');
      arVideoMesh = document.getElementById('ar-video-mesh');

      // Audio unlock
      arVideo.muted = true;
      arVideo.play().then(() => { arVideo.pause(); arVideo.currentTime = 0; }).catch(() => {});

      const mindarSystem = scene.systems['mindar-image-system'];
      if (mindarSystem) {
        await mindarSystem.start();
        startTextureSync();
        registerAnchorEvents();
      }
    };

    if (scene.hasLoaded) {
      await startTracking();
    } else {
      scene.addEventListener('loaded', startTracking, { once: true });
    }

  } catch (err) {
    console.error('AR start error:', err);
    exitArMode();
    permissionModal.classList.add('active');
  }
}

function buildArScene() {
  // Remove any existing scene
  const old = document.getElementById('ar-scene');
  if (old) old.remove();

  const scene = document.createElement('a-scene');
  scene.id = 'ar-scene';
  scene.setAttribute('mindar-image',
    `imageTargetSrc: ${compiledMindObjectUrl}; autoStart: false; uiLoading: no; uiScanning: no;`);
  scene.setAttribute('color-space', 'sRGB');
  scene.setAttribute('embedded', '');
  scene.setAttribute('renderer', 'colorManagement: true, physicallyCorrectLights');
  scene.setAttribute('vr-mode-ui', 'enabled: false');
  scene.setAttribute('device-orientation-permission-ui', 'enabled: false');

  // Assets
  const assets = document.createElement('a-assets');
  const vid = document.createElement('video');
  vid.id = 'ar-video-asset';
  vid.src = userVideoObjectUrl;
  vid.setAttribute('preload', 'auto');
  vid.setAttribute('playsinline', '');
  vid.setAttribute('webkit-playsinline', '');
  vid.setAttribute('muted', '');
  vid.setAttribute('loop', '');
  assets.appendChild(vid);
  scene.appendChild(assets);

  // Camera
  const cam = document.createElement('a-camera');
  cam.setAttribute('position', '0 0 0');
  cam.setAttribute('look-controls', 'enabled: false');
  scene.appendChild(cam);

  // Target anchor + video mesh
  const anchor = document.createElement('a-entity');
  anchor.id = 'ar-anchor';
  anchor.setAttribute('mindar-image-target', 'targetIndex: 0');
  const mesh = document.createElement('a-video');
  mesh.id = 'ar-video-mesh';
  mesh.setAttribute('src', '#ar-video-asset');
  mesh.setAttribute('position', '0 0 0');
  mesh.setAttribute('width', '1');
  mesh.setAttribute('height', '1');
  anchor.appendChild(mesh);
  scene.appendChild(anchor);

  // Insert BEFORE the ar-overlay div
  arContainer.insertBefore(scene, arContainer.firstChild);
}

function registerAnchorEvents() {
  arVideo.addEventListener('loadedmetadata', adjustVideoMesh);

  arAnchor.addEventListener('targetFound', () => {
    arVideo.muted = isMuted;
    arVideo.play().catch(() => {});
    promptPill.classList.add('target-detected');
    promptIcon.textContent = '✨';
    promptText.textContent = 'Memory Playing!';
    scanLaser.style.display = 'none';
    if (isMuted) tapUnmutePill.classList.add('active');
  });

  arAnchor.addEventListener('targetLost', () => {
    arVideo.pause();
    promptPill.classList.remove('target-detected');
    promptIcon.textContent = '🔍';
    promptText.textContent = 'Point camera at the photo';
    scanLaser.style.display = 'block';
    tapUnmutePill.classList.remove('active');
  });
}

function adjustVideoMesh() {
  if (!arVideo || !arVideoMesh) return;
  if (arVideo.videoWidth && arVideo.videoHeight) {
    const aspect = arVideo.videoHeight / arVideo.videoWidth;
    arVideoMesh.setAttribute('width', '1');
    arVideoMesh.setAttribute('height', aspect.toFixed(4));
  }
}

function startTextureSync() {
  if (textureSyncInterval) clearInterval(textureSyncInterval);
  textureSyncInterval = setInterval(() => {
    if (isArRunning && arVideo && !arVideo.paused && arVideoMesh) {
      const mesh = arVideoMesh.getObject3D('mesh');
      if (mesh && mesh.material && mesh.material.map) {
        mesh.material.map.needsUpdate = true;
      }
    }
  }, 1000 / 30);
}

// ========================================================
//  EXIT AR
// ========================================================
function exitArMode() {
  if (!isArRunning) return;
  if (textureSyncInterval) { clearInterval(textureSyncInterval); textureSyncInterval = null; }
  if (arVideo) arVideo.pause();
  tapUnmutePill.classList.remove('active');

  if (arScene) {
    const sys = arScene.systems['mindar-image-system'];
    if (sys && sys.stop) { try { sys.stop(); } catch (e) {} }
  }

  arContainer.classList.remove('active');
  appContainer.style.display = 'flex';
  isArRunning = false;
}

// ========================================================
//  SOUND TOGGLE
// ========================================================
function setAudio(unmute) {
  isMuted = !unmute;
  if (arVideo) arVideo.muted = isMuted;
  soundIcon.textContent = isMuted ? '🔇' : '🔊';
  if (!isMuted) tapUnmutePill.classList.remove('active');
}

btnToggleSound.addEventListener('click', () => setAudio(isMuted));
tapUnmutePill.addEventListener('click', () => setAudio(true));

// ========================================================
//  VIDEO MODAL (Direct Play)
// ========================================================
function openVideoModal() {
  if (!userVideoObjectUrl) return;
  directVideo.src = userVideoObjectUrl;
  videoModal.classList.add('active');
  directVideo.currentTime = 0;
  directVideo.play().catch(() => {});
}

function closeVideoModal() {
  videoModal.classList.remove('active');
  directVideo.pause();
}

// Photo preview box click → open video
document.getElementById('preview-box').addEventListener('click', openVideoModal);
btnCloseModal.addEventListener('click', closeVideoModal);
videoModal.addEventListener('click', (e) => { if (e.target === videoModal) closeVideoModal(); });

// ========================================================
//  BUTTON BINDINGS
// ========================================================
[btnStartAr, btnStartAr2].forEach(b => b && b.addEventListener('click', startAR));
[btnDirectPlay, btnDirectPlay2].forEach(b => b && b.addEventListener('click', openVideoModal));

btnExitAr.addEventListener('click', exitArMode);

btnModalCloseGuide.addEventListener('click', () => permissionModal.classList.remove('active'));
btnModalWatchDirect.addEventListener('click', () => {
  permissionModal.classList.remove('active');
  openVideoModal();
});

window.addEventListener('popstate', () => {
  if (isArRunning) exitArMode();
  if (videoModal.classList.contains('active')) closeVideoModal();
});

// ========================================================
//  UTIL
// ========================================================
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
