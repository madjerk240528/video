// ========================================================
//  Dedicated Scanner App — scan.js (ES Module) — v3
//  Supports:
//  1. URL parameters (?v=... &img=...) from QR scans
//  2. Google Drive, Dropbox, and direct cloud video streaming
//  3. Clean MindAR 3D AR camera tracking with alpha transparency
//  4. Magic Photo upload & embedded/linked video extraction
// ========================================================
import { Compiler } from "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js";
import { getMediaInfo, resolveCloudVideoUrl, resolveCloudImageUrl } from "./cloud-storage.js";

// ---- Magic Photo Format Constants ----
const MAGIC_SIGNATURE_V1  = "AR_MAGIC_V1";
const MAGIC_SIGNATURE_URL = "AR_URL_V1";
const FOOTER_SIZE = 56;

// ---- State ----
let activePhotoDataUrl  = null;
let activeVideoUrl      = null;   // Resolved streamable video URL
let compiledTargetUrl   = null;   // Blob URL or static path of .mind target
let isCompiling         = false;
let compileDone         = false;

let isArRunning         = false;
let isArMuted           = true;
let isCurrentArGoogleDrive = false;
let arScene             = null;
let arAnchor            = null;
let arVideo             = null;
let arVideoMesh         = null;
let textureSyncInterval = null;

// ---- DOM Elements ----
const btnOpenScanner     = document.getElementById('btn-open-scanner');
const scanDropBox        = document.getElementById('scan-drop-box');
const scanFileInput      = document.getElementById('scan-file-input');
const uploadCard         = document.getElementById('upload-card');
const scannerPlayerCard  = document.getElementById('scanner-player-card');
const scannerTabVideo    = document.getElementById('scanner-tab-video');
const scannerTabIframe   = document.getElementById('scanner-tab-iframe');
const scannerVideoTitle  = document.getElementById('scanner-video-title');
const scannerVideoSub    = document.getElementById('scanner-video-sub');
const btnScanAnother     = document.getElementById('btn-scan-another');

const compileStatusBox   = document.getElementById('compile-status-box');
const compileStatusText  = document.getElementById('compile-status-text');
const compileFill        = document.getElementById('compile-fill');

const appContainer       = document.getElementById('app-container');
const arContainer        = document.getElementById('ar-container');
const arGdriveCinema     = document.getElementById('ar-gdrive-cinema');
const arGdriveIframe     = document.getElementById('ar-gdrive-iframe');
const btnCloseGdriveCinema = document.getElementById('btn-close-gdrive-cinema');
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

const btnInstallApp      = document.getElementById('btn-install-app');
const installBtnText     = document.getElementById('install-btn-text');
const installStatusMsg   = document.getElementById('install-status-msg');
const iosInstallModal    = document.getElementById('ios-install-modal');
const btnCloseIosModal   = document.getElementById('btn-close-ios-modal');

const btnSampleDemo      = document.getElementById('btn-sample-demo');
const pasteLinkInput     = document.getElementById('paste-video-link');
const btnLoadPastedLink  = document.getElementById('btn-load-pasted-link');

// All Launch AR buttons in the DOM
function getLaunchArBtns() {
  return document.querySelectorAll('#btn-scanner-launch-ar, .btn-launch-ar, #btn-open-scanner');
}

// ========================================================
//  PWA / SERVICE WORKER
// ========================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.log('ServiceWorker note:', err);
    });
  });
}

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (installBtnText) installBtnText.textContent = '📲 Install App (Home & Apps Menu)';
});

const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone === true;
if (isStandalone) {
  if (installBtnText) installBtnText.textContent = '✅ App Installed';
  if (btnInstallApp) btnInstallApp.disabled = true;
  if (installStatusMsg) {
    installStatusMsg.style.display = 'block';
    installStatusMsg.textContent = '✅ Running as installed app!';
  }
}

