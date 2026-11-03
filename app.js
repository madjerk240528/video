// ========================================================
//  Living Memory AR — app.js (ES Module) — v3
//  Option 1: Create AR Photo (Photo + Video or Google Drive Link)
//  Option 2: View / Scan (Play on tab or Point Camera in 3D AR)
// ========================================================
import { Compiler } from "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js";
import { getMediaInfo, resolveCloudVideoUrl, buildQrScannerUrl } from "./cloud-storage.js";

// ---- Magic File Format Constants ----
const MAGIC_SIGNATURE_V1  = "AR_MAGIC_V1"; // Binary-embedded MP4
const MAGIC_SIGNATURE_URL = "AR_URL_V1";   // Cloud Video URL link
const FOOTER_SIZE = 56;

// ---- Global State ----
let currentPhotoFile       = null;
let currentVideoFile       = null;
let currentVideoCloudUrl   = null; // Google Drive or cloud video link
let currentPhotoDataUrl    = null;
let currentVideoObjectUrl  = null;

let generatedMagicBlob     = null;
let generatedMagicBlobUrl  = null;
let compiledMindBuffer     = null;
let compiledMindObjectUrl  = null;

let isArRunning            = false;
let isArMuted              = true;
let isCurrentArGoogleDrive = false;
let arScene                = null;
let arAnchor               = null;
let arVideo                = null;
let arVideoMesh            = null;
let textureSyncInterval    = null;

// ---- DOM Elements ----
const tabBtnCreate         = document.getElementById('tab-btn-create');
const tabBtnView           = document.getElementById('tab-btn-view');
const panelCreate          = document.getElementById('panel-create');
const panelView            = document.getElementById('panel-view');

// Create Elements
const createFormView       = document.getElementById('create-form-view');
const createResultView     = document.getElementById('create-result-view');
const createPhotoBox       = document.getElementById('create-photo-box');
const createPhotoInput     = document.getElementById('create-photo-input');
const createPhotoThumb     = document.getElementById('create-photo-thumb');
const createPhotoInfo      = document.getElementById('create-photo-info');

const createVideoBox       = document.getElementById('create-video-box');
const createVideoInput     = document.getElementById('create-video-input');
const createVideoThumb     = document.getElementById('create-video-thumb');
const createVideoIframe    = document.getElementById('create-video-iframe');
const createVideoInfo      = document.getElementById('create-video-info');
const createVideoUrlInput  = document.getElementById('create-video-url-input');
const driveAccessHint      = document.getElementById('drive-access-hint');

const btnGenerateAr        = document.getElementById('btn-generate-ar');
const generateHint         = document.getElementById('generate-hint');
const lensBanner           = document.getElementById('lens-banner');
const createProgressBox    = document.getElementById('create-progress-box');
const createProgressFill   = document.getElementById('create-progress-fill');
const createProgressText   = document.getElementById('create-progress-text');

// Result Elements
const resultPhotoImg       = document.getElementById('result-photo-img');
const resultPhotoMeta      = document.getElementById('result-photo-meta');
const btnDownloadResult    = document.getElementById('btn-download-result');
const btnTestResultVideo   = document.getElementById('btn-test-result-video');
const btnCopyResultLink    = document.getElementById('btn-copy-result-link');
const btnCreateReset       = document.getElementById('btn-create-reset');

// View / Scan Elements
const viewUploadSection    = document.getElementById('view-upload-section');
const viewDropBox          = document.getElementById('view-drop-box');
const viewFileInput        = document.getElementById('view-file-input');
const viewPlayerSection    = document.getElementById('view-player-section');
const viewTabVideo         = document.getElementById('view-tab-video');
const viewTabIframe        = document.getElementById('view-tab-iframe');
const viewPlayerTitle      = document.getElementById('view-player-title');
const viewPlayerSubtitle   = document.getElementById('view-player-subtitle');
const btnViewReset         = document.getElementById('btn-view-reset');
const btnViewLaunchAr      = document.getElementById('btn-view-launch-ar');
const btnStartCameraAr     = document.getElementById('btn-start-camera-ar');

