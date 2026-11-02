// ========================================================
//  Living Memory AR — app.js (ES Module)
//  Option 1: Create AR Photo (Mandatory Photo + Video -> Embed)
//  Option 2: View / Scan (Upload Magic Photo -> Play Video, or Scan AR)
// ========================================================
import { Compiler } from "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js";

// ---- Magic File Format Constants ----
const MAGIC_SIGNATURE = "AR_MAGIC_V1"; // 11 chars + 5 spaces = 16 bytes
const FOOTER_SIZE = 56; // 32 bytes MIME + 8 bytes Length (BigInt) + 16 bytes Signature

// ---- Global State ----
let currentPhotoFile = null;
let currentVideoFile = null;
let currentPhotoDataUrl = null;
let currentVideoObjectUrl = null;

let generatedMagicBlob = null;
let generatedMagicBlobUrl = null;
let compiledMindBuffer = null;
let compiledMindObjectUrl = null;

let isArRunning = false;
let isArMuted = true;
let arScene = null;
let arAnchor = null;
let arVideo = null;
let arVideoMesh = null;
let textureSyncInterval = null;

// ---- DOM Elements ----
// Navigation Tabs
const tabBtnCreate = document.getElementById('tab-btn-create');
const tabBtnView   = document.getElementById('tab-btn-view');
const panelCreate  = document.getElementById('panel-create');
const panelView    = document.getElementById('panel-view');

// Option 1: Create Elements
const createFormView     = document.getElementById('create-form-view');
const createResultView   = document.getElementById('create-result-view');
const createPhotoBox     = document.getElementById('create-photo-box');
const createPhotoInput   = document.getElementById('create-photo-input');
const createPhotoThumb   = document.getElementById('create-photo-thumb');
const createPhotoInfo    = document.getElementById('create-photo-info');

const createVideoBox     = document.getElementById('create-video-box');
const createVideoInput   = document.getElementById('create-video-input');
const createVideoThumb   = document.getElementById('create-video-thumb');
const createVideoInfo    = document.getElementById('create-video-info');

const btnGenerateAr      = document.getElementById('btn-generate-ar');
const generateHint       = document.getElementById('generate-hint');
const chkGoogleLens      = document.getElementById('chk-google-lens');
const lensBanner         = document.getElementById('lens-banner');
const createProgressBox  = document.getElementById('create-progress-box');
const createProgressFill = document.getElementById('create-progress-fill');
const createProgressText = document.getElementById('create-progress-text');

// Result Elements
const resultPhotoImg     = document.getElementById('result-photo-img');
const resultPhotoMeta    = document.getElementById('result-photo-meta');
const btnDownloadResult  = document.getElementById('btn-download-result');
const btnTestResultVideo = document.getElementById('btn-test-result-video');
const btnGotoView        = document.getElementById('btn-goto-view');
const btnCreateReset     = document.getElementById('btn-create-reset');

// Option 2: View / Scan Elements
const viewUploadSection  = document.getElementById('view-upload-section');
const viewDropBox        = document.getElementById('view-drop-box');
const viewFileInput      = document.getElementById('view-file-input');
const viewPlayerSection  = document.getElementById('view-player-section');
const viewTabVideo       = document.getElementById('view-tab-video');
const viewPlayerTitle    = document.getElementById('view-player-title');
const viewPlayerSubtitle = document.getElementById('view-player-subtitle');
const btnViewReset       = document.getElementById('btn-view-reset');
const btnViewLaunchAr    = document.getElementById('btn-view-launch-ar');
const btnStartCameraAr   = document.getElementById('btn-start-camera-ar');

// Video Modal (Testing)
const videoModal         = document.getElementById('video-modal');
const modalVideoPlayer   = document.getElementById('modal-video-player');
const btnCloseModal      = document.getElementById('btn-close-modal');

