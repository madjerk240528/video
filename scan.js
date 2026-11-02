// ========================================================
//  Dedicated Scanner App — scan.js (ES Module)
// ========================================================
import { Compiler } from "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js";

const MAGIC_SIGNATURE = "AR_MAGIC_V1";
const FOOTER_SIZE = 56;

// State
let activePhotoDataUrl = null;
let activeVideoUrl = 'video.mp4'; // fallback to hosted repo video
let compiledTargetUrl = 'targets.mind'; // fallback to precompiled target

let isArRunning = false;
let isArMuted = true;
let arScene = null;
let arAnchor = null;
let arVideo = null;
let arVideoMesh = null;
let textureSyncInterval = null;

// DOM Elements
const btnOpenScanner     = document.getElementById('btn-open-scanner');
const scanDropBox        = document.getElementById('scan-drop-box');
const scanFileInput      = document.getElementById('scan-file-input');
const uploadCard         = document.getElementById('upload-card');
const scannerPlayerCard  = document.getElementById('scanner-player-card');
const scannerTabVideo    = document.getElementById('scanner-tab-video');
const scannerVideoTitle  = document.getElementById('scanner-video-title');
const scannerVideoSub    = document.getElementById('scanner-video-sub');
const btnScanAnother     = document.getElementById('btn-scan-another');
const btnScannerLaunchAr = document.getElementById('btn-scanner-launch-ar');

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

// Check In-App Browser
(function checkInApp() {
  const ua = navigator.userAgent || '';
  if (/(FBAN|FBAV|Instagram|TikTok|MicroMessenger|Line|Twitter|Snapchat)/i.test(ua)) {
    inappBanner && inappBanner.classList.add('active');
  }

  // Check URL parameters for direct autoplay
  const params = new URLSearchParams(window.location.search);
  if (params.has('autoplay') || params.has('lens')) {
    playVideoOnTab('video.mp4', 'Scanned Memory', 'Auto-playing living video');
  }
})();

// ========================================================
//  1. PHOTO UPLOAD & UNPACKING (Playing video from photo)
// ========================================================
scanDropBox.addEventListener('click', () => scanFileInput.click());
scanFileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) handleUploadedPhoto(e.target.files[0]);
});

setupDragDrop(scanDropBox, handleUploadedPhoto);

async function handleUploadedPhoto(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file.');
    return;
  }

  try {
    const extracted = await unpackMagicPhoto(file);

    if (extracted && extracted.videoBlob) {
      // SUCCESS: Embedded video extracted directly from photo!
      activeVideoUrl = URL.createObjectURL(extracted.videoBlob);
      activePhotoDataUrl = await fileToDataUrl(extracted.photoBlob || file);

      // Pre-compile AR target in background for seamless camera scanning
      compileTargetInMemory(activePhotoDataUrl);

      // Play video directly on screen
      playVideoOnTab(activeVideoUrl, file.name, "✨ Embedded video unlocked & playing!");
    } else {
      // Standard image: use paired video
      activePhotoDataUrl = await fileToDataUrl(file);
      compileTargetInMemory(activePhotoDataUrl);
      playVideoOnTab(activeVideoUrl, file.name, "Playing paired video on this photo");
    }
  } catch (err) {
    console.error("Photo processing error:", err);
    alert("Could not process photo: " + err.message);
  }
}

function playVideoOnTab(src, title, subtitle) {
  uploadCard.style.display = 'none';
  scannerPlayerCard.style.display = 'block';

  scannerTabVideo.src = src;
  scannerVideoTitle.textContent = title || "Living Memory";
  scannerVideoSub.textContent = subtitle || "Playing video";

  scannerTabVideo.muted = false;
  scannerTabVideo.play().catch(() => {
    scannerTabVideo.muted = true;
    scannerTabVideo.play().catch(() => {});
  });
}

btnScanAnother.addEventListener('click', () => {
  scannerTabVideo.pause();
  scannerTabVideo.src = '';
  scannerPlayerCard.style.display = 'none';
  uploadCard.style.display = 'block';
  scanFileInput.value = '';
});

// ========================================================
//  2. LIVE AR CAMERA SCANNER
// ========================================================
btnOpenScanner.addEventListener('click', startScannerAR);
btnScannerLaunchAr.addEventListener('click', startScannerAR);

async function startScannerAR() {
  try {
    buildDynamicArScene(compiledTargetUrl, activeVideoUrl);

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

  const cam = document.createElement('a-camera');
  cam.setAttribute('position', '0 0 0');
  cam.setAttribute('look-controls', 'enabled: false');
  scene.appendChild(cam);

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

// Audio controls
function setArAudio(unmute) {
  isArMuted = !unmute;
  if (arVideo) arVideo.muted = isArMuted;
  soundIcon.textContent = isArMuted ? '🔇' : '🔊';
  if (!isArMuted) tapUnmutePill.classList.remove('active');
}

btnToggleSound.addEventListener('click', () => setArAudio(isArMuted));
tapUnmutePill.addEventListener('click', () => setArAudio(true));

// Background compiler helper
async function compileTargetInMemory(dataUrl) {
  try {
    const compiler = new Compiler();
    const img = new Image();
    img.src = dataUrl;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    await compiler.compileImageTargets([img]);
    const buffer = await compiler.exportData();
    compiledTargetUrl = URL.createObjectURL(new Blob([buffer]));
  } catch (e) {
    console.warn("Background target compile note:", e);
  }
}

// Unpack Polyglot Video
async function unpackMagicPhoto(file) {
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength < FOOTER_SIZE + 10) return null;

  const totalLen = buffer.byteLength;
  const footerBuffer = buffer.slice(totalLen - FOOTER_SIZE, totalLen);
  const textDecoder = new TextDecoder('ascii');

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

// Utilities
btnModalCloseGuide.addEventListener('click', () => permissionModal.classList.remove('active'));

function setupDragDrop(elem, fileHandler) {
  elem.addEventListener('dragover', (e) => { e.preventDefault(); elem.classList.add('dragover'); });
  elem.addEventListener('dragleave', () => elem.classList.remove('dragover'));
  elem.addEventListener('drop', (e) => {
    e.preventDefault();
    elem.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files[0]) fileHandler(e.dataTransfer.files[0]);
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