// Video Modal (Testing)
const videoModal           = document.getElementById('video-modal');
const modalVideoPlayer     = document.getElementById('modal-video-player');
const modalVideoIframe     = document.getElementById('modal-video-iframe');
const btnCloseModal        = document.getElementById('btn-close-modal');
const modalVideoTitle      = document.getElementById('modal-video-title');
const modalVideoSubtitle   = document.getElementById('modal-video-subtitle');
const modalGdriveLinks     = document.getElementById('modal-gdrive-links');
const modalOpenDriveLink   = document.getElementById('modal-open-drive-link');

// AR View Elements
const appContainer         = document.getElementById('app-container');
const arContainer          = document.getElementById('ar-container');
const arGdriveCinema       = document.getElementById('ar-gdrive-cinema');
const arGdriveIframe       = document.getElementById('ar-gdrive-iframe');
const btnCloseGdriveCinema = document.getElementById('btn-close-gdrive-cinema');
const btnExitAr            = document.getElementById('btn-exit-ar');
const btnToggleSound       = document.getElementById('btn-toggle-sound');
const soundIcon            = document.getElementById('sound-icon');
const tapUnmutePill        = document.getElementById('tap-unmute-pill');
const promptPill           = document.getElementById('prompt-pill');
const promptIcon           = document.getElementById('prompt-icon');
const promptText           = document.getElementById('prompt-text');
const scanLaser            = document.getElementById('scan-laser');
const permissionModal      = document.getElementById('permission-modal');
const btnModalCloseGuide   = document.getElementById('btn-modal-close-guide');
const inappBanner          = document.getElementById('inapp-banner');

// ========================================================
//  1. INITIALIZATION & GOOGLE LENS / URL PARAMS CHECK
// ========================================================
(function initApp() {
  const ua = navigator.userAgent || '';
  if (/(FBAN|FBAV|Instagram|TikTok|MicroMessenger|Line|Twitter|Snapchat)/i.test(ua)) {
    inappBanner && inappBanner.classList.add('active');
  }

  const params = new URLSearchParams(window.location.search);
  const rawVideoParam = params.get('v') || params.get('video');
  if (params.has('lens') || params.get('autoplay') === '1' || rawVideoParam) {
    if (lensBanner) lensBanner.style.display = 'block';
    switchTab('view');
    const streamUrl = rawVideoParam ? resolveCloudVideoUrl(rawVideoParam) : 'video.mp4';
    loadVideoIntoViewPlayer(streamUrl, "Scanned Memory", "Auto-playing living photo video");
  }
})();

// ========================================================
//  2. TAB SWITCHING SYSTEM
// ========================================================
function switchTab(target) {
  if (target === 'create') {
    tabBtnCreate && tabBtnCreate.classList.add('active');
    tabBtnView && tabBtnView.classList.remove('active');
    panelCreate && panelCreate.classList.add('active');
    panelView && panelView.classList.remove('active');
  } else {
    tabBtnView && tabBtnView.classList.add('active');
    tabBtnCreate && tabBtnCreate.classList.remove('active');
    panelView && panelView.classList.add('active');
    panelCreate && panelCreate.classList.remove('active');
  }
}

tabBtnCreate && tabBtnCreate.addEventListener('click', () => switchTab('create'));
tabBtnView && tabBtnView.addEventListener('click', () => switchTab('view'));

// ========================================================
//  3. CREATE TAB: PHOTO & VIDEO SELECTION
// ========================================================
// Photo Box
createPhotoBox && createPhotoBox.addEventListener('click', () => createPhotoInput && createPhotoInput.click());
createPhotoInput && createPhotoInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) handleCreatePhoto(e.target.files[0]);
});

// Video Box (Click to upload file)
createVideoBox && createVideoBox.addEventListener('click', (e) => {
  if (e.target.id !== 'create-video-url-input') {
    createVideoInput && createVideoInput.click();
  }
});
createVideoInput && createVideoInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) handleCreateVideoFile(e.target.files[0]);
});

