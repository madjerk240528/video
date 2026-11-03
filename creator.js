// ============================================================
// creator.js — AR Living Memory Creator Studio & Editor
// ============================================================
import { Compiler } from
  'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js';
import {
  getAllMemories, saveMemory, deleteMemory,
  uploadFile, downloadBlob, deleteFile,
  blobToImage, dataUrlToImage, resolveCloudVideoUrl,
  isFirebaseConfigured
} from './db.js';

// ---- State ----
let selectedPhoto     = null;  // { file, dataUrl, aspect }
let selectedVideoFile = null;  // File
let activeVideoTab    = 'drive'; // 'drive' or 'file'
let allMemories       = {};
let editingMemId      = null;

// ---- DOM References ----
const photoInput    = document.getElementById('photo-input');
const photoDrop     = document.getElementById('photo-drop');
const photoPreview  = document.getElementById('photo-preview');
const photoLabel    = document.getElementById('photo-drop-label');

const tabBtnDrive   = document.getElementById('tab-btn-drive');
const tabBtnFile    = document.getElementById('tab-btn-file');
const paneDrive     = document.getElementById('pane-video-drive');
const paneFile      = document.getElementById('pane-video-file');
const inputDrive    = document.getElementById('input-drive-link');

const videoInput    = document.getElementById('video-input');
const videoDrop     = document.getElementById('video-drop');
const videoPreview  = document.getElementById('video-preview');
const videoLabel    = document.getElementById('video-drop-label');

const titleInput    = document.getElementById('memory-title');
const btnCreate     = document.getElementById('btn-create');

const uploadSection   = document.getElementById('upload-section');
const progressSection = document.getElementById('progress-section');
const progressTitle   = document.getElementById('progress-title');
const progressFill    = document.getElementById('progress-fill');
const progressSub     = document.getElementById('progress-sub');
const doneSection     = document.getElementById('done-section');
const btnAddAnother   = document.getElementById('btn-add-another');
const memoriesList    = document.getElementById('memories-list');
const btnExportJson   = document.getElementById('btn-export-json');

// Edit modal
const editModal       = document.getElementById('edit-modal');
const editTitle       = document.getElementById('edit-title');
const editVideoUrl    = document.getElementById('edit-video-url');
const editPhotoInput  = document.getElementById('edit-photo-input');
const btnSaveEdit     = document.getElementById('btn-save-edit');
const btnCancelEdit   = document.getElementById('btn-cancel-edit');
const btnCloseEdit    = document.getElementById('btn-close-edit');

// ============================================================
//  INIT
// ============================================================
(async function init() {
  try {
    allMemories = await getAllMemories();
    renderMemoriesList(allMemories);
  } catch (e) {
    console.error('Memories load error:', e);
    if (memoriesList) {
      memoriesList.innerHTML = `<div class="err-msg">⚠️ Unable to load memories.</div>`;
    }
  }
})();

// ============================================================
//  TABS (Google Drive Link vs File Upload)
// ============================================================
tabBtnDrive && tabBtnDrive.addEventListener('click', () => {
  activeVideoTab = 'drive';
  tabBtnDrive.classList.add('active');
  tabBtnFile.classList.remove('active');
  paneDrive.style.display = 'block';
  paneFile.style.display  = 'none';
  updateBtn();
});

tabBtnFile && tabBtnFile.addEventListener('click', () => {
  activeVideoTab = 'file';
  tabBtnFile.classList.add('active');
  tabBtnDrive.classList.remove('active');
  paneFile.style.display  = 'block';
  paneDrive.style.display = 'none';
  updateBtn();
});

inputDrive && inputDrive.addEventListener('input', updateBtn);

// ============================================================
//  DROP ZONES
// ============================================================
function makeDrop(dropEl, input, onFile) {
  if (!dropEl || !input) return;
  dropEl.addEventListener('click', () => input.click());
  dropEl.addEventListener('dragover',  (e) => { e.preventDefault(); dropEl.classList.add('drag-over'); });
  dropEl.addEventListener('dragleave', ()  => dropEl.classList.remove('drag-over'));
  dropEl.addEventListener('drop', (e) => {
    e.preventDefault();
    dropEl.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  });
  input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); });
}

