// State
let selectedFormat = 'video-best';
let selectedVideo = null;
let downloads = [];
let currentTab = 'download';
let clipboardUrl = null;
let trimEnabled = false;
let selectedScheduleTime = null;

// DOM Elements
const urlInput = document.getElementById('urlInput');
const urlIndicator = document.getElementById('urlIndicator');
const downloadBtn = document.getElementById('downloadBtn');
const downloadsList = document.getElementById('downloadsList');
const downloadsBadge = document.getElementById('downloadsBadge');
const searchResults = document.getElementById('searchResults');
const resultsList = document.getElementById('resultsList');
const selectedVideoEl = document.getElementById('selectedVideo');

// Window Controls
document.getElementById('minimizeBtn').addEventListener('click', () => window.electronAPI.minimizeWindow());
document.getElementById('maximizeBtn').addEventListener('click', () => window.electronAPI.maximizeWindow());
document.getElementById('closeBtn').addEventListener('click', () => window.electronAPI.closeWindow());

// Tab Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    if (!tabId) return;
    
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    
    const tabEl = document.getElementById(tabId + 'Tab');
    if (tabEl) {
      tabEl.classList.add('active');
      currentTab = tabId;
      
      // Load tab data
      if (tabId === 'history') loadHistory();
      if (tabId === 'scheduled') loadScheduled();
    }
  });
});

// URL Input
let inputTimeout;
urlInput.addEventListener('input', () => {
  clearTimeout(inputTimeout);
  const value = urlInput.value.trim();
  
  if (!value) {
    urlInput.classList.remove('valid', 'invalid');
    urlIndicator.classList.remove('valid', 'invalid');
    searchResults.style.display = 'none';
    if (!selectedVideo) downloadBtn.disabled = true;
    return;
  }
  
  inputTimeout = setTimeout(async () => {
    const isUrl = value.includes('youtube.com') || value.includes('youtu.be');
    
    if (isUrl) {
      const isValid = await window.electronAPI.validateUrl(value);
      urlInput.classList.toggle('valid', isValid);
      urlInput.classList.toggle('invalid', !isValid);
      urlIndicator.classList.toggle('valid', isValid);
      urlIndicator.classList.toggle('invalid', !isValid);
      searchResults.style.display = 'none';
      
      if (isValid) {
        const isChannel = await window.electronAPI.isChannelUrl(value);
        const isPlaylist = value.includes('list=') && !value.includes('v=');
        
        if (isChannel) {
          selectedVideo = {
            url: value,
            title: 'YouTube Channel',
            author: '',
            thumbnail: null,
            isChannel: true
          };
          document.getElementById('playlistSelection').style.display = 'none';
          downloadBtn.disabled = false;
        } else if (isPlaylist) {
          selectedVideo = {
            url: value,
            title: 'YouTube Playlist',
            author: '',
            thumbnail: null,
            isPlaylist: true
          };
          // Load playlist videos for selection
          loadPlaylistVideos(value);
          downloadBtn.disabled = false;
        } else {
          // Single video - get info
          document.getElementById('playlistSelection').style.display = 'none';
          const info = await window.electronAPI.getVideoInfo(value);
          selectedVideo = {
            url: value,
            title: info.success ? info.title : 'YouTube Video',
            author: info.success ? info.author : '',
            thumbnail: info.success ? info.thumbnail : null,
            duration: info.success ? info.duration : 0,
            durationString: info.success ? info.durationString : ''
          };
          
          // Show selected video card
          document.getElementById('selectedThumb').src = selectedVideo.thumbnail || '';
          document.getElementById('selectedTitle').textContent = selectedVideo.title;
          document.getElementById('selectedMeta').textContent = selectedVideo.author + (selectedVideo.durationString ? ` • ${selectedVideo.durationString}` : '');
          selectedVideoEl.style.display = 'block';
          
          // Update trim hint with video duration
          if (selectedVideo.duration > 0) {
            document.getElementById('trimHint').textContent = `Video duration: ${selectedVideo.durationString}. Format: minutes:seconds (e.g., 1:30)`;
          }
          
          downloadBtn.disabled = false;
        }
      } else {
        if (!selectedVideo) downloadBtn.disabled = true;
      }
    } else {
      urlInput.classList.remove('valid', 'invalid');
      urlIndicator.classList.remove('valid', 'invalid');
      performSearch(value);
    }
  }, 500);
});

