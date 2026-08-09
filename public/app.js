// Network Sharer Client Application

let selectedFiles = [];
let itemsList = [];
let currentFilter = 'all';
let serverInfo = null;

// DOM Elements
const dropOverlay = document.getElementById('dropOverlay');
const ipDisplay = document.getElementById('ipDisplay');
const openQrBtn = document.getElementById('openQrBtn');
const qrModal = document.getElementById('qrModal');
const closeQrBtn = document.getElementById('closeQrBtn');
const qrCodeImg = document.getElementById('qrCodeImg');
const fullUrlCode = document.getElementById('fullUrlCode');
const copyUrlBtn = document.getElementById('copyUrlBtn');

const mediaGrid = document.getElementById('mediaGrid');
const emptyState = document.getElementById('emptyState');
const itemCount = document.getElementById('itemCount');
const filterTabs = document.querySelectorAll('.tab-btn');

// Attachment Inputs
const photoInput = document.getElementById('photoInput');
const cameraInput = document.getElementById('cameraInput');
const fileInput = document.getElementById('fileInput');

const btnPickPhoto = document.getElementById('btnPickPhoto');
const btnPickCamera = document.getElementById('btnPickCamera');
const btnPickFile = document.getElementById('btnPickFile');
const textShareInput = document.getElementById('textShareInput');
const btnSendText = document.getElementById('btnSendText');

// Composer Modal
const composerModal = document.getElementById('composerModal');
const closeComposerBtn = document.getElementById('closeComposerBtn');
const composerTray = document.getElementById('composerTray');
const composerCountBadge = document.getElementById('composerCountBadge');
const composerCaptionInput = document.getElementById('composerCaptionInput');
const btnConfirmUpload = document.getElementById('btnConfirmUpload');

// Lightbox
const lightboxModal = document.getElementById('lightboxModal');
const closeLightboxBtn = document.getElementById('closeLightboxBtn');
const lightboxContent = document.getElementById('lightboxContent');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  fetchServerInfo();
  fetchInitialData();
  setupSSE();
  setupEventListeners();
  setupLightboxEvents();
  setupDragAndDrop();
});

