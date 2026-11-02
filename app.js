document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const appContainer = document.getElementById('app-container');
  const arContainer = document.getElementById('ar-container');
  const arScene = document.getElementById('ar-scene');
  const arAnchor = document.getElementById('ar-anchor');
  const arVideo = document.getElementById('ar-video-asset');
  const arVideoMesh = document.getElementById('ar-video-mesh');
  
  const btnStartAr = document.getElementById('btn-start-ar');
  const btnExitAr = document.getElementById('btn-exit-ar');
  const btnToggleSound = document.getElementById('btn-toggle-sound');
  const soundIcon = document.getElementById('sound-icon');
  const tapUnmutePill = document.getElementById('tap-unmute-pill');
  
  const promptPill = document.getElementById('prompt-pill');
  const promptIcon = document.getElementById('prompt-icon');
  const promptText = document.getElementById('prompt-text');
  const scanLaser = document.getElementById('scan-laser');
  const reticleBox = document.getElementById('reticle-box');

  const btnDirectPlay = document.getElementById('btn-direct-play');
  const previewBox = document.getElementById('preview-box');
  const videoModal = document.getElementById('video-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const directVideo = document.getElementById('direct-video');

  const permissionModal = document.getElementById('permission-modal');
  const btnModalWatchDirect = document.getElementById('btn-modal-watch-direct');
  const btnModalCloseGuide = document.getElementById('btn-modal-close-guide');
  const inappBanner = document.getElementById('inapp-banner');

  let isArRunning = false;
  let isMuted = true; // Default to true on mobile to guarantee autoplay policies pass

  // 1. Detect In-App Browsers (where camera is often disabled by the parent app)
  function checkInAppBrowser() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isInApp = /(FBAN|FBAV|Instagram|TikTok|MicroMessenger|Line|Twitter|Snapchat)/i.test(ua);
    if (isInApp && inappBanner) {
      inappBanner.classList.add('active');
    }
  }
  checkInAppBrowser();

  // 2. Auto-adjust AR video mesh & reticle to match photo & video aspect ratio
  const cardPhoto = document.getElementById('card-photo');

  function adjustDimensions() {
    let targetRatio = 1.333; // Default 4:3 portrait

    if (cardPhoto && cardPhoto.naturalWidth && cardPhoto.naturalHeight) {
      targetRatio = cardPhoto.naturalHeight / cardPhoto.naturalWidth;
    } else if (arVideo.videoWidth && arVideo.videoHeight) {
      targetRatio = arVideo.videoHeight / arVideo.videoWidth;
    }

    // In MindAR coordinate system: width is normalized to 1, height is height/width ratio
    arVideoMesh.setAttribute('width', '1');
    arVideoMesh.setAttribute('height', targetRatio.toFixed(4));

    // Adapt the mobile camera reticle frame to match portrait vs landscape photo
    if (reticleBox) {
      if (targetRatio >= 1) {
        // Portrait Photo (height > width)
        reticleBox.style.width = '260px';
        reticleBox.style.height = `${Math.min(window.innerHeight * 0.55, 260 * targetRatio)}px`;
      } else {
        // Landscape Photo (width > height)
        reticleBox.style.width = '320px';
        reticleBox.style.height = `${320 * targetRatio}px`;
      }
    }
  }

  if (cardPhoto) cardPhoto.addEventListener('load', adjustDimensions);
  arVideo.addEventListener('loadedmetadata', adjustDimensions);
  window.addEventListener('resize', adjustDimensions);

  // 3. Keep video texture fresh on iOS Safari
  let textureSyncInterval = null;
  function startTextureSync() {
    if (textureSyncInterval) clearInterval(textureSyncInterval);
    textureSyncInterval = setInterval(() => {
      if (isArRunning && !arVideo.paused) {
        const mesh = arVideoMesh.getObject3D('mesh');
        if (mesh && mesh.material && mesh.material.map) {
          mesh.material.map.needsUpdate = true;
        }
      }
    }, 1000 / 30);
  }

  function stopTextureSync() {
    if (textureSyncInterval) {
      clearInterval(textureSyncInterval);
      textureSyncInterval = null;
    }
  }

  // 4. Start AR Mode
  btnStartAr.addEventListener('click', async () => {
    try {
      // Audio pre-unlock for iOS Safari & Android Chrome
      arVideo.muted = true;
      arVideo.play().then(() => {
        arVideo.pause();
      }).catch(() => {});

      // Switch to AR UI
      appContainer.style.display = 'none';
      arContainer.classList.add('active');
      isArRunning = true;

      // Start MindAR tracking system
      const mindarSystem = arScene.systems['mindar-image-system'];
      if (mindarSystem) {
        await mindarSystem.start();
        startTextureSync();
      }
    } catch (err) {
      console.error('Error starting AR:', err);
      exitArMode();
      permissionModal.classList.add('active');
    }
  });

  // 5. Exit AR Mode
  function exitArMode() {
    if (!isArRunning) return;
    
    stopTextureSync();
    arVideo.pause();
    tapUnmutePill.classList.remove('active');

    const mindarSystem = arScene.systems['mindar-image-system'];
    if (mindarSystem && mindarSystem.stop) {
      try {
        mindarSystem.stop();
      } catch (e) {
        console.warn('MindAR stop:', e);
      }
    }

    arContainer.classList.remove('active');
    appContainer.style.display = 'flex';
    isArRunning = false;
  }

  btnExitAr.addEventListener('click', exitArMode);

  // 6. Sound Management
  function setAudioState(unmute) {
    isMuted = !unmute;
    arVideo.muted = isMuted;
    soundIcon.textContent = isMuted ? '🔇' : '🔊';
    if (!isMuted) {
      tapUnmutePill.classList.remove('active');
    }
  }

  btnToggleSound.addEventListener('click', () => {
    setAudioState(isMuted);
  });

  tapUnmutePill.addEventListener('click', () => {
    setAudioState(true);
  });

  // 7. MindAR Target Detection Events
  arAnchor.addEventListener('targetFound', () => {
    console.log('Target Image Found! Playing video...');
    arVideo.play().catch(e => console.log('Autoplay error:', e));

    promptPill.classList.add('target-detected');
    promptIcon.textContent = '✨';
    promptText.textContent = 'Memory Playing!';
    scanLaser.style.display = 'none';
    reticleBox.style.borderColor = '#22c55e';

    // On mobile, show audio pill if muted
    if (isMuted) {
      tapUnmutePill.classList.add('active');
    }
  });

  arAnchor.addEventListener('targetLost', () => {
    console.log('Target Image Lost. Pausing video...');
    arVideo.pause();

    promptPill.classList.remove('target-detected');
    promptIcon.textContent = '🔍';
    promptText.textContent = 'Point camera at the photo';
    scanLaser.style.display = 'block';
    reticleBox.style.borderColor = '';
    tapUnmutePill.classList.remove('active');
  });

  // 8. Direct Cinema Video Modal
  function openDirectVideo() {
    videoModal.classList.add('active');
    directVideo.currentTime = 0;
    directVideo.play().catch(() => {});
  }

  function closeDirectVideo() {
    videoModal.classList.remove('active');
    directVideo.pause();
  }

  btnDirectPlay.addEventListener('click', openDirectVideo);
  previewBox.addEventListener('click', openDirectVideo);
  btnCloseModal.addEventListener('click', closeDirectVideo);

  videoModal.addEventListener('click', (e) => {
    if (e.target === videoModal) closeDirectVideo();
  });

  // 9. Camera Permission Modal Handlers
  btnModalCloseGuide.addEventListener('click', () => {
    permissionModal.classList.remove('active');
  });

  btnModalWatchDirect.addEventListener('click', () => {
    permissionModal.classList.remove('active');
    openDirectVideo();
  });

  // Handle hardware / mobile back gestures
  window.addEventListener('popstate', () => {
    if (isArRunning) exitArMode();
    if (videoModal.classList.contains('active')) closeDirectVideo();
    if (permissionModal.classList.contains('active')) permissionModal.classList.remove('active');
  });
});
