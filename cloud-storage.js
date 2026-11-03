// ========================================================
//  Cloud Storage & Drive Media Resolver — cloud-storage.js
//  Supports Google Drive, Dropbox, OneDrive, GitHub, and
//  direct MP4/WebM cloud storage URLs.
// ========================================================

/**
 * Extracts a Google Drive File ID from various link formats:
 * - https://drive.google.com/file/d/1A2B3C4D5E/view?usp=sharing
 * - https://drive.google.com/file/d/1A2B3C4D5E/view
 * - https://drive.google.com/open?id=1A2B3C4D5E
 * - https://drive.google.com/uc?id=1A2B3C4D5E
 * - https://drive.google.com/file/d/1A2B3C4D5E/edit
 */
export function extractGoogleDriveId(url) {
  if (!url || typeof url !== 'string') return null;
  const matchFileD = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFileD && matchFileD[1]) return matchFileD[1];

  const matchIdParam = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchIdParam && matchIdParam[1]) return matchIdParam[1];

  return null;
}

/**
 * Analyzes any media URL and returns playback information:
 * - isGoogleDrive: boolean
 * - embedUrl: URL for Google Drive iframe player
 * - streamUrl: direct video stream URL
 * - isDirectVideo: boolean (works with HTML5 <video> & WebGL AR)
 */
export function getMediaInfo(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const url = rawUrl.trim();

  // 1. Google Drive
  const gDriveId = extractGoogleDriveId(url);
  if (gDriveId) {
    return {
      type: 'gdrive',
      id: gDriveId,
      isGoogleDrive: true,
      embedUrl: `https://drive.google.com/file/d/${gDriveId}/preview`,
      streamUrl: `https://drive.google.com/file/d/${gDriveId}/preview`,
      isDirectVideo: false
    };
  }

  // 2. Dropbox
  if (url.includes('dropbox.com')) {
    const directUrl = url.replace(/[?&]dl=0/, '').replace(/[?&]dl=1/, '').replace(/[?&]raw=1/, '') +
      (url.includes('?') ? '&raw=1' : '?raw=1');
    return {
      type: 'dropbox',
      isGoogleDrive: false,
      embedUrl: directUrl,
      streamUrl: directUrl,
      isDirectVideo: true
    };
  }

  // 3. OneDrive
  if (url.includes('1drv.ms') || url.includes('onedrive.live.com')) {
    const directUrl = url.replace('redir', 'download');
    return {
      type: 'onedrive',
      isGoogleDrive: false,
      embedUrl: directUrl,
      streamUrl: directUrl,
      isDirectVideo: true
    };
  }

  // 4. GitHub Raw / Release
  if (url.includes('github.com') && url.includes('/blob/')) {
    const directUrl = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
    return {
      type: 'github',
      isGoogleDrive: false,
      embedUrl: directUrl,
      streamUrl: directUrl,
      isDirectVideo: true
    };
  }

  // 5. Direct MP4 / WebM / Other URL
  return {
    type: 'direct',
    isGoogleDrive: false,
    embedUrl: url,
    streamUrl: url,
    isDirectVideo: true
  };
}

/**
 * Resolves cloud video URL into streamable format
 */
export function resolveCloudVideoUrl(rawUrl) {
  const info = getMediaInfo(rawUrl);
  return info ? (info.embedUrl || info.streamUrl) : '';
}

/**
 * Resolves cloud image URLs
 */
export function resolveCloudImageUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();

  const gDriveId = extractGoogleDriveId(url);
  if (gDriveId) {
    return `https://drive.google.com/uc?export=view&id=${gDriveId}`;
  }

  if (url.includes('dropbox.com')) {
    return url.replace(/[?&]dl=0/, '').replace(/[?&]dl=1/, '') + (url.includes('?') ? '&raw=1' : '?raw=1');
  }

  if (url.includes('github.com') && url.includes('/blob/')) {
    return url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
  }

  return url;
}

/**
 * Builds the permanent QR Code Scanner URL with embedded video parameters.
 */
export function buildQrScannerUrl(baseUrl, videoUrl, imageUrl) {
  let cleanBase = (baseUrl || window.location.href.split('?')[0].split('#')[0]).trim();
  if (cleanBase.endsWith('index.html')) {
    cleanBase = cleanBase.replace('index.html', 'scan.html');
  } else if (cleanBase.endsWith('studio.html')) {
    cleanBase = cleanBase.replace('studio.html', 'scan.html');
  } else if (!cleanBase.endsWith('scan.html')) {
    cleanBase = cleanBase.replace(/\/?$/, '/scan.html');
  }

  const urlObj = new URL(cleanBase);
  if (videoUrl && videoUrl.trim()) {
    urlObj.searchParams.set('v', videoUrl.trim());
  }
  if (imageUrl && imageUrl.trim()) {
    urlObj.searchParams.set('img', imageUrl.trim());
  }

  return urlObj.toString();
}