makeDrop(photoDrop, photoInput, (file) => {
  if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      selectedPhoto = { file, dataUrl: ev.target.result, aspect: img.height / img.width };
      photoPreview.src = ev.target.result;
      photoPreview.style.display = 'block';
      if (photoLabel) photoLabel.style.display = 'none';
      updateBtn();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

makeDrop(videoDrop, videoInput, (file) => {
  if (!file.type.startsWith('video/')) { alert('Please select a video file.'); return; }
  selectedVideoFile = file;
  videoPreview.src = URL.createObjectURL(file);
  videoPreview.style.display = 'block';
  if (videoLabel) videoLabel.style.display = 'none';
  updateBtn();
});

function updateBtn() {
  const hasPhoto = !!selectedPhoto;
  let hasVideo = false;
  if (activeVideoTab === 'drive') {
    hasVideo = !!(inputDrive && inputDrive.value.trim().length > 5);
  } else {
    hasVideo = !!selectedVideoFile;
  }
  if (btnCreate) btnCreate.disabled = !(hasPhoto && hasVideo);
}

// ============================================================
//  CREATE AR EXPERIENCE
// ============================================================
btnCreate && btnCreate.addEventListener('click', createExperience);

async function createExperience() {
  if (!selectedPhoto) return;

  const memId = 'MEM_' + Date.now();
  const title = (titleInput ? titleInput.value.trim() : '') || 'Living Memory';

  showSection('progress');
  setProgress(0.05, 'Starting...', '');

  try {
    let finalVideoUrl = '';
    let videoStoragePath = '';

    if (activeVideoTab === 'drive') {
      const rawLink = inputDrive.value.trim();
      finalVideoUrl = resolveCloudVideoUrl(rawLink);
      videoStoragePath = finalVideoUrl; // direct cloud link
      setProgress(0.2, '🔗 Google Drive link verified...', '');
    } else {
      if (isFirebaseConfigured()) {
        setProgress(0.1, '📤 Uploading video file...', '');
        videoStoragePath = `videos/${memId}.mp4`;
        finalVideoUrl = await uploadFile(
          videoStoragePath, selectedVideoFile,
          (p) => setProgress(0.1 + p * 0.35, '📤 Uploading video...', pct(p))
        );
      } else {
        // Fallback: local object URL or relative path
        videoStoragePath = 'video.mp4';
        finalVideoUrl = 'video.mp4';
      }
    }

    // Photo processing
    let photoUrl = selectedPhoto.dataUrl;
    let photoStoragePath = `photos/${memId}.jpg`;
    if (isFirebaseConfigured()) {
      setProgress(0.48, '📤 Uploading photo...', '');
      photoUrl = await uploadFile(
        photoStoragePath, selectedPhoto.file,
        (p) => setProgress(0.48 + p * 0.1, '📤 Uploading photo...', pct(p))
      );
    }

    // Existing targets + new target compilation
    setProgress(0.60, '⚙️ Extracting visual AR features from photo...', '');
    const compiler = new Compiler();
    const newImg = await dataUrlToImage(selectedPhoto.dataUrl);

    // Build target list
    const images = [newImg];
    await compiler.compileImageTargets(images, (p) => {
      setProgress(0.60 + p * 0.28, '⚙️ Compiling AR tracking...', pct(p));
    });

    const mindBuffer = await compiler.exportData();
    const mindBlob   = new Blob([mindBuffer], { type: 'application/octet-stream' });

    if (isFirebaseConfigured()) {
      setProgress(0.9, '☁️ Saving AR targets to cloud...', '');
      await uploadFile('targets.mind', mindBlob);
    }

    // Register memory
    setProgress(0.96, '💾 Finalizing registration...', '');
    const targetIdx = Object.keys(allMemories).length;
    await saveMemory(memId, {
      title,
      photoUrl,
      videoUrl: finalVideoUrl,
      photoStoragePath,
      videoStoragePath,
      targetIndex: targetIdx,
      photoAspect: selectedPhoto.aspect,
      createdAt: Date.now()
    });

    setProgress(1.0, '✅ Success!', '');
    await sleep(400);

    // Reset fields
    selectedPhoto = null;
    selectedVideoFile = null;
    if (photoPreview) photoPreview.style.display = 'none';
    if (videoPreview) videoPreview.style.display = 'none';
    if (photoLabel) photoLabel.style.display = '';
    if (videoLabel) videoLabel.style.display = '';
    if (titleInput) titleInput.value = '';
    if (inputDrive) inputDrive.value = '';
    updateBtn();

    allMemories = await getAllMemories();
    renderMemoriesList(allMemories);
    showSection('done');

  } catch (err) {
    console.error('Create error:', err);
    showSection('upload');
    alert('Notice: ' + (err.message || String(err)));
  }
}

// Reset button
btnAddAnother && btnAddAnother.addEventListener('click', () => {
  showSection('upload');
});

// ============================================================
//  EDIT MEMORY (Visual Cloud Editor)
// ============================================================
window.openEditMemory = function(memId) {
  const mem = allMemories[memId];
  if (!mem) return;
  editingMemId = memId;

  if (editTitle) editTitle.value = mem.title || '';
  if (editVideoUrl) editVideoUrl.value = mem.videoUrl || '';
  if (editPhotoInput) editPhotoInput.value = '';

  if (editModal) editModal.style.display = 'flex';
};

btnCloseEdit && btnCloseEdit.addEventListener('click', closeEditModal);
btnCancelEdit && btnCancelEdit.addEventListener('click', closeEditModal);

function closeEditModal() {
  if (editModal) editModal.style.display = 'none';
  editingMemId = null;
}

btnSaveEdit && btnSaveEdit.addEventListener('click', async () => {
  if (!editingMemId) return;
  const mem = allMemories[editingMemId];
  if (!mem) return;

  const newTitle = editTitle.value.trim() || mem.title;
  const newVideo = editVideoUrl.value.trim() ? resolveCloudVideoUrl(editVideoUrl.value.trim()) : mem.videoUrl;

  mem.title = newTitle;
  mem.videoUrl = newVideo;
  mem.videoStoragePath = newVideo;

  // Optional: check if new photo was uploaded
  if (editPhotoInput && editPhotoInput.files[0]) {
    const f = editPhotoInput.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      mem.photoUrl = e.target.result;
      await saveMemory(editingMemId, mem);
      allMemories = await getAllMemories();
      renderMemoriesList(allMemories);
      closeEditModal();
      alert('✅ Memory updated successfully!');
    };
    reader.readAsDataURL(f);
    return;
  }

  await saveMemory(editingMemId, mem);
  allMemories = await getAllMemories();
  renderMemoriesList(allMemories);
  closeEditModal();
  alert('✅ Memory updated! You can export memories.json or scan directly.');
});

// ============================================================
//  EXPORT memories.json
// ============================================================
btnExportJson && btnExportJson.addEventListener('click', () => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allMemories, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", "memories.json");
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
});