// Search YouTube
async function performSearch(query) {
  if (query.length < 2) {
    searchResults.style.display = 'none';
    return;
  }
  
  searchResults.style.display = 'block';
  resultsList.innerHTML = `
    <div class="searching-indicator">
      <div class="spinner-small"></div>
      <p>Searching...</p>
    </div>
  `;
  
  const results = await window.electronAPI.searchYouTube(query);
  
  if (results.success && results.videos.length > 0) {
    resultsList.innerHTML = results.videos.map(v => `
      <div class="result-item" data-url="${escapeHtml(v.url)}" data-title="${escapeHtml(v.title)}" data-author="${escapeHtml(v.author)}" data-thumb="${escapeHtml(v.thumbnail)}" data-duration="${v.duration || ''}">
        <img src="${v.thumbnail}" alt="" onerror="this.style.display='none'">
        <div class="result-info">
          <div class="result-title">${escapeHtml(v.title)}</div>
          <div class="result-meta">${escapeHtml(v.author)} • ${v.duration || ''}</div>
        </div>
      </div>
    `).join('');
    
    resultsList.querySelectorAll('.result-item').forEach(item => {
      item.addEventListener('click', () => selectVideo(item));
    });
  } else {
    resultsList.innerHTML = `<div class="searching-indicator"><p>No results found</p></div>`;
  }
}

// Select a video from search results
function selectVideo(item) {
  selectedVideo = {
    url: item.dataset.url,
    title: item.dataset.title,
    author: item.dataset.author,
    thumbnail: item.dataset.thumb,
    durationString: item.dataset.duration
  };
  
  document.getElementById('selectedThumb').src = selectedVideo.thumbnail || '';
  document.getElementById('selectedTitle').textContent = selectedVideo.title;
  document.getElementById('selectedMeta').textContent = selectedVideo.author + (selectedVideo.durationString ? ` • ${selectedVideo.durationString}` : '');
  selectedVideoEl.style.display = 'block';
  
  searchResults.style.display = 'none';
  urlInput.value = '';
  urlInput.classList.remove('valid', 'invalid');
  urlIndicator.classList.remove('valid', 'invalid');
  
  downloadBtn.disabled = false;
}

// Clear handlers
document.getElementById('clearSearchBtn')?.addEventListener('click', () => {
  searchResults.style.display = 'none';
  urlInput.value = '';
});

document.getElementById('clearSelectedBtn')?.addEventListener('click', () => {
  selectedVideo = null;
  selectedVideoEl.style.display = 'none';
  document.getElementById('trimSection').style.display = 'none';
  downloadBtn.disabled = true;
});

// Paste handler
urlInput.addEventListener('paste', () => {
  setTimeout(() => urlInput.dispatchEvent(new Event('input')), 50);
});

// Format Selection
document.querySelectorAll('.format-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedFormat = btn.dataset.format;
  });
});

// Schedule Presets
document.querySelectorAll('.schedule-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    const minutes = btn.dataset.minutes;
    const preset = btn.dataset.preset;
    
    if (preset === 'custom') {
      // Show custom datetime picker
      document.getElementById('scheduleCustom').style.display = 'flex';
      return;
    }
    
    let scheduledDate = new Date();
    
    if (minutes) {
      // Add minutes from now
      scheduledDate.setMinutes(scheduledDate.getMinutes() + parseInt(minutes));
    } else if (preset === 'tonight') {
      // Tonight at 10 PM
      scheduledDate.setHours(22, 0, 0, 0);
      if (scheduledDate <= new Date()) {
        // Already past 10 PM, schedule for tomorrow night
        scheduledDate.setDate(scheduledDate.getDate() + 1);
      }
    } else if (preset === 'tomorrow') {
      // Tomorrow at 9 AM
      scheduledDate.setDate(scheduledDate.getDate() + 1);
      scheduledDate.setHours(9, 0, 0, 0);
    }
    
    setScheduleTime(scheduledDate, btn.textContent);
  });
});