btnInstallApp && btnInstallApp.addEventListener('click', async () => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      if (installStatusMsg) installStatusMsg.style.display = 'block';
      if (btnInstallApp) btnInstallApp.style.display = 'none';
    }
    deferredInstallPrompt = null;
  } else if (isIOS) {
    if (iosInstallModal) iosInstallModal.classList.add('active');
  } else {
    alert("To install, tap the install icon in your browser's address bar or menu!");
  }
});

btnCloseIosModal && btnCloseIosModal.addEventListener('click', () => {
  if (iosInstallModal) iosInstallModal.classList.remove('active');
});

// Pre-configured memories mapping: Target Index -> Custom Video URL
// The visual features of the photo ITSELF are the identity! No visible QR code needed on the photo.
const BUILTIN_MEMORIES = {
  0: "https://drive.usercontent.google.com/download?id=1CoO8sJs_dJHtM2lVsv6ugVpYqgRSn6mt&export=download&authuser=0"
};

// ========================================================
//  INITIALIZATION & URL PARAMETER PARSER (?v=... &img=...)
// ========================================================
(async function initScanner() {
  const ua = navigator.userAgent || '';
  if (/(FBAN|FBAV|Instagram|TikTok|MicroMessenger|Line|Twitter|Snapchat)/i.test(ua)) {
    inappBanner && inappBanner.classList.add('active');
  }

  // Check URL parameters from QR scan
  const params = new URLSearchParams(window.location.search);
  const rawVideoParam = params.get('v') || params.get('video');
  const rawImageParam = params.get('img') || params.get('photo') || params.get('target');

  // Load photo-to-video mapping from memories.json or built-in registry
  let activeCustomVideo = null;
  try {
    const memResp = await fetch('memories.json?' + Date.now());
    if (memResp.ok) {
      const memData = await memResp.json();
      if (memData && memData['0'] && memData['0'].videoUrl) {
        activeCustomVideo = memData['0'].videoUrl;
      }
    }
  } catch (e) {}

  if (!activeCustomVideo && BUILTIN_MEMORIES[0]) {
    activeCustomVideo = BUILTIN_MEMORIES[0];
  }

  try {
    const saved = localStorage.getItem('ar_active_video');
    if (saved) activeCustomVideo = saved;
  } catch (e) {}

  if (rawVideoParam) {
    // URL contains custom video parameter
    const resolvedVideo = resolveCloudVideoUrl(rawVideoParam);
    activeVideoUrl = resolvedVideo;

    showVideoPlayer(
      resolvedVideo,
      "✨ Linked Memory Video",
      "Playing custom video from scanned link"
    );

    if (rawImageParam) {
      const resolvedImg = resolveCloudImageUrl(rawImageParam);
      activePhotoDataUrl = resolvedImg;
      await startCompileTargets(resolvedImg);
    } else {
      compiledTargetUrl = 'targets.mind';
      compileDone = true;
      updateScanButtonState();
    }
  } else if (activeCustomVideo) {
    // Photo's visual identity matched from memories registry (No QR code needed!)
    activeVideoUrl = activeCustomVideo;
    compiledTargetUrl = 'targets.mind';
    compileDone = true;
    updateScanButtonState();
  } else {
    // Fall back to sample flower video if no paired video exists
    activeVideoUrl = 'video.mp4';
    compiledTargetUrl = 'targets.mind';
    compileDone = true;
    updateScanButtonState();
  }
})();

// ========================================================
//  COMPILE STATE MANAGEMENT
// ========================================================
function updateScanButtonState() {
  const btns = getLaunchArBtns();
  btns.forEach((btn) => {
    const labelSpan = btn.querySelector('span:last-child') || btn;
    if (isCompiling) {
      btn.disabled = true;
      labelSpan.textContent = 'Compiling AR Tracking... Please Wait';
      if (compileStatusBox) compileStatusBox.style.display = 'block';
    } else if (compileDone) {
      btn.disabled = false;
      labelSpan.textContent = 'Point Camera & Scan in 3D AR';
      if (compileStatusBox) compileStatusBox.style.display = 'none';
    } else {
      btn.disabled = false;
      labelSpan.textContent = 'Open Camera Scanner';
      if (compileStatusBox) compileStatusBox.style.display = 'none';
    }
  });
}