// AR View Elements
const appContainer       = document.getElementById('app-container');
const arContainer        = document.getElementById('ar-container');
const btnExitAr          = document.getElementById('btn-exit-ar');
const btnToggleSound     = document.getElementById('btn-toggle-sound');
const soundIcon          = document.getElementById('sound-icon');
const tapUnmutePill      = document.getElementById('tap-unmute-pill');
const promptPill         = document.getElementById('prompt-pill');
const promptIcon         = document.getElementById('prompt-icon');
const promptText         = document.getElementById('prompt-text');
const scanLaser          = document.getElementById('scan-laser');
const permissionModal    = document.getElementById('permission-modal');
const btnModalCloseGuide = document.getElementById('btn-modal-close-guide');
const inappBanner        = document.getElementById('inapp-banner');

// ========================================================
//  1. INITIALIZATION & IN-APP BROWSER CHECK
// ========================================================
(function initApp() {
  const ua = navigator.userAgent || '';
  if (/(FBAN|FBAV|Instagram|TikTok|MicroMessenger|Line|Twitter|Snapchat)/i.test(ua)) {
    inappBanner && inappBanner.classList.add('active');
  }

  // Detect Google Lens or Camera QR Scan URL: ?lens=1 or ?autoplay=1
  const params = new URLSearchParams(window.location.search);
  if (params.has('lens') || params.get('autoplay') === '1') {
    if (lensBanner) lensBanner.style.display = 'block';
    // Switch directly to View tab and auto-play video
    switchTab('view');
    const videoSrc = 'video.mp4';
    loadVideoIntoViewPlayer(videoSrc, "Google Lens Scan", "Auto-playing living memory");
  }
})();

// ========================================================
//  2. TAB SWITCHING SYSTEM (Option 1 vs Option 2)
// ========================================================
function switchTab(target) {
  if (target === 'create') {
    tabBtnCreate.classList.add('active');
    tabBtnCreate.setAttribute('aria-selected', 'true');
    tabBtnView.classList.remove('active');
    tabBtnView.setAttribute('aria-selected', 'false');

    panelCreate.classList.add('active');
    panelView.classList.remove('active');
  } else {
    tabBtnView.classList.add('active');
    tabBtnView.setAttribute('aria-selected', 'true');
    tabBtnCreate.classList.remove('active');
    tabBtnCreate.setAttribute('aria-selected', 'false');

    panelView.classList.add('active');
    panelCreate.classList.remove('active');
  }
}

tabBtnCreate && tabBtnCreate.addEventListener('click', () => switchTab('create'));
tabBtnView && tabBtnView.addEventListener('click', () => switchTab('view'));
btnGotoView && btnGotoView.addEventListener('click', () => {
  switchTab('view');
  // If we already have the active video from creation, show it in View player
  if (currentVideoObjectUrl) {
    loadVideoIntoViewPlayer(currentVideoObjectUrl, "Magic Photo Ready", "Playing embedded video");
  }
});

// ========================================================
//  3. OPTION 1: MANDATORY PHOTO & VIDEO UPLOAD
// ========================================================
// Photo Box triggers
createPhotoBox.addEventListener('click', () => createPhotoInput.click());
createPhotoInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) handleCreatePhoto(e.target.files[0]);
});

// Video Box triggers
createVideoBox.addEventListener('click', () => createVideoInput.click());
createVideoInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) handleCreateVideo(e.target.files[0]);
});

// Drag & drop handlers
setupDragDrop(createPhotoBox, handleCreatePhoto);
setupDragDrop(createVideoBox, handleCreateVideo);

async function handleCreatePhoto(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file (JPG or PNG).');
    return;
  }
  currentPhotoFile = file;
  currentPhotoDataUrl = await fileToDataUrl(file);
  createPhotoThumb.src = currentPhotoDataUrl;
  createPhotoInfo.textContent = `${file.name} (${formatBytes(file.size)})`;
  createPhotoBox.classList.add('done');
  updateGenerateButtonState();
}

