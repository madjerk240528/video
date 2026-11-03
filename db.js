// ============================================================
// db.js — Cloud Storage, Google Drive & Database Connector
// ============================================================
import { initializeApp, getApps } from
  'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getDatabase, ref, set, get, remove } from
  'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';
import {
  getStorage, ref as sRef,
  uploadBytesResumable, uploadBytes,
  getDownloadURL, getBlob, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-storage.js';
import { firebaseConfig } from './firebase-config.js';

// ---- Cloud Link Resolver (Google Drive, Dropbox, Direct URLs) ----
export function resolveCloudVideoUrl(rawUrl) {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  
  // Google Drive
  const driveMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    const fileId = driveMatch[1];
    return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`;
  }
  
  // Dropbox
  if (trimmed.includes('dropbox.com')) {
    return trimmed.replace('dl=0', 'raw=1');
  }
  
  return trimmed;
}

// Check if user has entered real Firebase credentials
export function isFirebaseConfigured() {
  return !!(
    firebaseConfig &&
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.includes('PASTE_YOUR') &&
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.includes('PASTE_YOUR')
  );
}

// ---- Singleton Firebase init ----
let _app, _db, _storage;
function firebase() {
  if (!isFirebaseConfigured()) return null;
  if (!_app) {
    try {
      _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
      _db      = getDatabase(_app);
      _storage = getStorage(_app);
    } catch (e) {
      console.warn('Firebase initialization error:', e);
      return null;
    }
  }
  return { db: _db, storage: _storage };
}

// ============================================================
//  MEMORIES (Cloud DB or Global memories.json Fallback)
// ============================================================

export async function getAllMemories() {
  const fb = firebase();
  if (fb) {
    try {
      const snap = await get(ref(fb.db, 'memories'));
      if (snap.exists()) return snap.val();
    } catch (e) {
      console.warn('Firebase DB read warning, checking fallback:', e);
    }
  }

  // Fallback: Read from memories.json or localStorage
  let localMemories = {};
  try {
    const res = await fetch('memories.json?' + Date.now());
    if (res.ok) {
      localMemories = await res.json();
    }
  } catch (_) {}

  try {
    const saved = localStorage.getItem('ar_local_memories');
    if (saved) {
      const parsed = JSON.parse(saved);
      localMemories = { ...localMemories, ...parsed };
    }
  } catch (_) {}

  return localMemories;
}

export async function saveMemory(memId, data) {
  const fb = firebase();
  if (fb) {
    await set(ref(fb.db, `memories/${memId}`), { ...data, memId });
    return;
  }

  // Fallback to localStorage
  try {
    const saved = localStorage.getItem('ar_local_memories');
    const memories = saved ? JSON.parse(saved) : {};
    memories[memId] = { ...data, memId };
    localStorage.setItem('ar_local_memories', JSON.stringify(memories));
  } catch (_) {}
}

export async function deleteMemory(memId) {
  const fb = firebase();
  if (fb) {
    await remove(ref(fb.db, `memories/${memId}`));
    return;
  }

  try {
    const saved = localStorage.getItem('ar_local_memories');
    if (saved) {
      const memories = JSON.parse(saved);
      delete memories[memId];
      localStorage.setItem('ar_local_memories', JSON.stringify(memories));
    }
  } catch (_) {}
}

// ============================================================
//  FILE STORAGE
// ============================================================

export async function uploadFile(storagePath, blob, onProgress) {
  const fb = firebase();
  if (!fb) {
    throw new Error('Firebase configuration needed for cloud upload. Please configure firebase-config.js.');
  }

  const fileRef = sRef(fb.storage, storagePath);

  if (onProgress) {
    return await new Promise((resolve, reject) => {
      const task = uploadBytesResumable(fileRef, blob);
      task.on(
        'state_changed',
        (snap) => onProgress(snap.bytesTransferred / snap.totalBytes),
        reject,
        async () => resolve(await getDownloadURL(fileRef))
      );
    });
  }

  await uploadBytes(fileRef, blob);
  return await getDownloadURL(fileRef);
}

export async function downloadBlob(storagePath) {
  const fb = firebase();
  if (fb && !storagePath.startsWith('http')) {
    try {
      const fileRef = sRef(fb.storage, storagePath);
      return await getBlob(fileRef);
    } catch (e) {
      console.warn('Firebase getBlob failed for', storagePath, ', falling back to URL:', e);
    }
  }

  // Resolve cloud URL (e.g. Google Drive, Dropbox, or relative path)
  const resolved = resolveCloudVideoUrl(storagePath);
  const fetchUrl = resolved.startsWith('http') ? resolved : `./${resolved}`;
  const res = await fetch(fetchUrl);
  if (!res.ok) throw new Error(`Failed to load ${storagePath} (${res.status})`);
  return await res.blob();
}

export async function getFileUrl(storagePath) {
  const fb = firebase();
  if (fb && !storagePath.startsWith('http')) {
    try {
      const fileRef = sRef(fb.storage, storagePath);
      return await getDownloadURL(fileRef);
    } catch (_) {}
  }
  return resolveCloudVideoUrl(storagePath);
}

export async function deleteFile(storagePath) {
  const fb = firebase();
  if (!fb || storagePath.startsWith('http')) return;
  try {
    const fileRef = sRef(fb.storage, storagePath);
    await deleteObject(fileRef);
  } catch (_) {}
}

// ============================================================
//  HELPERS
// ============================================================

export function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

export function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img  = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}