// Fetch Server IP & QR Code Data
async function fetchServerInfo() {
  try {
    const res = await fetch('/api/info');
    serverInfo = await res.json();

    ipDisplay.textContent = serverInfo.serverUrl.replace(/^https?:\/\//, '');
    fullUrlCode.textContent = serverInfo.serverUrl;
    qrCodeImg.src = serverInfo.qrCodeDataUrl;
  } catch (e) {
    ipDisplay.textContent = 'Offline / Error';
  }
}

// Fetch Initial Shared Items
async function fetchInitialData() {
  try {
    const [filesRes, textRes] = await Promise.all([
      fetch('/api/files'),
      fetch('/api/text')
    ]);

    const files = await filesRes.json();
    const texts = await textRes.json();

    const formattedFiles = files.map(f => ({ ...f, type: 'file' }));
    const formattedTexts = (texts || []).map(t => ({ ...t, type: 'text' }));

    itemsList = [...formattedFiles, ...formattedTexts].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    renderGrid();
  } catch (e) {
    console.error('Failed to load initial data:', e);
  }
}

// Setup Real-time SSE Connection
function setupSSE() {
  const evtSource = new EventSource('/api/events');

  evtSource.addEventListener('file_added', (e) => {
    const newFile = JSON.parse(e.data);
    newFile.type = 'file';

    // Remove any optimistic uploading card matching originalName or filename
    itemsList = itemsList.filter(item => {
      if (item.id === newFile.filename) return false;
      if (item.uploading && item.originalName === newFile.originalName) return false;
      return true;
    });

    // Avoid duplicate insertions if already added
    if (!itemsList.some(item => item.id === newFile.filename)) {
      itemsList.unshift(newFile);
    }
    renderGrid();
  });

  evtSource.addEventListener('text_added', (e) => {
    const newText = JSON.parse(e.data);
    newText.type = 'text';

    if (!itemsList.some(item => item.id === newText.id)) {
      itemsList.unshift(newText);
      renderGrid();
    }
  });

  evtSource.addEventListener('file_deleted', (e) => {
    const data = JSON.parse(e.data);
    itemsList = itemsList.filter(item => item.filename !== data.filename && item.id !== data.filename);
    renderGrid();
  });

  evtSource.addEventListener('server_shutdown', () => {
    showShutdownOverlay();
  });
}

// Setup Event Listeners
function setupEventListeners() {
  // QR Code Modal
  openQrBtn.addEventListener('click', () => qrModal.classList.remove('hidden'));
  closeQrBtn.addEventListener('click', () => qrModal.classList.add('hidden'));
  qrModal.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) qrModal.classList.add('hidden');
  });

  const stopServerBtn = document.getElementById('stopServerBtn');
  if (stopServerBtn) {
    stopServerBtn.addEventListener('click', stopServer);
  }

  copyUrlBtn.addEventListener('click', () => {
    if (serverInfo) {
      navigator.clipboard.writeText(serverInfo.serverUrl);
      copyUrlBtn.textContent = 'Copied!';
      setTimeout(() => copyUrlBtn.textContent = 'Copy', 2000);
    }
  });

  // Dock Action Pickers
  btnPickPhoto.addEventListener('click', () => photoInput.click());
  btnPickCamera.addEventListener('click', () => cameraInput.click());
  btnPickFile.addEventListener('click', () => fileInput.click());

  photoInput.addEventListener('change', (e) => handleFileSelect(e.target.files));
  cameraInput.addEventListener('change', (e) => handleFileSelect(e.target.files));
  fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files));

  // Quick Text Send
  btnSendText.addEventListener('click', sendTextSnippet);
  textShareInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendTextSnippet();
  });

  // Composer Modal Actions
  closeComposerBtn.addEventListener('click', closeComposer);
  btnConfirmUpload.addEventListener('click', uploadSelectedFiles);

  // Filter Tabs
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.getAttribute('data-filter');
      renderGrid();
    });
  });

  // Lightbox Close
  closeLightboxBtn.addEventListener('click', closeLightbox);
  lightboxModal.addEventListener('click', (e) => {
    if (e.target.classList.contains('lightbox-backdrop')) closeLightbox();
  });
}

// Drag and Drop Logic for Desktop
function setupDragAndDrop() {
  ['dragenter', 'dragover'].forEach(eventName => {
    document.body.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropOverlay.classList.remove('hidden');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.target === dropOverlay || eventName === 'drop') {
        dropOverlay.classList.add('hidden');
      }
    });
  });

  document.body.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files);
    }
  });
}

// Handle File Selection (WhatsApp/Instagram Style Pre-upload composer)
function handleFileSelect(fileList) {
  if (!fileList || fileList.length === 0) return;

  Array.from(fileList).forEach(file => {
    const isImg = file.type.startsWith('image/');
    const isVid = file.type.startsWith('video/');
    const previewUrl = (isImg || isVid) ? URL.createObjectURL(file) : null;

    selectedFiles.push({
      id: Math.random().toString(36).substring(2, 9),
      file,
      previewUrl,
      isImage: isImg,
      isVideo: isVid
    });
  });

  photoInput.value = '';
  cameraInput.value = '';
  fileInput.value = '';

  openComposer();
}

// Open Composer Modal
function openComposer() {
  if (selectedFiles.length === 0) return;

  composerCountBadge.textContent = `${selectedFiles.length} selected`;
  renderComposerTray();
  composerModal.classList.remove('hidden');
}