// Google Drive / Cloud Video URL Input Handler
function handleVideoUrlInput(rawVal) {
  const val = (rawVal || '').trim();
  if (val) {
    const media = getMediaInfo(val);
    currentVideoCloudUrl = val;
    currentVideoObjectUrl = media ? media.streamUrl : val;
    currentVideoFile = null;

    if (media && media.isGoogleDrive) {
      if (createVideoThumb) {
        createVideoThumb.pause();
        createVideoThumb.style.display = 'none';
      }
      if (createVideoIframe) {
        createVideoIframe.src = media.embedUrl;
        createVideoIframe.style.display = 'block';
      }
      if (driveAccessHint) driveAccessHint.style.display = 'block';
      if (createVideoInfo) createVideoInfo.textContent = '☁️ Google Drive Video Linked & Previewing!';
    } else {
      if (createVideoIframe) {
        createVideoIframe.src = '';
        createVideoIframe.style.display = 'none';
      }
      if (createVideoThumb) {
        createVideoThumb.src = currentVideoObjectUrl;
        createVideoThumb.style.display = 'block';
      }
      if (driveAccessHint) driveAccessHint.style.display = 'none';
      if (createVideoInfo) createVideoInfo.textContent = '☁️ Cloud Video Linked!';
    }
    createVideoBox.classList.add('done');
    updateGenerateButtonState();
  } else {
    currentVideoCloudUrl = null;
    if (createVideoIframe) {
      createVideoIframe.src = '';
      createVideoIframe.style.display = 'none';
    }
    if (driveAccessHint) driveAccessHint.style.display = 'none';
    createVideoBox.classList.remove('done');
    updateGenerateButtonState();
  }
}

if (createVideoUrlInput) {
  createVideoUrlInput.addEventListener('input', (e) => handleVideoUrlInput(e.target.value));
  createVideoUrlInput.addEventListener('change', (e) => handleVideoUrlInput(e.target.value));
  createVideoUrlInput.addEventListener('paste', () => {
    setTimeout(() => handleVideoUrlInput(createVideoUrlInput.value), 50);
  });
}

setupDragDrop(createPhotoBox, handleCreatePhoto);
setupDragDrop(createVideoBox, handleCreateVideoFile);

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

function handleCreateVideoFile(file) {
  if (!file.type.startsWith('video/')) {
    alert('Please select a valid video file (MP4, MOV, WebM).');
    return;
  }
  currentVideoFile = file;
  currentVideoCloudUrl = null;
  if (createVideoUrlInput) createVideoUrlInput.value = '';
  if (createVideoIframe) {
    createVideoIframe.src = '';
    createVideoIframe.style.display = 'none';
  }
  if (driveAccessHint) driveAccessHint.style.display = 'none';

  if (currentVideoObjectUrl && currentVideoObjectUrl.startsWith('blob:')) {
    URL.revokeObjectURL(currentVideoObjectUrl);
  }
  currentVideoObjectUrl = URL.createObjectURL(file);
  createVideoThumb.src = currentVideoObjectUrl;
  createVideoThumb.style.display = 'block';
  createVideoInfo.textContent = `${file.name} (${formatBytes(file.size)})`;
  createVideoBox.classList.add('done');
  updateGenerateButtonState();
}

function updateGenerateButtonState() {
  const hasPhoto = !!currentPhotoFile;
  const hasVideo = !!(currentVideoFile || currentVideoCloudUrl);
  const isReady = hasPhoto && hasVideo;

  if (btnGenerateAr) btnGenerateAr.disabled = !isReady;
  if (generateHint) {
    if (isReady) {
      generateHint.textContent = "✓ Ready! Tap 'Generate AR Photo' to build your living memory.";
      generateHint.style.color = "var(--gold-vivid)";
    } else {
      generateHint.textContent = "* Both Photo and Video (or Cloud Link) are required.";
      generateHint.style.color = "var(--text-muted)";
    }
  }
}

// ========================================================
//  4. GENERATE AR PHOTO (Compile MindAR + Embed/Link Video)
// ========================================================
btnGenerateAr && btnGenerateAr.addEventListener('click', generateARPhoto);