function setScheduleTime(date, label) {
  selectedScheduleTime = date;
  document.getElementById('scheduleCustom').style.display = 'none';
  const selectedEl = document.getElementById('scheduleSelected');
  selectedEl.style.display = 'flex';
  
  // Format the display time
  const timeStr = date.toLocaleString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric',
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
  document.getElementById('scheduleSelectedText').textContent = `📅 ${timeStr}`;
  
  // Highlight all preset buttons
  document.querySelectorAll('.schedule-preset').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.schedule-preset').forEach(b => {
    if (b.textContent === label) b.classList.add('active');
  });
}

function confirmCustomSchedule() {
  const input = document.getElementById('scheduleTime');
  if (!input.value) {
    showToast('Please select a date and time', 'error');
    return;
  }
  const date = new Date(input.value);
  if (date <= new Date()) {
    showToast('Please select a future time', 'error');
    return;
  }
  setScheduleTime(date, 'Custom');
}

function clearSchedule() {
  selectedScheduleTime = null;
  document.getElementById('scheduleSelected').style.display = 'none';
  document.getElementById('scheduleCustom').style.display = 'none';
  document.querySelectorAll('.schedule-preset').forEach(b => b.classList.remove('active'));
}

// Make functions available globally for onclick handlers
window.confirmCustomSchedule = confirmCustomSchedule;
window.clearSchedule = clearSchedule;

// Trim toggle
document.getElementById('trimToggle')?.addEventListener('change', (e) => {
  trimEnabled = e.target.checked;
  document.getElementById('trimInputs').style.display = trimEnabled ? 'block' : 'none';
  document.getElementById('trimOption')?.classList.toggle('active', trimEnabled);
});

// Subtitle toggle
document.getElementById('subtitleToggle')?.addEventListener('change', (e) => {
  document.getElementById('subtitleOptions').style.display = e.target.checked ? 'block' : 'none';
  document.getElementById('subtitleOption')?.classList.toggle('active', e.target.checked);
});

// Playlist selection
let playlistVideos = [];
let selectedPlaylistVideos = new Set();

window.selectAllPlaylist = function() {
  playlistVideos.forEach(v => selectedPlaylistVideos.add(v.url));
  renderPlaylistSelection();
};

window.deselectAllPlaylist = function() {
  selectedPlaylistVideos.clear();
  renderPlaylistSelection();
};

window.togglePlaylistVideo = function(url) {
  if (selectedPlaylistVideos.has(url)) {
    selectedPlaylistVideos.delete(url);
  } else {
    selectedPlaylistVideos.add(url);
  }
  renderPlaylistSelection();
};

function renderPlaylistSelection() {
  const container = document.getElementById('playlistVideos');
  container.innerHTML = playlistVideos.map((v, i) => `
    <div class="playlist-video-item ${selectedPlaylistVideos.has(v.url) ? 'selected' : ''}" onclick="togglePlaylistVideo('${v.url}')">
      <input type="checkbox" ${selectedPlaylistVideos.has(v.url) ? 'checked' : ''} onclick="event.stopPropagation(); togglePlaylistVideo('${v.url}')">
      <span class="video-number">${i + 1}</span>
      <span class="video-title">${escapeHtml(v.title)}</span>
      <span class="video-duration">${v.duration || ''}</span>
    </div>
  `).join('');
}

async function loadPlaylistVideos(url) {
  const container = document.getElementById('playlistVideos');
  container.innerHTML = '<div class="loading">Loading playlist videos...</div>';
  document.getElementById('playlistSelection').style.display = 'block';
  
  try {
    const result = await window.electronAPI.getPlaylistVideos(url);
    if (result.success && result.videos) {
      playlistVideos = result.videos;
      selectedPlaylistVideos = new Set(playlistVideos.map(v => v.url));
      renderPlaylistSelection();
    } else {
      container.innerHTML = '<div class="error">Failed to load playlist videos</div>';
    }
  } catch (err) {
    container.innerHTML = '<div class="error">Error loading playlist</div>';
  }
}