// ========================================================
//  PASTE VIDEO LINK HANDLER (GOOGLE DRIVE / DIRECT LINK)
// ========================================================
btnLoadPastedLink && btnLoadPastedLink.addEventListener('click', () => {
  const raw = pasteLinkInput ? pasteLinkInput.value.trim() : '';
  if (!raw) {
    alert('Please paste a Google Drive or video URL.');
    return;
  }

  const media = getMediaInfo(raw);
  if (!media) {
    alert('Could not recognize this URL format.');
    return;
  }

  activeVideoUrl = raw;
  compiledTargetUrl = compiledTargetUrl || 'targets.mind';
  compileDone = true;

  showVideoPlayer(raw, media.isGoogleDrive ? '☁️ Google Drive Video' : '☁️ Cloud Video Loaded', 'Playing from linked URL');
  updateScanButtonState();
});

// ========================================================
//  PHOTO UPLOAD — MAGIC PHOTO OR REGULAR PHOTO
// ========================================================
scanDropBox && scanDropBox.addEventListener('click', () => scanFileInput && scanFileInput.click());
scanFileInput && scanFileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) handlePhotoUpload(e.target.files[0]);
});

setupDragDrop(scanDropBox, handlePhotoUpload);

async function handlePhotoUpload(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file.');
    return;
  }

  compileDone = false;
  activePhotoDataUrl = null;
  activeVideoUrl = null;
  compiledTargetUrl = null;
  updateScanButtonState();

  try {
    const extracted = await unpackMagicPhoto(file);

    if (extracted) {
      if (extracted.videoBlob) {
        activeVideoUrl = URL.createObjectURL(extracted.videoBlob);
        activePhotoDataUrl = await fileToDataUrl(extracted.photoBlob || file);
        showVideoPlayer(activeVideoUrl, file.name, '✨ Embedded video detected!');
      } else if (extracted.videoUrl) {
        const streamUrl = resolveCloudVideoUrl(extracted.videoUrl);
        activeVideoUrl = streamUrl;
        activePhotoDataUrl = await fileToDataUrl(extracted.photoBlob || file);
        showVideoPlayer(activeVideoUrl, file.name, '☁️ Linked cloud video detected!');
      }
    } else {
      activePhotoDataUrl = await fileToDataUrl(file);
      activeVideoUrl = activeVideoUrl || 'video.mp4';
      showVideoPlayer(activeVideoUrl, file.name, '📷 Photo loaded — camera scan ready');
    }

    await startCompileTargets(activePhotoDataUrl);

  } catch (err) {
    console.error('Photo upload error:', err);
    alert('Could not process photo: ' + err.message);
  }
}

function showVideoPlayer(videoSrc, title, subtitle) {
  if (uploadCard) uploadCard.style.display = 'none';
  if (scannerPlayerCard) scannerPlayerCard.style.display = 'block';
  if (scannerVideoTitle) scannerVideoTitle.textContent = title || 'Living Memory';
  if (scannerVideoSub) scannerVideoSub.textContent = subtitle || '';

  const media = getMediaInfo(videoSrc);
  if (media && media.isGoogleDrive) {
    if (scannerTabVideo) {
      scannerTabVideo.pause();
      scannerTabVideo.style.display = 'none';
    }
    if (scannerTabIframe) {
      scannerTabIframe.src = media.embedUrl;
      scannerTabIframe.style.display = 'block';
    }
  } else {
    if (scannerTabIframe) {
      scannerTabIframe.src = '';
      scannerTabIframe.style.display = 'none';
    }
    if (scannerTabVideo) {
      scannerTabVideo.style.display = 'block';
      scannerTabVideo.src = (media ? media.streamUrl : videoSrc);
      scannerTabVideo.crossOrigin = 'anonymous';
      scannerTabVideo.muted = false;
      scannerTabVideo.play().catch(() => {
        scannerTabVideo.muted = true;
        scannerTabVideo.play().catch(() => {});
      });
    }
  }
}