// ============================================================
//  DELETE MEMORY
// ============================================================
window.deleteMemory = async function(memId) {
  const mem = allMemories[memId];
  if (!mem) return;
  if (!confirm(`Delete "${mem.title}"?`)) return;
  try {
    await deleteMemory(memId);
    allMemories = await getAllMemories();
    renderMemoriesList(allMemories);
  } catch (e) {
    alert('Delete error: ' + e.message);
  }
};

// ============================================================
//  RENDER MEMORIES LIST
// ============================================================
function renderMemoriesList(memories) {
  if (!memoriesList) return;
  const list = Object.values(memories).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (list.length === 0) {
    memoriesList.innerHTML =
      '<div class="empty-msg">No AR memories registered yet.<br>Create or edit one above! 👆</div>';
    return;
  }
  memoriesList.innerHTML = list.map(mem => `
    <div class="mem-card">
      <img src="${mem.photoUrl}" class="mem-thumb" alt="${mem.title}" loading="lazy">
      <div class="mem-info">
        <div class="mem-title">${mem.title}</div>
        <div class="mem-meta">
          Target #${mem.targetIndex} &bull; 
          <span style="color:var(--accent-gold); word-break:break-all;">
            ${mem.videoUrl && mem.videoUrl.includes('drive.usercontent') ? '☁️ Google Drive Video' : (mem.videoUrl || 'video.mp4')}
          </span>
        </div>
      </div>
      <div class="mem-actions">
        <button class="btn-sm btn-outline" onclick="openEditMemory('${mem.memId}')">✏️ Edit</button>
        <a href="scan.html" class="btn-sm btn-gold">📷 Scan</a>
        <button class="btn-sm btn-del" onclick="deleteMemory('${mem.memId}')">🗑</button>
      </div>
    </div>
  `).join('');
}

// ============================================================
//  HELPERS
// ============================================================
function showSection(name) {
  const sections = { upload: uploadSection, progress: progressSection, done: doneSection };
  Object.values(sections).forEach(el => { if (el) el.style.display = 'none'; });
  if (sections[name]) sections[name].style.display = 'block';
}

function setProgress(fraction, title, sub) {
  if (progressFill)  progressFill.style.width = (fraction * 100).toFixed(1) + '%';
  if (progressTitle) progressTitle.textContent = title;
  if (progressSub)   progressSub.textContent   = sub;
}

function pct(p) { return Math.round(p * 100) + '%'; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