// Download button
downloadBtn.addEventListener('click', startDownload);

async function startDownload() {
  if (!selectedVideo && !urlInput.value.trim()) return;
  
  const url = selectedVideo ? selectedVideo.url : urlInput.value.trim();
  const title = selectedVideo ? selectedVideo.title : 'YouTube Video';
  const isAudio = selectedFormat === 'audio';
  const isChannel = selectedVideo?.isChannel;
  const isPlaylist = selectedVideo?.isPlaylist || (url.includes('list=') && !url.includes('v='));
  
  // Get trim values
  let trimStart = null, trimEnd = null;
  if (trimEnabled) {
    const startVal = document.getElementById('trimStart')?.value;
    const endVal = document.getElementById('trimEnd')?.value;
    if (startVal) trimStart = parseTimeToSeconds(startVal);
    if (endVal) trimEnd = parseTimeToSeconds(endVal);
  }
  
  // Get subtitle options
  const subtitleEnabled = document.getElementById('subtitleToggle')?.checked || false;
  const subtitleLang = subtitleEnabled ? (document.getElementById('subtitleSelect')?.value || 'en') : null;
  const embedSubs = subtitleEnabled ? (document.getElementById('embedSubtitles')?.checked || false) : false;
  
  // Clear input
  urlInput.value = '';
  urlInput.classList.remove('valid', 'invalid');
  urlIndicator.classList.remove('valid', 'invalid');
  selectedVideo = null;
  selectedVideoEl.style.display = 'none';
  searchResults.style.display = 'none';
  document.getElementById('trimSection').style.display = 'none';
  document.getElementById('subtitleSection').style.display = 'none';
  document.getElementById('playlistSelection').style.display = 'none';
  downloadBtn.disabled = true;
  
  // Switch to downloads tab
  document.querySelector('[data-tab="downloads"]').click();
  
  // Map format to quality
  let format = null;
  if (selectedFormat === 'video-720') format = { quality: '720p' };
  else if (selectedFormat === 'video-480') format = { quality: '480p' };
  else if (selectedFormat === 'video-1080') format = { quality: '1080p' };
  
  if (isChannel) {
    showToast('Fetching channel videos...', 'info');
    const channelResult = await window.electronAPI.getChannelVideos(url, 20);
    
    if (!channelResult.success) {
      showToast(`Failed: ${channelResult.error}`, 'error');
      return;
    }
    
    showToast(`Found ${channelResult.videos.length} videos`, 'success');
    await downloadMultipleVideos(channelResult.videos, isAudio, format, subtitleLang, embedSubs);
    
  } else if (isPlaylist) {
    // Use selected videos from playlist selection UI
    const videosToDownload = playlistVideos.filter(v => selectedPlaylistVideos.has(v.url));
    
    if (videosToDownload.length === 0) {
      showToast('Please select at least one video to download', 'error');
      return;
    }
    
    showToast(`Downloading ${videosToDownload.length} videos`, 'success');
    await downloadMultipleVideos(videosToDownload, isAudio, format, subtitleLang, embedSubs);
    
    // Clear playlist selection
    playlistVideos = [];
    selectedPlaylistVideos.clear();
    
  } else {
    // Single video
    const downloadId = Date.now().toString();
    
    const download = {
      id: downloadId,
      title: title,
      format: isAudio ? 'MP3' : (format?.quality || 'Best'),
      type: isAudio ? 'audio' : 'video',
      progress: 0,
      status: 'queued',
      url: url,
      speed: '',
      eta: ''
    };
    
    downloads.unshift(download);
    updateBadge();
    renderDownloads();
    
    try {
      await window.electronAPI.startDownload({
        url, format, type: isAudio ? 'audio' : 'video',
        downloadId, title, trimStart, trimEnd, subtitleLang, embedSubs
      });
    } catch (error) {
      updateDownloadStatus(downloadId, 'error', error.message);
    }
  }
}