// Close Composer Modal
function closeComposer() {
  composerModal.classList.add('hidden');
  selectedFiles.forEach(item => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
  selectedFiles = [];
  composerCaptionInput.value = '';
}

// Render Composer Media Tray
function renderComposerTray() {
  composerTray.innerHTML = '';
  selectedFiles.forEach(item => {
    const card = document.createElement('div');
    card.className = 'preview-thumb-card';

    if (item.isImage) {
      card.innerHTML = `<img src="${item.previewUrl}" alt="preview">`;
    } else if (item.isVideo) {
      card.innerHTML = `<video src="${item.previewUrl}#t=0.5" preload="metadata"></video>`;
    } else {
      card.innerHTML = `
        <div class="thumb-file-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          </svg>
          <span style="font-size:0.65rem; max-width:90%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.file.name}</span>
        </div>
      `;
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'thumb-remove-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.onclick = () => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      selectedFiles = selectedFiles.filter(f => f.id !== item.id);
      if (selectedFiles.length === 0) {
        closeComposer();
      } else {
        composerCountBadge.textContent = `${selectedFiles.length} selected`;
        renderComposerTray();
      }
    };

    card.appendChild(removeBtn);
    composerTray.appendChild(card);
  });
}

// Perform Upload with Live Progress
function uploadSelectedFiles() {
  if (selectedFiles.length === 0) return;

  const caption = composerCaptionInput.value.trim();
  const filesToUpload = [...selectedFiles];
  closeComposer();

  // Create Optimistic Upload Items in Grid
  filesToUpload.forEach(item => {
    const tempId = `temp_${item.id}`;
    const optimisticObj = {
      id: tempId,
      filename: item.file.name,
      originalName: item.file.name,
      size: item.file.size,
      createdAt: new Date().toISOString(),
      isImage: item.isImage,
      isVideo: item.isVideo,
      isAudio: item.file.type.startsWith('audio/'),
      type: 'file',
      uploading: true,
      progress: 0,
      previewUrl: item.previewUrl
    };
    itemsList.unshift(optimisticObj);
  });

  renderGrid();

  const formData = new FormData();
  filesToUpload.forEach(item => {
    formData.append('files', item.file);
  });
  if (caption) {
    formData.append('caption', caption);
  }

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload', true);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      filesToUpload.forEach(item => {
        const cardElem = document.getElementById(`card_temp_${item.id}`);
        if (cardElem) {
          const spinner = cardElem.querySelector('.progress-spinner');
          if (spinner) spinner.textContent = `${percent}%`;
        }
      });
    }
  };

  xhr.onload = () => {
    const tempIds = filesToUpload.map(f => `temp_${f.id}`);
    filesToUpload.forEach(item => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });

    if (xhr.status >= 200 && xhr.status < 300) {
      // Remove temporary cards once response arrives
      itemsList = itemsList.filter(i => !tempIds.includes(i.id));
      
      // If server returned array of saved files directly, merge any missing ones
      try {
        const resData = JSON.parse(xhr.responseText);
        if (resData.files && Array.isArray(resData.files)) {
          resData.files.forEach(sf => {
            sf.type = 'file';
            if (!itemsList.some(i => i.id === sf.filename)) {
              itemsList.unshift(sf);
            }
          });
        }
      } catch (e) {}

      renderGrid();
    } else {
      alert('Upload failed. Please check network connection.');
      itemsList = itemsList.filter(i => !tempIds.includes(i.id));
      renderGrid();
    }
  };

  xhr.onerror = () => {
    alert('Upload error.');
    const tempIds = filesToUpload.map(f => `temp_${f.id}`);
    filesToUpload.forEach(item => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    itemsList = itemsList.filter(i => !tempIds.includes(i.id));
    renderGrid();
  };

  xhr.send(formData);
}