btnScanAnother && btnScanAnother.addEventListener('click', () => {
  if (scannerTabVideo) { scannerTabVideo.pause(); scannerTabVideo.src = ''; }
  if (scannerTabIframe) { scannerTabIframe.src = ''; }
  if (scannerPlayerCard) scannerPlayerCard.style.display = 'none';
  if (uploadCard) uploadCard.style.display = 'block';
  if (scanFileInput) scanFileInput.value = '';
  compileDone = false;
  activePhotoDataUrl = null;
  activeVideoUrl = null;
  compiledTargetUrl = null;
  updateScanButtonState();
});

// ========================================================
//  AR TARGET COMPILER
// ========================================================
async function startCompileTargets(photoDataUrl) {
  isCompiling = true;
  compileDone = false;
  updateScanButtonState();

  if (compileFill) compileFill.style.width = '10%';
  if (compileStatusText) compileStatusText.textContent = 'Analyzing photo for 3D tracking...';

  try {
    const compiler = new Compiler();
    const img = new Image();
    img.src = photoDataUrl;
    img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

    if (compileFill) compileFill.style.width = '25%';
    if (compileStatusText) compileStatusText.textContent = 'Compiling AR tracking features...';

    await compiler.compileImageTargets([img], (pct) => {
      const w = Math.round(25 + pct * 0.7);
      if (compileFill) compileFill.style.width = `${w}%`;
      if (compileStatusText) compileStatusText.textContent = `Compiling AR features: ${Math.round(pct)}%`;
    });

    const buffer = await compiler.exportData();
    if (compiledTargetUrl && compiledTargetUrl.startsWith('blob:')) {
      URL.revokeObjectURL(compiledTargetUrl);
    }
    compiledTargetUrl = URL.createObjectURL(new Blob([buffer]));

    if (compileFill) compileFill.style.width = '100%';
    if (compileStatusText) compileStatusText.textContent = '✅ AR tracking ready! Tap "Point Camera & Scan".';

    compileDone = true;
    isCompiling = false;
    updateScanButtonState();

  } catch (err) {
    console.warn('Compile note, using fallback targets.mind:', err);
    compiledTargetUrl = 'targets.mind';
    compileDone = true;
    isCompiling = false;
    updateScanButtonState();
  }
}

// ========================================================
//  SAMPLE DEMO BUTTON
// ========================================================
btnSampleDemo && btnSampleDemo.addEventListener('click', async () => {
  activeVideoUrl = 'video.mp4';
  compiledTargetUrl = 'targets.mind';
  compileDone = true;

  showVideoPlayer('video.mp4', 'Sample Living Photo', '🎬 Point camera at photo.jpg');
  updateScanButtonState();
});

// ========================================================
//  CAMERA AR LAUNCHER — PROPER A-FRAME TRANSPARENCY
// ========================================================
document.addEventListener('click', (e) => {
  const target = e.target.closest('#btn-scanner-launch-ar, .btn-launch-ar, #btn-open-scanner');
  if (target) {
    e.preventDefault();
    startLiveAR();
  }
});