async function downloadMultipleVideos(videos, isAudio, format, subtitleLang, embedSubs) {
  const videoDownloads = videos.map((video, index) => ({
    id: `${Date.now()}-${index}`,
    title: video.title,
    format: isAudio ? 'MP3' : (format?.quality || 'Best'),
    type: isAudio ? 'audio' : 'video',
    progress: 0,
    status: 'queued',
    url: video.url,
    speed: '',
    eta: ''
  }));
  
  downloads.unshift(...videoDownloads);
  updateBadge();
  renderDownloads();
  
  for (const download of videoDownloads) {
    try {
      download.status = 'downloading';
      renderDownloads();
      
      await window.electronAPI.startDownload({
        url: download.url,
        format: format,
        type: isAudio ? 'audio' : 'video',
        downloadId: download.id,
        title: download.title,
        subtitleLang, embedSubs
      });
    } catch (error) {
      download.status = 'error';
      download.error = error.message;
      renderDownloads();
    }
  }
}

// Schedule download
async function scheduleDownload() {
  if (!selectedVideo && !urlInput.value.trim()) {
    showToast('Please enter a URL or select a video first', 'error');
    return;
  }
  
  if (!selectedScheduleTime) {
    showToast('Please select a schedule time first', 'error');
    return;
  }
  
  const url = selectedVideo ? selectedVideo.url : urlInput.value.trim();
  const title = selectedVideo ? selectedVideo.title : 'YouTube Video';
  const isAudio = selectedFormat === 'audio';
  
  let format = null;
  if (selectedFormat === 'video-720') format = { quality: '720p' };
  else if (selectedFormat === 'video-480') format = { quality: '480p' };
  else if (selectedFormat === 'video-1080') format = { quality: '1080p' };
  
  await window.electronAPI.scheduleDownload({
    url, title, format,
    type: isAudio ? 'audio' : 'video',
    scheduledTime: selectedScheduleTime.toISOString()
  });
  
  showToast('Download scheduled!', 'success');
  
  // Clear selection
  urlInput.value = '';
  selectedVideo = null;
  selectedVideoEl.style.display = 'none';
  downloadBtn.disabled = true;
  clearSchedule();
  
  // Switch to scheduled tab
  document.querySelector('[data-tab="scheduled"]').click();
}

// Download Progress Listener
window.electronAPI.onDownloadProgress((data) => {
  const download = downloads.find(d => d.id === data.id);
  if (download) {
    download.progress = data.progress;
    download.status = data.status;
    download.speed = data.speed || '';
    download.eta = data.eta || '';
    
    if (data.status === 'completed') {
      download.filePath = data.filePath;
    } else if (data.status === 'error') {
      download.error = data.error;
    }
    
    renderDownloads();
    updateBadge();
  }
});

// Clipboard URL detected
window.electronAPI.onClipboardUrlDetected((url) => {
  clipboardUrl = url;
  showClipboardToast(url);
});

// Scheduled download ready
window.electronAPI.onScheduledDownloadReady(async (item) => {
  showToast(`Starting scheduled download: ${item.title}`, 'info');
  
  const downloadId = Date.now().toString();
  const download = {
    id: downloadId,
    title: item.title,
    format: item.format?.quality || (item.type === 'audio' ? 'MP3' : 'Best'),
    type: item.type,
    progress: 0,
    status: 'queued',
    url: item.url,
    speed: '',
    eta: ''
  };
  
  downloads.unshift(download);
  updateBadge();
  renderDownloads();
  
  // Remove from scheduled
  await window.electronAPI.cancelScheduled(item.id);
  
  await window.electronAPI.startDownload({
    url: item.url,
    format: item.format,
    type: item.type,
    downloadId,
    title: item.title
  });
});