function handleCreateVideo(file) {
  if (!file.type.startsWith('video/')) {
    alert('Please select a valid video file (MP4, MOV, WebM).');
    return;
  }
  currentVideoFile = file;
  if (currentVideoObjectUrl) URL.revokeObjectURL(currentVideoObjectUrl);
  currentVideoObjectUrl = URL.createObjectURL(file);
  createVideoThumb.src = currentVideoObjectUrl;
  createVideoInfo.textContent = `${file.name} (${formatBytes(file.size)})`;
  createVideoBox.classList.add('done');
  updateGenerateButtonState();
}

function updateGenerateButtonState() {
  const isReady = !!(currentPhotoFile && currentVideoFile);
  btnGenerateAr.disabled = !isReady;
  if (isReady) {
    generateHint.textContent = "✓ Ready! Tap 'Generate AR Photo' to embed your video into this photo.";
    generateHint.style.color = "var(--gold-vivid)";
  } else {
    generateHint.textContent = "* Both Photo and Video are mandatory before generating.";
    generateHint.style.color = "var(--text-muted)";
  }
}

// ========================================================
//  4. GENERATE AR PHOTO (Compile MindAR + Embed Video)
// ========================================================
btnGenerateAr.addEventListener('click', generateARPhoto);

async function generateARPhoto() {
  if (!currentPhotoFile || !currentVideoFile) {
    alert('Both Photo and Video are mandatory.');
    return;
  }

  btnGenerateAr.disabled = true;
  createProgressBox.classList.add('active');
  createProgressFill.style.width = '10%';
  createProgressText.textContent = 'Preparing photo for AR tracking...';

  try {
    // 1. Compile 100% clean photo for MindAR tracking
    createProgressText.textContent = 'Compiling 3D AR tracking features... (Step 1/2)';
    const compiler = new Compiler();
    const imgElement = new Image();
    imgElement.src = currentPhotoDataUrl;
    await new Promise((resolve, reject) => {
      imgElement.onload = resolve;
      imgElement.onerror = reject;
    });

    await compiler.compileImageTargets([imgElement], (pct) => {
      const scaledPct = Math.round(15 + (pct * 0.65)); // 15% to 80%
      createProgressFill.style.width = `${scaledPct}%`;
      createProgressText.textContent = `Compiling AR tracking features: ${Math.round(pct)}%`;
    });

    compiledMindBuffer = await compiler.exportData();
    if (compiledMindObjectUrl) URL.revokeObjectURL(compiledMindObjectUrl);
    compiledMindObjectUrl = URL.createObjectURL(new Blob([compiledMindBuffer]));

    // 2. Embed video binary directly into photo file
    createProgressFill.style.width = '85%';
    createProgressText.textContent = 'Embedding video data inside photo... (Step 2/2)';

    generatedMagicBlob = await packMagicPhoto(currentPhotoFile, currentVideoFile);
    if (generatedMagicBlobUrl) URL.revokeObjectURL(generatedMagicBlobUrl);
    generatedMagicBlobUrl = URL.createObjectURL(generatedMagicBlob);

    createProgressFill.style.width = '100%';
    createProgressText.textContent = '✅ Magic AR Photo Complete!';

    // Brief delay for smooth UI feedback then transition to Result
    setTimeout(() => {
      showResultView(imgElement, currentPhotoDataUrl);
    }, 600);

  } catch (err) {
    console.error('AR Generation failed:', err);
    alert('Processing failed: ' + (err.message || err));
    createProgressText.textContent = '⚠️ Failed. Try a standard JPG/PNG photo with good contrast.';
    btnGenerateAr.disabled = false;
  }
}