async function generateARPhoto() {
  if (!currentPhotoFile || (!currentVideoFile && !currentVideoCloudUrl)) {
    alert('Both Photo and Video are required.');
    return;
  }

  btnGenerateAr.disabled = true;
  createProgressBox.classList.add('active');
  createProgressFill.style.width = '10%';
  createProgressText.textContent = 'Preparing photo for AR tracking...';

  try {
    // 1. Compile MindAR tracking features
    createProgressText.textContent = 'Compiling 3D AR tracking features... (Step 1/2)';
    const compiler = new Compiler();
    const imgElement = new Image();
    imgElement.src = currentPhotoDataUrl;
    await new Promise((res, rej) => { imgElement.onload = res; imgElement.onerror = rej; });

    await compiler.compileImageTargets([imgElement], (pct) => {
      const scaled = Math.round(15 + (pct * 0.65));
      createProgressFill.style.width = `${scaled}%`;
      createProgressText.textContent = `Compiling AR features: ${Math.round(pct)}%`;
    });

    compiledMindBuffer = await compiler.exportData();
    if (compiledMindObjectUrl && compiledMindObjectUrl.startsWith('blob:')) {
      URL.revokeObjectURL(compiledMindObjectUrl);
    }
    compiledMindObjectUrl = URL.createObjectURL(new Blob([compiledMindBuffer]));

    // 2. Embed video binary OR URL into photo
    createProgressFill.style.width = '85%';
    createProgressText.textContent = 'Embedding video data into photo... (Step 2/2)';

    if (currentVideoFile) {
      generatedMagicBlob = await packMagicPhoto(currentPhotoFile, currentVideoFile);
    } else {
      generatedMagicBlob = await packMagicPhotoWithUrl(currentPhotoFile, currentVideoCloudUrl);
    }

    if (generatedMagicBlobUrl && generatedMagicBlobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(generatedMagicBlobUrl);
    }
    generatedMagicBlobUrl = URL.createObjectURL(generatedMagicBlob);

    createProgressFill.style.width = '100%';
    createProgressText.textContent = '✅ Magic AR Photo Complete!';

    setTimeout(() => {
      showResultView(imgElement, currentPhotoDataUrl);
    }, 500);

  } catch (err) {
    console.error('AR Generation failed:', err);
    alert('Processing failed: ' + (err.message || err));
    createProgressText.textContent = '⚠️ Generation failed. Try a photo with higher contrast.';
    btnGenerateAr.disabled = false;
  }
}

function showResultView(imgElement, displayPhotoUrl) {
  createFormView.style.display = 'none';
  createResultView.style.display = 'block';

  resultPhotoImg.src = displayPhotoUrl || currentPhotoDataUrl;
  const isPortrait = imgElement.naturalHeight >= imgElement.naturalWidth;
  const sizeText = currentVideoFile ? formatBytes(currentVideoFile.size) : 'Cloud Linked';
  resultPhotoMeta.textContent = `${imgElement.naturalWidth}×${imgElement.naturalHeight} • ${isPortrait ? 'Portrait' : 'Landscape'} • Video: ${sizeText}`;

  btnDownloadResult.href = generatedMagicBlobUrl;
  btnDownloadResult.download = `LivingPhoto_${Date.now()}.png`;

  // Copy shareable link button
  if (btnCopyResultLink) {
    btnCopyResultLink.onclick = () => {
      const link = buildQrScannerUrl(window.location.href, currentVideoCloudUrl || '', '');
      navigator.clipboard.writeText(link).then(() => {
        alert('📋 Scannable link copied to clipboard!\n\n' + link);
      }).catch(() => {
        prompt('Copy scannable link:', link);
      });
    };
  }
}