function showClipboardToast(url) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast clipboard-toast';
  toast.innerHTML = `
    <div class="clipboard-toast-content">
      <p>YouTube URL detected!</p>
      <div class="clipboard-toast-actions">
        <button class="btn-small" onclick="addClipboardUrl()">Add</button>
        <button class="btn-small secondary" onclick="this.closest('.toast').remove()">Dismiss</button>
      </div>
    </div>
  `;
  container.appendChild(toast);
  
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 10000);
}

window.addClipboardUrl = async function() {
  if (clipboardUrl) {
    urlInput.value = clipboardUrl;
    urlInput.dispatchEvent(new Event('input'));
    clipboardUrl = null;
  }
  document.querySelectorAll('.clipboard-toast').forEach(t => t.remove());
};

function updateDownloadStatus(id, status, error = null) {
  const download = downloads.find(d => d.id === id);
  if (download) {
    download.status = status;
    if (error) download.error = error;
    renderDownloads();
    updateBadge();
  }
}

function renderDownloads() {
  if (downloads.length === 0) {
    downloadsList.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7,10 12,15 17,10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <p>No downloads yet</p>
        <span>Your downloads will appear here</span>
      </div>
    `;
    return;
  }
  
  downloadsList.innerHTML = downloads.map(d => `
    <div class="download-item" data-id="${d.id}">
      <div class="icon ${d.type}">
        ${d.type === 'audio' 
          ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
          : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10,9 15,12 10,15"/></svg>'
        }
      </div>
      <div class="info">
        <div class="title">${escapeHtml(d.title)}</div>
        <div class="meta">${d.format} • ${d.type === 'audio' ? 'Audio' : 'Video'}</div>
        ${(d.status === 'downloading' || d.status === 'starting') && (d.speed || d.eta) ? `
          <div class="download-stats">
            ${d.speed ? `
              <div class="stat-item speed">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
                <span class="value">${d.speed}</span>
              </div>
            ` : ''}
            ${d.eta ? `
              <div class="stat-item eta">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
                </svg>
                <span class="label">ETA:</span>
                <span class="value">${d.eta}</span>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
      ${d.status === 'downloading' || d.status === 'starting' || d.status === 'paused' ? `
        <div class="progress-section">
          <div class="progress-bar ${d.status === 'paused' ? 'paused' : ''}">
            <div class="progress-fill" style="width: ${d.progress}%"></div>
          </div>
          <div class="progress-text">${Math.round(d.progress)}%</div>
        </div>
      ` : ''}
      <span class="status ${d.status}">${d.status}</span>
      <div class="actions">
        ${d.status === 'completed' && d.filePath ? `
          <button class="action-btn" onclick="openFile('${escapeJs(d.filePath)}')" title="Open folder">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
        ` : ''}
        ${d.status === 'downloading' || d.status === 'starting' ? `
          <button class="action-btn pause" onclick="pauseDownload('${d.id}')" title="Pause">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
            </svg>
          </button>
          <button class="action-btn cancel" onclick="cancelDownload('${d.id}')" title="Cancel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        ` : ''}
        ${d.status === 'paused' ? `
          <button class="action-btn resume" onclick="resumeDownload('${d.id}')" title="Resume">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
          </button>
          <button class="action-btn cancel" onclick="cancelDownload('${d.id}')" title="Cancel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        ` : ''}
        ${d.status === 'error' ? `
          <button class="action-btn retry" onclick="retryDownload('${d.id}')" title="Retry">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

function updateBadge() {
  const activeCount = downloads.filter(d => 
    d.status === 'downloading' || d.status === 'starting' || d.status === 'queued' || d.status === 'paused'
  ).length;
  
  downloadsBadge.textContent = activeCount;
  downloadsBadge.style.display = activeCount > 0 ? 'flex' : 'none';
}

window.cancelDownload = async function(id) {
  await window.electronAPI.cancelDownload(id);
  downloads = downloads.filter(d => d.id !== id);
  renderDownloads();
  updateBadge();
};

window.retryDownload = async function(id) {
  const download = downloads.find(d => d.id === id);
  if (download) {
    download.status = 'queued';
    download.progress = 0;
    download.error = null;
    renderDownloads();
    
    await window.electronAPI.startDownload({
      url: download.url,
      format: download.format !== 'MP3' && download.format !== 'Best' ? { quality: download.format } : null,
      type: download.type,
      downloadId: download.id,
      title: download.title
    });
  }
};

window.pauseDownload = async function(id) {
  const download = downloads.find(d => d.id === id);
  if (download) {
    await window.electronAPI.pauseDownload(id);
    download.status = 'paused';
    renderDownloads();
    showToast('Download paused', 'info');
  }
};

window.resumeDownload = async function(id) {
  const download = downloads.find(d => d.id === id);
  if (download) {
    await window.electronAPI.resumeDownload(id);
    download.status = 'downloading';
    renderDownloads();
    showToast('Download resumed', 'info');
  }
};

window.openFile = function(filePath) {
  window.electronAPI.openFileLocation(filePath);
};

// History
async function loadHistory() {
  const history = await window.electronAPI.getHistory();
  const historyList = document.getElementById('historyList');
  
  if (!history || history.length === 0) {
    historyList.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12,6 12,12 16,14"/>
        </svg>
        <p>No download history</p>
      </div>
    `;
    return;
  }
  
  historyList.innerHTML = history.map(h => `
    <div class="history-item">
      <div class="icon ${h.type}">
        ${h.type === 'audio' 
          ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
          : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10,9 15,12 10,15"/></svg>'
        }
      </div>
      <div class="info">
        <div class="title">${escapeHtml(h.title)}</div>
        <div class="meta">${h.format} • ${new Date(h.downloadedAt).toLocaleDateString()}</div>
      </div>
      <div class="actions">
        <button class="action-btn" onclick="redownloadFromHistory('${escapeJs(h.url)}', '${escapeJs(h.title)}', '${h.type}')" title="Download again">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        ${h.filePath ? `
          <button class="action-btn" onclick="openFile('${escapeJs(h.filePath)}')" title="Open folder">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
        ` : ''}
        <button class="action-btn delete" onclick="deleteHistoryItem('${h.id}')" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

window.redownloadFromHistory = async function(url, title, type) {
  const downloadId = Date.now().toString();
  const download = {
    id: downloadId, title, type,
    format: type === 'audio' ? 'MP3' : 'Best',
    progress: 0, status: 'queued', url,
    speed: '', eta: ''
  };
  
  downloads.unshift(download);
  updateBadge();
  
  document.querySelector('[data-tab="downloads"]').click();
  renderDownloads();
  
  await window.electronAPI.startDownload({
    url, type, downloadId, title
  });
};

window.deleteHistoryItem = async function(id) {
  await window.electronAPI.deleteHistoryItem(id);
  loadHistory();
};

window.clearAllHistory = async function() {
  if (confirm('Clear all download history?')) {
    await window.electronAPI.clearHistory();
    loadHistory();
    showToast('History cleared', 'success');
  }
};

// Scheduled downloads
async function loadScheduled() {
  const scheduled = await window.electronAPI.getScheduled();
  const scheduledList = document.getElementById('scheduledList');
  
  if (!scheduled || scheduled.length === 0) {
    scheduledList.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p>No scheduled downloads</p>
      </div>
    `;
    return;
  }
  
  scheduledList.innerHTML = scheduled.map(s => `
    <div class="scheduled-item">
      <div class="icon ${s.type}">
        ${s.type === 'audio' 
          ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
          : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10,9 15,12 10,15"/></svg>'
        }
      </div>
      <div class="info">
        <div class="title">${escapeHtml(s.title)}</div>
        <div class="meta">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
          ${new Date(s.scheduledTime).toLocaleString()}
        </div>
      </div>
      <span class="status ${s.status}">${s.status}</span>
      <div class="actions">
        <button class="action-btn" onclick="runScheduledNow('${s.id}')" title="Run now">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5,3 19,12 5,21 5,3"/>
          </svg>
        </button>
        <button class="action-btn delete" onclick="cancelScheduledDownload('${s.id}')" title="Cancel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

window.runScheduledNow = async function(id) {
  await window.electronAPI.runScheduledNow(id);
  loadScheduled();
};

window.cancelScheduledDownload = async function(id) {
  await window.electronAPI.cancelScheduled(id);
  loadScheduled();
  showToast('Scheduled download cancelled', 'success');
};

// Batch import
window.openBatchImport = function() {
  document.getElementById('batchModal').style.display = 'flex';
};

window.closeBatchModal = function() {
  document.getElementById('batchModal').style.display = 'none';
  document.getElementById('batchInput').value = '';
};

window.parseBatchUrls = async function() {
  const text = document.getElementById('batchInput').value;
  const urls = await window.electronAPI.parseUrls(text);
  
  if (urls.length === 0) {
    showToast('No valid YouTube URLs found', 'error');
    return;
  }
  
  showToast(`Found ${urls.length} URLs. Starting downloads...`, 'success');
  closeBatchModal();
  
  document.querySelector('[data-tab="downloads"]').click();
  
  for (const url of urls) {
    const downloadId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    const download = {
      id: downloadId,
      title: 'Fetching...',
      format: selectedFormat === 'audio' ? 'MP3' : (selectedFormat.replace('video-', '') || 'Best'),
      type: selectedFormat === 'audio' ? 'audio' : 'video',
      progress: 0,
      status: 'queued',
      url,
      speed: '',
      eta: ''
    };
    
    downloads.unshift(download);
  }
  
  updateBadge();
  renderDownloads();
  
  // Download sequentially
  for (let i = 0; i < downloads.length; i++) {
    const download = downloads[i];
    if (download.status !== 'queued') continue;
    
    try {
      // Get video info
      const info = await window.electronAPI.getVideoInfo(download.url);
      if (info.success) {
        download.title = info.title;
        renderDownloads();
      }
      
      let format = null;
      if (selectedFormat === 'video-720') format = { quality: '720p' };
      else if (selectedFormat === 'video-480') format = { quality: '480p' };
      else if (selectedFormat === 'video-1080') format = { quality: '1080p' };
      
      await window.electronAPI.startDownload({
        url: download.url,
        format,
        type: download.type,
        downloadId: download.id,
        title: download.title
      });
    } catch (error) {
      download.status = 'error';
      download.error = error.message;
      renderDownloads();
    }
  }
};

// Settings
async function loadSettings() {
  const settings = await window.electronAPI.getSettings();
  
  document.getElementById('downloadPathDisplay').textContent = settings.downloadPath;
  document.getElementById('minimizeToTray').checked = settings.minimizeToTray;
  document.getElementById('showNotifications').checked = settings.showNotifications;
  document.getElementById('clipboardMonitor').checked = settings.clipboardMonitor;
}

document.getElementById('changeFolderBtn')?.addEventListener('click', async () => {
  const newPath = await window.electronAPI.selectFolder();
  if (newPath) {
    document.getElementById('downloadPathDisplay').textContent = newPath;
    showToast('Download folder updated', 'success');
  }
});

document.getElementById('openFolderBtn')?.addEventListener('click', () => {
  window.electronAPI.openDownloadFolder();
});

document.getElementById('minimizeToTray')?.addEventListener('change', async (e) => {
  await window.electronAPI.updateSettings({ minimizeToTray: e.target.checked });
});

document.getElementById('showNotifications')?.addEventListener('change', async (e) => {
  await window.electronAPI.updateSettings({ showNotifications: e.target.checked });
});

document.getElementById('clipboardMonitor')?.addEventListener('change', async (e) => {
  await window.electronAPI.updateSettings({ clipboardMonitor: e.target.checked });
});

document.getElementById('updateYtdlpBtn')?.addEventListener('click', async () => {
  showToast('Updating yt-dlp...', 'info');
  const result = await window.electronAPI.updateYtdlp();
  if (result.success) {
    showToast('yt-dlp updated successfully!', 'success');
  } else {
    showToast(`Update failed: ${result.error}`, 'error');
  }
});

// Utilities
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeJs(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<p>${escapeHtml(message)}</p>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Initialize
async function init() {
  await loadSettings();
  renderDownloads();
}

init();