function showResultView(imgElement, displayPhotoUrl) {
  createFormView.style.display = 'none';
  createResultView.style.display = 'block';

  // Display result photo
  resultPhotoImg.src = displayPhotoUrl || currentPhotoDataUrl;
  const isPortrait = imgElement.naturalHeight >= imgElement.naturalWidth;
  resultPhotoMeta.textContent = `${imgElement.naturalWidth}×${imgElement.naturalHeight} • ${isPortrait ? 'Portrait' : 'Landscape'} • Video Inside: ${formatBytes(currentVideoFile.size)}`;

  // Set download button
  btnDownloadResult.href = generatedMagicBlobUrl;
  btnDownloadResult.download = `MagicPhoto_${Date.now()}.png`;
}

// Reset creation to make another AR photo
btnCreateReset.addEventListener('click', () => {
  createResultView.style.display = 'none';
  createFormView.style.display = 'block';
  createProgressBox.classList.remove('active');
  createProgressFill.style.width = '0%';

  currentPhotoFile = null;
  currentVideoFile = null;
  createPhotoBox.classList.remove('done');
  createVideoBox.classList.remove('done');
  createPhotoThumb.src = '';
  createVideoThumb.src = '';
  createPhotoInput.value = '';
  createVideoInput.value = '';
  createPhotoInfo.textContent = '';
  createVideoInfo.textContent = '';
  updateGenerateButtonState();
});

// Test play video from result view
btnTestResultVideo.addEventListener('click', () => {
  if (!currentVideoObjectUrl) return;
  modalVideoPlayer.src = currentVideoObjectUrl;
  videoModal.classList.add('active');
  modalVideoPlayer.play().catch(() => {});
});

// ========================================================
//  5. OPTION 2: VIEW / SCAN AR PHOTO (Plays Video On Tab!)
// ========================================================
viewDropBox.addEventListener('click', () => viewFileInput.click());
viewFileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) handleViewPhotoUpload(e.target.files[0]);
});

setupDragDrop(viewDropBox, handleViewPhotoUpload);

async function handleViewPhotoUpload(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file.');
    return;
  }

  try {
    // Read file and extract embedded video
    const extracted = await unpackMagicPhoto(file);

    if (extracted && extracted.videoBlob) {
      // SUCCESS: Embedded video found!
      if (currentVideoObjectUrl) URL.revokeObjectURL(currentVideoObjectUrl);
      currentVideoObjectUrl = URL.createObjectURL(extracted.videoBlob);

      // Save photo for AR tracking
      currentPhotoDataUrl = await fileToDataUrl(extracted.photoBlob || file);

      // Start compiling AR target in background for seamless camera scanning
      compileTargetInMemory(currentPhotoDataUrl);

      // PLAY VIDEO DIRECTLY ON THIS TAB (User's explicit requirement!)
      loadVideoIntoViewPlayer(currentVideoObjectUrl, file.name, "✨ Embedded video detected & playing!");
    } else {
      // Standard image without embedded video
      const photoUrl = await fileToDataUrl(file);
      currentPhotoDataUrl = photoUrl;
      compileTargetInMemory(photoUrl);

      if (currentVideoObjectUrl) {
        // We have an active video from the current session
        loadVideoIntoViewPlayer(currentVideoObjectUrl, file.name, "Playing paired video on this photo");
      } else {
        alert("This photo does not contain an embedded video. You can create one in the 'Create AR Photo' tab, or point your camera at it to scan!");
      }
    }
  } catch (err) {
    console.error("View file processing error:", err);
    alert("Could not process photo: " + err.message);
  }
}

function loadVideoIntoViewPlayer(videoSrc, title, subtitle) {
  viewUploadSection.style.display = 'none';
  viewPlayerSection.style.display = 'block';

  viewTabVideo.src = videoSrc;
  viewPlayerTitle.textContent = title || "Living Memory";
  viewPlayerSubtitle.textContent = subtitle || "Playing embedded video";

  viewTabVideo.muted = false; // Unmuted playback
  viewTabVideo.play().catch(() => {
    // Autoplay policy fallback: mute and prompt user
    viewTabVideo.muted = true;
    viewTabVideo.play().catch(() => {});
  });
}