btnCreateReset && btnCreateReset.addEventListener('click', () => {
  createResultView.style.display = 'none';
  createFormView.style.display = 'block';
  createProgressBox.classList.remove('active');
  createProgressFill.style.width = '0%';

  currentPhotoFile = null;
  currentVideoFile = null;
  currentVideoCloudUrl = null;
  createPhotoBox.classList.remove('done');
  createVideoBox.classList.remove('done');
  createPhotoThumb.src = '';
  createVideoThumb.src = '';
  if (createVideoIframe) {
    createVideoIframe.src = '';
    createVideoIframe.style.display = 'none';
  }
  if (driveAccessHint) driveAccessHint.style.display = 'none';
  createPhotoInput.value = '';
  createVideoInput.value = '';
  if (createVideoUrlInput) createVideoUrlInput.value = '';
  createPhotoInfo.textContent = '';
  createVideoInfo.textContent = '';
  updateGenerateButtonState();
});

btnTestResultVideo && btnTestResultVideo.addEventListener('click', () => {
  const targetUrl = currentVideoCloudUrl || currentVideoObjectUrl;
  if (!targetUrl) return;

  const media = getMediaInfo(targetUrl);
  videoModal.classList.add('active');

  if (media && media.isGoogleDrive) {
    if (modalVideoPlayer) {
      modalVideoPlayer.pause();
      modalVideoPlayer.style.display = 'none';
    }
    if (modalVideoIframe) {
      modalVideoIframe.src = media.embedUrl;
      modalVideoIframe.style.display = 'block';
    }
    if (modalVideoTitle) modalVideoTitle.textContent = '☁️ Google Drive Video Preview';
    if (modalVideoSubtitle) modalVideoSubtitle.textContent = 'Playing official Google Drive embed. Tap ▶ inside the player.';
    if (modalGdriveLinks) modalGdriveLinks.style.display = 'block';
    if (modalOpenDriveLink) modalOpenDriveLink.href = targetUrl;
  } else {
    if (modalVideoIframe) {
      modalVideoIframe.src = '';
      modalVideoIframe.style.display = 'none';
    }
    if (modalVideoPlayer) {
      modalVideoPlayer.style.display = 'block';
      modalVideoPlayer.src = (media ? media.streamUrl : targetUrl);
      modalVideoPlayer.play().catch(() => {});
    }
    if (modalVideoTitle) modalVideoTitle.textContent = 'Embedded Video Preview';
    if (modalVideoSubtitle) modalVideoSubtitle.textContent = 'This is the video that plays when the photo is opened or scanned.';
    if (modalGdriveLinks) modalGdriveLinks.style.display = 'none';
  }
});

// ========================================================
//  5. VIEW / SCAN TAB: PLAY ON TAB OR AR
// ========================================================
viewDropBox && viewDropBox.addEventListener('click', () => viewFileInput && viewFileInput.click());
viewFileInput && viewFileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) handleViewPhotoUpload(e.target.files[0]);
});

setupDragDrop(viewDropBox, handleViewPhotoUpload);

async function handleViewPhotoUpload(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file.');
    return;
  }

  try {
    const extracted = await unpackMagicPhoto(file);

    if (extracted) {
      if (extracted.videoBlob) {
        if (currentVideoObjectUrl && currentVideoObjectUrl.startsWith('blob:')) {
          URL.revokeObjectURL(currentVideoObjectUrl);
        }
        currentVideoObjectUrl = URL.createObjectURL(extracted.videoBlob);
        currentPhotoDataUrl = await fileToDataUrl(extracted.photoBlob || file);
        compileTargetInMemory(currentPhotoDataUrl);
        loadVideoIntoViewPlayer(currentVideoObjectUrl, file.name, "✨ Embedded video detected & playing!");
      } else if (extracted.videoUrl) {
        const streamUrl = resolveCloudVideoUrl(extracted.videoUrl);
        currentVideoObjectUrl = streamUrl;
        currentPhotoDataUrl = await fileToDataUrl(extracted.photoBlob || file);
        compileTargetInMemory(currentPhotoDataUrl);
        loadVideoIntoViewPlayer(streamUrl, file.name, "☁️ Cloud video linked & playing!");
      }
    } else {
      const photoUrl = await fileToDataUrl(file);
      currentPhotoDataUrl = photoUrl;
      compileTargetInMemory(photoUrl);

      if (currentVideoObjectUrl) {
        loadVideoIntoViewPlayer(currentVideoObjectUrl, file.name, "Playing memory video");
      } else {
        alert("This photo doesn't contain an embedded video. You can create one in the Creator tab or point camera to scan!");
      }
    }
  } catch (err) {
    console.error("View file processing error:", err);
    alert("Could not process photo: " + err.message);
  }
}