async function startLiveAR() {
  if (isCompiling) {
    alert('Please wait — AR tracking compilation is in progress...');
    return;
  }

  const targetUrl = compiledTargetUrl || 'targets.mind';
  const videoSrc  = activeVideoUrl || 'video.mp4';

  try {
    buildDynamicArScene(targetUrl, videoSrc);

    appContainer.style.display = 'none';
    arContainer.classList.add('active');
    isArRunning = true;

    const scene = document.getElementById('ar-scene');

    const startTracking = async () => {
      arScene     = scene;
      arAnchor    = document.getElementById('ar-anchor');
      arVideo     = document.getElementById('ar-video-asset');
      arVideoMesh = document.getElementById('ar-video-mesh');

      // Pre-warm video and unlock audio context
      if (arVideo) {
        arVideo.muted = true;
        arVideo.play().then(() => { arVideo.pause(); arVideo.currentTime = 0; }).catch(() => {});
      }

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
    console.error('AR camera start error:', err);
    exitArMode();
    if (permissionModal) permissionModal.classList.add('active');
  }
}

// ========================================================
//  BUILD DYNAMIC AR SCENE WITH TRANSPARENT CANVAS
// ========================================================
function buildDynamicArScene(targetSrc, videoSrc) {
  const old = document.getElementById('ar-scene');
  if (old) old.remove();

  const media = getMediaInfo(videoSrc);
  isCurrentArGoogleDrive = !!(media && media.isGoogleDrive);

  if (isCurrentArGoogleDrive && arGdriveIframe) {
    arGdriveIframe.src = media.embedUrl;
  }

  const scene = document.createElement('a-scene');
  scene.id = 'ar-scene';
  // Crucial: MindAR image configuration + transparent renderer
  scene.setAttribute('mindar-image',
    `imageTargetSrc: ${targetSrc}; autoStart: false; uiLoading: no; uiScanning: no; filterMinCF: 0.0001; filterBeta: 0.001; missTolerance: 5;`);
  scene.setAttribute('color-space', 'sRGB');
  scene.setAttribute('renderer', 'colorManagement: true; physicallyCorrectLights: true; alpha: true;');
  scene.setAttribute('vr-mode-ui', 'enabled: false');
  scene.setAttribute('device-orientation-permission-ui', 'enabled: false');

  // Video Asset Element (the 3D AR video texture)
  const assets = document.createElement('a-assets');
  const vid = document.createElement('video');
  vid.id = 'ar-video-asset';
  vid.src = (media && media.streamUrl) ? media.streamUrl : videoSrc;
  vid.crossOrigin = 'anonymous';
  vid.setAttribute('preload', 'auto');
  vid.setAttribute('playsinline', '');
  vid.setAttribute('webkit-playsinline', '');
  vid.setAttribute('muted', '');
  vid.setAttribute('loop', '');
  vid.onerror = () => {
    console.warn('Custom video error or network blocked, falling back to sample flower video.');
    if (vid.src !== 'video.mp4') {
      vid.src = 'video.mp4';
      vid.play().catch(() => {});
    }
  };
  assets.appendChild(vid);
  scene.appendChild(assets);

  // Camera
  const cam = document.createElement('a-camera');
  cam.setAttribute('position', '0 0 0');
  cam.setAttribute('look-controls', 'enabled: false');
  scene.appendChild(cam);

  // Target Anchor Entity (Tracks the physical photo in 3D space)
  const anchor = document.createElement('a-entity');
  anchor.id = 'ar-anchor';
  anchor.setAttribute('mindar-image-target', 'targetIndex: 0');

  // Video Plane in 3D AR ("VR Hold" Screen)
  const mesh = document.createElement('a-plane');
  mesh.id = 'ar-video-mesh';
  mesh.setAttribute('src', '#ar-video-asset');
  mesh.setAttribute('position', '0 0 0');
  mesh.setAttribute('width', '1');
  mesh.setAttribute('height', '1');
  mesh.setAttribute('rotation', '0 0 0');
  mesh.setAttribute('material', 'shader: flat; transparent: true;');
  anchor.appendChild(mesh);
  scene.appendChild(anchor);

  arContainer.insertBefore(scene, arContainer.firstChild);
}

function registerAnchorEvents() {
  if (!arAnchor) return;
  if (arVideo) {
    arVideo.addEventListener('loadedmetadata', adjustVideoMesh);
  }

  arAnchor.addEventListener('targetFound', () => {
    if (arVideo) {
      arVideo.muted = isArMuted;
      arVideo.play().catch(() => {});
      adjustVideoMesh();
    }
    if (promptPill) promptPill.classList.add('target-detected');
    if (promptIcon) promptIcon.textContent = '✨';
    if (promptText) promptText.textContent = 'Memory Playing!';
    if (scanLaser) scanLaser.style.display = 'none';
    if (isArMuted && tapUnmutePill) tapUnmutePill.classList.add('active');
  });

  arAnchor.addEventListener('targetLost', () => {
    if (arVideo) {
      arVideo.pause();
    }
    if (promptPill) promptPill.classList.remove('target-detected');
    if (promptIcon) promptIcon.textContent = '🔍';
    if (promptText) promptText.textContent = 'Point camera at the photo';
    if (scanLaser) scanLaser.style.display = 'block';
    if (tapUnmutePill) tapUnmutePill.classList.remove('active');
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
  if (arGdriveCinema) arGdriveCinema.classList.remove('active');
  if (arGdriveIframe) arGdriveIframe.src = '';
  if (tapUnmutePill) tapUnmutePill.classList.remove('active');

  if (arScene) {
    const sys = arScene.systems['mindar-image-system'];
    if (sys && sys.stop) { try { sys.stop(); } catch (e) {} }
  }

  arContainer.classList.remove('active');
  appContainer.style.display = 'flex';
  isArRunning = false;
}

btnExitAr && btnExitAr.addEventListener('click', exitArMode);

function setArAudio(unmute) {
  isArMuted = !unmute;
  if (arVideo) arVideo.muted = isArMuted;
  if (soundIcon) soundIcon.textContent = isArMuted ? '🔇' : '🔊';
  if (!isArMuted && tapUnmutePill) tapUnmutePill.classList.remove('active');
}

btnToggleSound && btnToggleSound.addEventListener('click', () => setArAudio(isArMuted));
tapUnmutePill && tapUnmutePill.addEventListener('click', () => setArAudio(true));

btnModalCloseGuide && btnModalCloseGuide.addEventListener('click', () => {
  if (permissionModal) permissionModal.classList.remove('active');
});

// ========================================================
//  MAGIC PHOTO UNPACK (V1 BINARY + V2 URL)
// ========================================================
async function unpackMagicPhoto(file) {
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength < FOOTER_SIZE + 10) return null;

  const totalLen = buffer.byteLength;
  const footerBuffer = buffer.slice(totalLen - FOOTER_SIZE, totalLen);
  const textDecoder = new TextDecoder('ascii');

  const sig  = textDecoder.decode(footerBuffer.slice(40, 56)).trim();
  const mime = textDecoder.decode(footerBuffer.slice(0, 32)).trim();
  const view = new DataView(footerBuffer);
  const dataLen = Number(view.getBigUint64(32, false));

  if (dataLen > 0 && totalLen >= FOOTER_SIZE + dataLen) {
    const dataStart = totalLen - FOOTER_SIZE - dataLen;
    const dataBytes = buffer.slice(dataStart, totalLen - FOOTER_SIZE);
    const photoBytes = buffer.slice(0, dataStart);

    if (sig === MAGIC_SIGNATURE_V1) {
      return {
        photoBlob: new Blob([photoBytes], { type: 'image/png' }),
        videoBlob: new Blob([dataBytes], { type: mime || 'video/mp4' }),
        videoUrl: null
      };
    }

    if (sig === MAGIC_SIGNATURE_URL) {
      const videoUrl = new TextDecoder('utf-8').decode(dataBytes).trim();
      return {
        photoBlob: new Blob([photoBytes], { type: 'image/jpeg' }),
        videoBlob: null,
        videoUrl: videoUrl
      };
    }
  }

  return null;
}

// Utilities
function setupDragDrop(elem, fileHandler) {
  if (!elem) return;
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