// Send Text Snippet / Note
async function sendTextSnippet() {
  const text = textShareInput.value.trim();
  if (!text) return;

  textShareInput.value = '';

  try {
    await fetch('/api/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
  } catch (e) {
    alert('Failed to send text snippet');
  }
}

// Delete Shared File
async function deleteFile(filename) {
  if (!confirm(`Delete "${filename}"?`)) return;

  try {
    await fetch(`/api/files/${encodeURIComponent(filename)}`, { method: 'DELETE' });
  } catch (e) {
    alert('Failed to delete file');
  }
}

// Interactive Lightbox State (Zoom & Pan)
let zoomScale = 1;
let panX = 0;
let panY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;
let initialPinchDistance = 0;
let initialPinchScale = 1;

const lightboxViewport = document.getElementById('lightboxViewport');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const resetZoomBtn = document.getElementById('resetZoomBtn');
const zoomLevelDisplay = document.getElementById('zoomLevelDisplay');
const lightboxFileName = document.getElementById('lightboxFileName');
const lightboxDownloadBtn = document.getElementById('lightboxDownloadBtn');

// Open Lightbox with Zoom & Pan Reset
function openLightbox(src, isVid = false, filename = 'Media Preview') {
  lightboxFileName.textContent = filename;
  lightboxDownloadBtn.href = `${src}?download=1`;
  lightboxDownloadBtn.download = filename;

  lightboxContent.innerHTML = isVid
    ? `<video src="${src}" controls autoplay></video>`
    : `<img src="${src}" alt="lightbox">`;

  resetZoom();
  lightboxModal.classList.remove('hidden');
}

// Close Lightbox
function closeLightbox() {
  lightboxModal.classList.add('hidden');
  lightboxContent.innerHTML = '';
  resetZoom();
}

function updateTransform() {
  lightboxContent.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoomScale})`;
  zoomLevelDisplay.textContent = `${Math.round(zoomScale * 100)}%`;
}

function setZoom(scale, centerX = 0, centerY = 0) {
  const newScale = Math.min(Math.max(scale, 0.5), 5); // 50% to 500% bounds
  zoomScale = newScale;

  // Reset pan offset if zoomed back to 100% or smaller
  if (zoomScale <= 1) {
    panX = 0;
    panY = 0;
  }
  updateTransform();
}

function resetZoom() {
  zoomScale = 1;
  panX = 0;
  panY = 0;
  updateTransform();
}

// Setup Interactive Lightbox Controls (Mouse & Touch Pan/Pinch)
function setupLightboxEvents() {
  if (!lightboxViewport) return;

  // Zoom Buttons
  if (zoomInBtn) zoomInBtn.addEventListener('click', () => setZoom(zoomScale * 1.25));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => setZoom(zoomScale / 1.25));
  if (resetZoomBtn) resetZoomBtn.addEventListener('click', resetZoom);

  // Mouse Wheel Zoom
  lightboxViewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(zoomScale * delta);
  }, { passive: false });

  // Mouse Drag Pan
  lightboxViewport.addEventListener('mousedown', (e) => {
    if (e.target.closest('.lightbox-toolbar')) return;
    if (zoomScale <= 1) return; // Only pan when zoomed in
    isDragging = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    updateTransform();
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Touch Pinch-to-Zoom & Pan (Mobile iOS/Android)
  lightboxViewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      // Pinch gesture start
      initialPinchDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialPinchScale = zoomScale;
    } else if (e.touches.length === 1 && zoomScale > 1) {
      // Single finger pan when zoomed in
      isDragging = true;
      startX = e.touches[0].clientX - panX;
      startY = e.touches[0].clientY - panY;
    }
  }, { passive: true });

  lightboxViewport.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && initialPinchDistance > 0) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scaleFactor = currentDist / initialPinchDistance;
      setZoom(initialPinchScale * scaleFactor);
    } else if (e.touches.length === 1 && isDragging) {
      panX = e.touches[0].clientX - startX;
      panY = e.touches[0].clientY - startY;
      updateTransform();
    }
  }, { passive: true });

  lightboxViewport.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) initialPinchDistance = 0;
    if (e.touches.length === 0) isDragging = false;
  });

  // Keyboard Shortcuts (Esc to close, +/- to zoom)
  window.addEventListener('keydown', (e) => {
    if (lightboxModal.classList.contains('hidden')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === '=' || e.key === '+') setZoom(zoomScale * 1.2);
    if (e.key === '-') setZoom(zoomScale / 1.2);
    if (e.key === '0') resetZoom();
  });
}

// Render Gallery Grid
function renderGrid() {
  const filtered = itemsList.filter(item => {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'media') return item.isImage || item.isVideo;
    if (currentFilter === 'files') return item.type === 'file' && !item.isImage && !item.isVideo;
    if (currentFilter === 'text') return item.type === 'text';
    return true;
  });

  itemCount.textContent = `${filtered.length} item${filtered.length === 1 ? '' : 's'} shared`;

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    mediaGrid.innerHTML = '';
    return;
  }

  emptyState.classList.add('hidden');
  mediaGrid.innerHTML = '';

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.id = `card_${item.id}`;
    card.className = `item-card ${item.uploading ? 'uploading' : ''}`;

    if (item.type === 'text') {
      card.innerHTML = `
        <div class="card-body">
          <div class="card-text-content">${escapeHtml(item.text)}</div>
          <div class="card-meta">
            <span>Note</span>
            <span>${formatTime(item.createdAt)}</span>
          </div>
          <div class="card-actions">
            <button class="action-btn copy-text-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              <span>Copy Note</span>
            </button>
          </div>
        </div>
      `;

      const copyBtn = card.querySelector('.copy-text-btn');
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(item.text);
        copyBtn.querySelector('span').textContent = 'Copied!';
        setTimeout(() => copyBtn.querySelector('span').textContent = 'Copy Note', 2000);
      };
    } else {
      const mediaSrc = item.previewUrl || item.thumbnailUrl || item.url;
      const fullMediaSrc = item.url;

      let mediaHtml = '';
      if (item.isImage) {
        mediaHtml = `
          <div class="card-media">
            <img src="${mediaSrc}" alt="${escapeHtml(item.originalName)}" loading="lazy" decoding="async">
          </div>
        `;
      } else if (item.isVideo) {
        mediaHtml = `
          <div class="card-media">
            <video src="${mediaSrc}#t=0.5" preload="metadata"></video>
          </div>
        `;
      } else {
        mediaHtml = `
          <div class="card-media">
            <div class="card-media-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
          </div>
        `;
      }

      const progressHtml = item.uploading
        ? `<div class="progress-spinner">0%</div>`
        : '';

      card.innerHTML = `
        ${mediaHtml}
        ${progressHtml}
        <div class="card-body">
          <div class="card-title" title="${escapeHtml(item.originalName)}">${escapeHtml(item.originalName)}</div>
          <div class="card-meta">
            <span>${formatBytes(item.size)}</span>
            <span>${formatTime(item.createdAt)}</span>
          </div>
          ${!item.uploading ? `
            <div class="card-actions">
              <a href="${item.url}?download=1" download="${escapeHtml(item.originalName)}" class="action-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <span>Save</span>
              </a>
              <button class="action-btn delete-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <span>Delete</span>
              </button>
            </div>
          ` : ''}
        </div>
      `;

      if (!item.uploading && (item.isImage || item.isVideo)) {
        const mediaContainer = card.querySelector('.card-media');
        mediaContainer.style.cursor = 'pointer';
        mediaContainer.onclick = () => openLightbox(fullMediaSrc, item.isVideo, item.originalName);
      }

      const delBtn = card.querySelector('.delete-btn');
      if (delBtn) {
        delBtn.onclick = () => deleteFile(item.filename);
      }
    }

    mediaGrid.appendChild(card);
  });
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[m]);
}

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Graceful Remote Shutdown
async function stopServer() {
  if (!confirm('Are you sure you want to stop the Network Sharer server?')) return;

  try {
    await fetch('/api/shutdown', { method: 'POST' });
    showShutdownOverlay();
  } catch (e) {
    showShutdownOverlay();
  }
}

function showShutdownOverlay() {
  const shutdownOverlay = document.getElementById('shutdownOverlay');
  if (shutdownOverlay) {
    shutdownOverlay.classList.remove('hidden');
  }
}