function loadVideoIntoViewPlayer(videoSrc, title, subtitle) {
  if (viewUploadSection) viewUploadSection.style.display = 'none';
  if (viewPlayerSection) viewPlayerSection.style.display = 'block';

  const media = getMediaInfo(videoSrc);
  if (media && media.isGoogleDrive) {
    if (viewTabVideo) {
      viewTabVideo.pause();
      viewTabVideo.style.display = 'none';
    }
    if (viewTabIframe) {
      viewTabIframe.src = media.embedUrl;
      viewTabIframe.style.display = 'block';
    }
  } else {
    if (viewTabIframe) {
      viewTabIframe.src = '';
      viewTabIframe.style.display = 'none';
    }
    if (viewTabVideo) {
      viewTabVideo.style.display = 'block';
      viewTabVideo.src = (media ? media.streamUrl : videoSrc);
      viewTabVideo.crossOrigin = 'anonymous';
      viewTabVideo.muted = false;
      viewTabVideo.play().catch(() => {
        viewTabVideo.muted = true;
        viewTabVideo.play().catch(() => {});
      });
    }
  }

  if (viewPlayerTitle) viewPlayerTitle.textContent = title || "Living Memory";
  if (viewPlayerSubtitle) viewPlayerSubtitle.textContent = subtitle || "Playing memory video";
}

btnViewReset && btnViewReset.addEventListener('click', () => {
  if (viewTabVideo) { viewTabVideo.pause(); viewTabVideo.src = ''; }
  if (viewTabIframe) { viewTabIframe.src = ''; }
  if (viewPlayerSection) viewPlayerSection.style.display = 'none';
  if (viewUploadSection) viewUploadSection.style.display = 'block';
  if (viewFileInput) viewFileInput.value = '';
});

// Launch AR
btnViewLaunchAr && btnViewLaunchAr.addEventListener('click', startLiveAR);
btnStartCameraAr && btnStartCameraAr.addEventListener('click', startLiveAR);

// ========================================================
//  6. LIVE AR SCANNER (TRANSPARENT CANVAS + FULL CAMERA VIEW)
// ========================================================
async function startLiveAR() {
  if (!compiledMindObjectUrl && currentPhotoDataUrl) {
    promptText.textContent = "Preparing AR camera...";
    await compileTargetInMemory(currentPhotoDataUrl);
  }

  const targetUrl = compiledMindObjectUrl || 'targets.mind';
  const videoSrc  = currentVideoObjectUrl || 'video.mp4';

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

      // Pre-warm video
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
    console.error('AR start error:', err);
    exitArMode();
    permissionModal && permissionModal.classList.add('active');
  }
}

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
  scene.setAttribute('mindar-image',
    `imageTargetSrc: ${targetSrc}; autoStart: false; uiLoading: no; uiScanning: no; filterMinCF: 0.0001; filterBeta: 0.001; missTolerance: 5;`);
  scene.setAttribute('color-space', 'sRGB');
  scene.setAttribute('renderer', 'colorManagement: true; physicallyCorrectLights: true; alpha: true;');
  scene.setAttribute('vr-mode-ui', 'enabled: false');
  scene.setAttribute('device-orientation-permission-ui', 'enabled: false');

  // Video Asset Element (3D AR video texture)
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
  assets.appendChild(vid);
  scene.appendChild(assets);

  // Camera
  const cam = document.createElement('a-camera');
  cam.setAttribute('position', '0 0 0');
  cam.setAttribute('look-controls', 'enabled: false');
  scene.appendChild(cam);

  // Target Anchor
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
    promptPill && promptPill.classList.add('target-detected');
    if (promptIcon) promptIcon.textContent = '✨';
    if (promptText) promptText.textContent = 'Memory Playing!';
    if (scanLaser) scanLaser.style.display = 'none';
    if (isArMuted && tapUnmutePill) tapUnmutePill.classList.add('active');
  });

  arAnchor.addEventListener('targetLost', () => {
    if (arVideo) {
      arVideo.pause();
    }
    promptPill && promptPill.classList.remove('target-detected');
    if (promptIcon) promptIcon.textContent = '🔍';
    if (promptText) promptText.textContent = 'Point camera at the photo';
    if (scanLaser) scanLaser.style.display = 'block';
    if (tapUnmutePill) tapUnmutePill.classList.remove('active');
  });

  if (btnCloseGdriveCinema) {
    btnCloseGdriveCinema.onclick = () => {
      if (arGdriveCinema) arGdriveCinema.classList.remove('active');
    };
  }
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