btnViewReset.addEventListener('click', () => {
  viewTabVideo.pause();
  viewTabVideo.src = '';
  viewPlayerSection.style.display = 'none';
  viewUploadSection.style.display = 'block';
  viewFileInput.value = '';
});

// Launch AR from View Tab
btnViewLaunchAr.addEventListener('click', startLiveAR);
btnStartCameraAr.addEventListener('click', startLiveAR);

// ========================================================
//  6. LIVE AR SCANNER (Camera + MindAR + 3D Video)
// ========================================================
async function startLiveAR() {
  if (!compiledMindObjectUrl && currentPhotoDataUrl) {
    // If not yet compiled, compile now
    promptText.textContent = "Preparing AR camera...";
    await compileTargetInMemory(currentPhotoDataUrl);
  }

  // Fallback if still no target: use default targets.mind if present
  const targetUrl = compiledMindObjectUrl || 'targets.mind';
  const videoSrc  = currentVideoObjectUrl || 'video.mp4';

  try {
    buildDynamicArScene(targetUrl, videoSrc);

    appContainer.style.display = 'none';
    arContainer.classList.add('active');
    isArRunning = true;

    const scene = document.getElementById('ar-scene');
    const startTracking = async () => {
      arScene = scene;
      arAnchor = document.getElementById('ar-anchor');
      arVideo = document.getElementById('ar-video-asset');
      arVideoMesh = document.getElementById('ar-video-mesh');

      // Audio unlock gesture
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

function buildDynamicArScene(targetSrc, videoSrc) {
  const old = document.getElementById('ar-scene');
  if (old) old.remove();

  const scene = document.createElement('a-scene');
  scene.id = 'ar-scene';
  scene.setAttribute('mindar-image',
    `imageTargetSrc: ${targetSrc}; autoStart: false; uiLoading: no; uiScanning: no;`);
  scene.setAttribute('color-space', 'sRGB');
  scene.setAttribute('embedded', '');
  scene.setAttribute('renderer', 'colorManagement: true, physicallyCorrectLights');
  scene.setAttribute('vr-mode-ui', 'enabled: false');
  scene.setAttribute('device-orientation-permission-ui', 'enabled: false');

  // Video Asset
  const assets = document.createElement('a-assets');
  const vid = document.createElement('video');
  vid.id = 'ar-video-asset';
  vid.src = videoSrc;
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

  // Anchor & Video Mesh
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

  arContainer.insertBefore(scene, arContainer.firstChild);
}

function registerAnchorEvents() {
  arVideo.addEventListener('loadedmetadata', adjustVideoMesh);

  arAnchor.addEventListener('targetFound', () => {
    arVideo.muted = isArMuted;
    arVideo.play().catch(() => {});
    promptPill.classList.add('target-detected');
    promptIcon.textContent = '✨';
    promptText.textContent = 'Memory Playing!';
    scanLaser.style.display = 'none';
    if (isArMuted) tapUnmutePill.classList.add('active');
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

btnExitAr.addEventListener('click', exitArMode);

// Audio Controls
function setArAudio(unmute) {
  isArMuted = !unmute;
  if (arVideo) arVideo.muted = isArMuted;
  soundIcon.textContent = isArMuted ? '🔇' : '🔊';
  if (!isArMuted) tapUnmutePill.classList.remove('active');
}

btnToggleSound.addEventListener('click', () => setArAudio(isArMuted));
tapUnmutePill.addEventListener('click', () => setArAudio(true));

// Helper: compile AR target in background
async function compileTargetInMemory(dataUrl) {
  try {
    const compiler = new Compiler();
    const img = new Image();
    img.src = dataUrl;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    await compiler.compileImageTargets([img]);
    compiledMindBuffer = await compiler.exportData();
    if (compiledMindObjectUrl) URL.revokeObjectURL(compiledMindObjectUrl);
    compiledMindObjectUrl = URL.createObjectURL(new Blob([compiledMindBuffer]));
  } catch (e) {
    console.warn("Background target compile note:", e);
  }
}

// ========================================================
//  7. BINARY EMBEDDING / EXTRACTION ENGINE (Polyglot)
// ========================================================
/**
 * Embeds video data at the end of the photo file.
 * Structure: [ Photo Bytes ] + [ Video Bytes ] + [ 32B MIME ] + [ 8B Video Len ] + [ 16B Signature ]
 */
async function packMagicPhoto(photoFile, videoFile) {
  const photoBuffer = await photoFile.arrayBuffer();
  const videoBuffer = await videoFile.arrayBuffer();

  const videoLen = videoBuffer.byteLength;
  const mimeStr  = (videoFile.type || 'video/mp4').padEnd(32, ' ');
  const sigStr   = MAGIC_SIGNATURE.padEnd(16, ' ');

  const footer = new Uint8Array(FOOTER_SIZE);
  const textEncoder = new TextEncoder();

  // 1. Write MIME (32 bytes)
  footer.set(textEncoder.encode(mimeStr).subarray(0, 32), 0);

  // 2. Write 8-byte BigInt video length
  const view = new DataView(footer.buffer);
  view.setBigUint64(32, BigInt(videoLen), false); // Big-Endian

  // 3. Write Signature (16 bytes)
  footer.set(textEncoder.encode(sigStr).subarray(0, 16), 40);

  // Combine into single PNG Blob
  return new Blob([photoBuffer, videoBuffer, footer], { type: 'image/png' });
}

/**
 * Reads any uploaded photo file and checks for embedded video data.
 */
async function unpackMagicPhoto(file) {
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength < FOOTER_SIZE + 10) return null;

  const totalLen = buffer.byteLength;
  const footerBuffer = buffer.slice(totalLen - FOOTER_SIZE, totalLen);
  const textDecoder = new TextDecoder('ascii');

  // Check signature at bytes 40..56 of footer
  const sig = textDecoder.decode(footerBuffer.slice(40, 56)).trim();
  if (sig === MAGIC_SIGNATURE) {
    const mime = textDecoder.decode(footerBuffer.slice(0, 32)).trim();
    const view = new DataView(footerBuffer);
    const videoLen = Number(view.getBigUint64(32, false));

    if (videoLen > 0 && totalLen >= FOOTER_SIZE + videoLen) {
      const videoStart = totalLen - FOOTER_SIZE - videoLen;
      const videoBytes = buffer.slice(videoStart, totalLen - FOOTER_SIZE);
      const photoBytes = buffer.slice(0, videoStart);

      return {
        photoBlob: new Blob([photoBytes], { type: 'image/png' }),
        videoBlob: new Blob([videoBytes], { type: mime || 'video/mp4' })
      };
    }
  }

  return null;
}

// ========================================================
//  8. MODALS & UTILITY FUNCTIONS
// ========================================================
btnCloseModal.addEventListener('click', () => {
  videoModal.classList.remove('active');
  modalVideoPlayer.pause();
});
videoModal.addEventListener('click', (e) => {
  if (e.target === videoModal) {
    videoModal.classList.remove('active');
    modalVideoPlayer.pause();
  }
});

btnModalCloseGuide.addEventListener('click', () => {
  permissionModal.classList.remove('active');
});

function setupDragDrop(elem, fileHandler) {
  elem.addEventListener('dragover', (e) => {
    e.preventDefault();
    elem.classList.add('dragover');
  });
  elem.addEventListener('dragleave', () => elem.classList.remove('dragover'));
  elem.addEventListener('drop', (e) => {
    e.preventDefault();
    elem.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files[0]) {
      fileHandler(e.dataTransfer.files[0]);
    }
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
