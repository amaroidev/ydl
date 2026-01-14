const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  
  // URL validation
  validateUrl: (url) => ipcRenderer.invoke('validate-url', url),
  isChannelUrl: (url) => ipcRenderer.invoke('is-channel-url', url),
  
  // Search & Info
  searchYouTube: (query) => ipcRenderer.invoke('search-youtube', query),
  getVideoInfo: (url) => ipcRenderer.invoke('get-video-info', url),
  getVideoTitle: (url) => ipcRenderer.invoke('get-video-info', url),
  getSubtitles: (url) => ipcRenderer.invoke('get-subtitles', url),
  
  // Playlist & Channel
  getPlaylistVideos: (url) => ipcRenderer.invoke('get-playlist-videos', url),
  getChannelVideos: (url, limit) => ipcRenderer.invoke('get-channel-videos', url, limit),
  
  // Downloads
  startDownload: (options) => ipcRenderer.invoke('start-download', options),
  cancelDownload: (downloadId) => ipcRenderer.invoke('cancel-download', downloadId),
  pauseDownload: (downloadId) => ipcRenderer.invoke('pause-download', downloadId),
  resumeDownload: (downloadId) => ipcRenderer.invoke('resume-download', downloadId),
  
  // Folder operations
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getDownloadPath: () => ipcRenderer.invoke('get-download-path'),
  openDownloadFolder: () => ipcRenderer.invoke('open-download-folder'),
  openFileLocation: (filePath) => ipcRenderer.invoke('open-file-location', filePath),
  
  // History
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  deleteHistoryItem: (id) => ipcRenderer.invoke('delete-history-item', id),
  
  // Scheduled downloads
  scheduleDownload: (item) => ipcRenderer.invoke('schedule-download', item),
  getScheduled: () => ipcRenderer.invoke('get-scheduled'),
  cancelScheduled: (id) => ipcRenderer.invoke('cancel-scheduled', id),
  runScheduledNow: (id) => ipcRenderer.invoke('run-scheduled-now', id),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  selectCookiesFile: () => ipcRenderer.invoke('select-cookies-file'),
  clearCookiesFile: () => ipcRenderer.invoke('clear-cookies-file'),
  
  // App updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: (url) => ipcRenderer.invoke('download-update', url),
  
  // Batch import
  parseUrls: (text) => ipcRenderer.invoke('parse-urls', text),
  
  // Update yt-dlp
  updateYtdlp: () => ipcRenderer.invoke('update-ytdlp'),
  
  // Event listeners
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
  },
  onClipboardUrlDetected: (callback) => {
    ipcRenderer.on('clipboard-url-detected', (event, url) => callback(url));
  },
  onScheduledDownloadReady: (callback) => {
    ipcRenderer.on('scheduled-download-ready', (event, item) => callback(item));
  },
  
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.removeAllListeners('clipboard-url-detected');
    ipcRenderer.removeAllListeners('scheduled-download-ready');
  }
});