async function compileTargetInMemory(dataUrl) {
  try {
    const compiler = new Compiler();
    const img = new Image();
    img.src = dataUrl;
    img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    await compiler.compileImageTargets([img]);
    compiledMindBuffer = await compiler.exportData();
    if (compiledMindObjectUrl && compiledMindObjectUrl.startsWith('blob:')) {
      URL.revokeObjectURL(compiledMindObjectUrl);
    }
    compiledMindObjectUrl = URL.createObjectURL(new Blob([compiledMindBuffer]));
  } catch (e) {
    console.warn("Background compile note:", e);
  }
}

// ========================================================
//  7. BINARY EMBEDDING / EXTRACTION ENGINE
// ========================================================
async function packMagicPhoto(photoFile, videoFile) {
  const photoBuffer = await photoFile.arrayBuffer();
  const videoBuffer = await videoFile.arrayBuffer();

  const videoLen = videoBuffer.byteLength;
  const mimeStr  = (videoFile.type || 'video/mp4').padEnd(32, ' ');
  const sigStr   = MAGIC_SIGNATURE_V1.padEnd(16, ' ');

  const footer = new Uint8Array(FOOTER_SIZE);
  const textEncoder = new TextEncoder();

  footer.set(textEncoder.encode(mimeStr).subarray(0, 32), 0);
  const view = new DataView(footer.buffer);
  view.setBigUint64(32, BigInt(videoLen), false);
  footer.set(textEncoder.encode(sigStr).subarray(0, 16), 40);

  return new Blob([photoBuffer, videoBuffer, footer], { type: 'image/png' });
}

async function packMagicPhotoWithUrl(photoFile, urlString) {
  const photoBuffer = await photoFile.arrayBuffer();
  const urlBytes    = new TextEncoder().encode(urlString);

  const urlLen  = urlBytes.byteLength;
  const mimeStr = 'text/uri-list'.padEnd(32, ' ');
  const sigStr  = MAGIC_SIGNATURE_URL.padEnd(16, ' ');

  const footer = new Uint8Array(FOOTER_SIZE);
  const textEncoder = new TextEncoder();

  footer.set(textEncoder.encode(mimeStr).subarray(0, 32), 0);
  const view = new DataView(footer.buffer);
  view.setBigUint64(32, BigInt(urlLen), false);
  footer.set(textEncoder.encode(sigStr).subarray(0, 16), 40);

  return new Blob([photoBuffer, urlBytes, footer], { type: 'image/png' });
}

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
        photoBlob: new Blob([photoBytes], { type: 'image/png' }),
        videoBlob: null,
        videoUrl: videoUrl
      };
    }
  }

  return null;
}

// ========================================================
//  8. MODALS & UTILITIES
// ========================================================
btnCloseModal && btnCloseModal.addEventListener('click', () => {
  videoModal.classList.remove('active');
  if (modalVideoPlayer) modalVideoPlayer.pause();
  if (modalVideoIframe) modalVideoIframe.src = '';
});
videoModal && videoModal.addEventListener('click', (e) => {
  if (e.target === videoModal) {
    videoModal.classList.remove('active');
    if (modalVideoPlayer) modalVideoPlayer.pause();
    if (modalVideoIframe) modalVideoIframe.src = '';
  }
});

btnModalCloseGuide && btnModalCloseGuide.addEventListener('click', () => {
  permissionModal.classList.remove('active');
});

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

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
