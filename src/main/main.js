const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, clipboard, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

// Fix GPU cache warnings
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.disableHardwareAcceleration();

// Get ffmpeg path - handle both dev and packaged scenarios
function getFfmpegPath() {
  let ffmpegPath = require('ffmpeg-static');
  
  if (app.isPackaged) {
    const unpackedPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
    if (fs.existsSync(unpackedPath)) {
      return unpackedPath;
    }
  }
  
  return ffmpegPath;
}

let mainWindow;
let tray = null;
let activeDownloads = new Map();
let ytdlpPath = null;
let clipboardWatcher = null;
let lastClipboard = '';
let minimizeToTray = true;
let showNotifications = true;
let clipboardMonitorEnabled = true;
let cookiesFilePath = ''; // Path to YouTube cookies file
let customYtdlpArgs = ''; // Custom yt-dlp arguments
const GITHUB_REPO = 'amaroidev/ydl';
const CURRENT_VERSION = '2.3.0';

// Default download path
let downloadPath = path.join(app.getPath('downloads'), 'YouTube Downloads');

// Data file paths
const historyPath = path.join(app.getPath('userData'), 'download-history.json');
const scheduledPath = path.join(app.getPath('userData'), 'scheduled-downloads.json');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// Load settings
function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      downloadPath = data.downloadPath || downloadPath;
      minimizeToTray = data.minimizeToTray !== false;
      showNotifications = data.showNotifications !== false;
      clipboardMonitorEnabled = data.clipboardMonitor !== false;
      cookiesFilePath = data.cookiesFilePath || '';
      customYtdlpArgs = data.customYtdlpArgs || '';
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

// Save settings
function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify({
      downloadPath,
      minimizeToTray,
      showNotifications,
      clipboardMonitor: clipboardMonitorEnabled,
      cookiesFilePath,
      customYtdlpArgs
    }, null, 2));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

// Load download history
function loadHistory() {
  try {
    if (fs.existsSync(historyPath)) {
      return JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load history:', e);
  }
  return [];
}

// Save download history
function saveHistory(history) {
  try {
    const trimmed = history.slice(0, 100);
    fs.writeFileSync(historyPath, JSON.stringify(trimmed, null, 2));
  } catch (e) {
    console.error('Failed to save history:', e);
  }
}

// Add to history
function addToHistory(item) {
  const history = loadHistory();
  history.unshift({
    ...item,
    downloadedAt: new Date().toISOString()
  });
  saveHistory(history);
}

// Load scheduled downloads
function loadScheduled() {
  try {
    if (fs.existsSync(scheduledPath)) {
      return JSON.parse(fs.readFileSync(scheduledPath, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load scheduled:', e);
  }
  return [];
}

// Save scheduled downloads
function saveScheduled(scheduled) {
  try {
    fs.writeFileSync(scheduledPath, JSON.stringify(scheduled, null, 2));
  } catch (e) {
    console.error('Failed to save scheduled:', e);
  }
}

// Find or download yt-dlp
async function ensureYtdlp() {
  const YTDlpWrap = require('yt-dlp-wrap').default;
  
  const possiblePaths = [
    path.join(app.getPath('userData'), 'yt-dlp.exe'),
    'yt-dlp',
    'yt-dlp.exe'
  ];
  
  for (const p of possiblePaths) {
    try {
      execSync(`"${p}" --version`, { stdio: 'pipe' });
      ytdlpPath = p;
      console.log('Found yt-dlp at:', ytdlpPath);
      return;
    } catch {}
  }
  
  const downloadTo = path.join(app.getPath('userData'), 'yt-dlp.exe');
  console.log('Downloading yt-dlp to:', downloadTo);
  
  try {
    await YTDlpWrap.downloadFromGithub(downloadTo);
    ytdlpPath = downloadTo;
    console.log('yt-dlp downloaded successfully');
  } catch (err) {
    console.error('Failed to download yt-dlp:', err);
    throw err;
  }
}

// Build common yt-dlp arguments with cookies and custom args
function buildYtdlpArgs(baseArgs = []) {
  let args = [...baseArgs];
  
  // Add cookies file if configured
  const hasCookies = cookiesFilePath && fs.existsSync(cookiesFilePath);
  if (hasCookies) {
    args.push('--cookies', cookiesFilePath);
    // When using cookies, let yt-dlp auto-select the best client
    // Don't force player_client as it can cause issues with cookies
  } else {
    // Without cookies, try android client first (helps bypass bot detection)
    args.push('--extractor-args', 'youtube:player_client=android,web');
  }
  
  // Add custom yt-dlp arguments if configured
  if (customYtdlpArgs && customYtdlpArgs.trim()) {
    // Parse custom args (handle quoted strings)
    const customArgsArray = customYtdlpArgs.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    args.push(...customArgsArray.map(arg => arg.replace(/^["']|["']$/g, '')));
  }
  
  return args;
}

// Check if URL is a valid YouTube URL
function isValidYouTubeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const patterns = [
    /youtube\.com\/watch\?v=/i,
    /youtu\.be\//i,
    /youtube\.com\/playlist\?list=/i,
    /youtube\.com\/shorts\//i,
    /youtube\.com\/embed\//i,
    /youtube\.com\/@[\w-]+/i,
    /youtube\.com\/channel\//i
  ];
  return patterns.some(pattern => pattern.test(url));
}

// Check if URL is a channel URL
function isChannelUrl(url) {
  if (!url) return false;
  return /youtube\.com\/@[\w-]+/i.test(url) || /youtube\.com\/channel\//i.test(url);
}

// Create system tray
function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  
  updateTrayMenu();
  tray.setToolTip('RoiTube');
  
  tray.on('click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show RoiTube', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Clipboard Monitor', type: 'checkbox', checked: clipboardMonitorEnabled, click: (item) => {
      clipboardMonitorEnabled = item.checked;
      saveSettings();
      if (item.checked) {
        startClipboardWatcher();
      } else {
        stopClipboardWatcher();
      }
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(contextMenu);
}

// Clipboard watcher for YouTube URLs
function startClipboardWatcher() {
  if (clipboardWatcher || !clipboardMonitorEnabled) return;
  
  lastClipboard = clipboard.readText();
  
  clipboardWatcher = setInterval(() => {
    try {
      const current = clipboard.readText();
      if (current !== lastClipboard && isValidYouTubeUrl(current)) {
        lastClipboard = current;
        if (mainWindow) {
          mainWindow.webContents.send('clipboard-url-detected', current);
        }
        
        if (showNotifications && Notification.isSupported()) {
          const notification = new Notification({
            title: 'YouTube URL Detected',
            body: 'Click to add to RoiTube',
            silent: true
          });
          notification.on('click', () => {
            mainWindow.show();
            mainWindow.focus();
          });
          notification.show();
        }
      }
      lastClipboard = current;
    } catch (e) {
      console.error('Clipboard error:', e);
    }
  }, 1000);
}

function stopClipboardWatcher() {
  if (clipboardWatcher) {
    clearInterval(clipboardWatcher);
    clipboardWatcher = null;
  }
}

// Show notification
function showAppNotification(title, body) {
  if (showNotifications && Notification.isSupported()) {
    new Notification({ title, body, silent: false }).show();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 650,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1a1a2e',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (minimizeToTray && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true });
  }
}

// Check scheduled downloads
function checkScheduledDownloads() {
  const scheduled = loadScheduled();
  const now = new Date();
  let updated = false;
  
  for (const item of scheduled) {
    if (item.status === 'pending') {
      const scheduledTime = new Date(item.scheduledTime);
      if (now >= scheduledTime) {
        item.status = 'starting';
        updated = true;
        if (mainWindow) {
          mainWindow.webContents.send('scheduled-download-ready', item);
        }
      }
    }
  }
  
  if (updated) {
    saveScheduled(scheduled);
  }
}

app.whenReady().then(async () => {
  loadSettings();
  
  try {
    await ensureYtdlp();
  } catch (err) {
    console.error('Failed to setup yt-dlp:', err);
  }
  
  createWindow();
  createTray();
  
  if (clipboardMonitorEnabled) {
    startClipboardWatcher();
  }
  
  setInterval(checkScheduledDownloads, 60000);
  checkScheduledDownloads();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopClipboardWatcher();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

// Window controls
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => {
  if (minimizeToTray) {
    mainWindow.hide();
  } else {
    mainWindow.close();
  }
});

// Validate URL
ipcMain.handle('validate-url', async (event, url) => {
  return isValidYouTubeUrl(url);
});

// Check if channel URL
ipcMain.handle('is-channel-url', async (event, url) => {
  return isChannelUrl(url);
});

// Search YouTube videos using yt-dlp
ipcMain.handle('search-youtube', async (event, query) => {
  try {
    if (!ytdlpPath) await ensureYtdlp();
    
    return new Promise((resolve) => {
      const baseArgs = [
        `ytsearch10:${query}`,
        '--flat-playlist',
        '--print', '%(id)s\t%(title)s\t%(duration_string)s\t%(channel)s\t%(view_count)s',
        '--no-warnings'
      ];
      const args = buildYtdlpArgs(baseArgs);
      
      const proc = spawn(ytdlpPath, args);
      let output = '';
      let errorOutput = '';
      
      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', (data) => { errorOutput += data.toString(); });
      
      proc.on('close', (code) => {
        if (code === 0 && output.trim()) {
          const lines = output.trim().split('\n').filter(l => l.trim());
          const videos = lines.map(line => {
            const parts = line.split('\t');
            const videoId = parts[0]?.trim();
            return {
              id: videoId,
              title: parts[1]?.trim() || 'Unknown',
              duration: parts[2]?.trim() || '',
              author: parts[3]?.trim() || 'Unknown',
              views: parseInt(parts[4]) || 0,
              thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
              url: `https://www.youtube.com/watch?v=${videoId}`
            };
          }).filter(v => v.id && v.id.length >= 5);
          resolve({ success: true, videos });
        } else {
          resolve({ success: false, error: errorOutput || 'Search failed' });
        }
      });
      
      proc.on('error', (err) => resolve({ success: false, error: err.message }));
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get video info
ipcMain.handle('get-video-info', async (event, url) => {
  try {
    if (!ytdlpPath) await ensureYtdlp();
    
    return new Promise((resolve) => {
      const baseArgs = [
        '--no-download',
        '--print', '%(id)s\t%(title)s\t%(channel)s\t%(duration)s\t%(duration_string)s',
        '--no-playlist',
        url
      ];
      const args = buildYtdlpArgs(baseArgs);
      
      console.log('=== GET VIDEO INFO ===');
      console.log('URL:', url);
      console.log('Cookies path:', cookiesFilePath);
      console.log('Cookies exists:', cookiesFilePath ? fs.existsSync(cookiesFilePath) : 'N/A');
      console.log('Full args:', args.join(' '));
      
      const proc = spawn(ytdlpPath, args);
      let output = '';
      let errorOutput = '';
      
      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', (data) => { errorOutput += data.toString(); });
      
      proc.on('close', (code) => {
        console.log('=== VIDEO INFO RESULT ===');
        console.log('Exit code:', code);
        console.log('stdout:', output);
        console.log('stderr:', errorOutput.substring(0, 500));
        
        // Check if we got valid output (yt-dlp returns code 1 when warnings are sent to stderr)
        const parts = output.trim().split('\t');
        console.log('Parsed parts:', parts);
        
        if (parts[0] && parts[1]) {
          resolve({
            success: true,
            id: parts[0] || '',
            title: parts[1] || 'Unknown',
            author: parts[2] || 'Unknown',
            duration: parseInt(parts[3]) || 0,
            durationString: parts[4] || '0:00',
            thumbnail: `https://i.ytimg.com/vi/${parts[0]}/maxresdefault.jpg`
          });
        } else {
          // Check for specific errors in stderr
          const error = errorOutput.includes('Sign in to confirm') 
            ? 'YouTube requires authentication. Please add cookies in Settings.'
            : (errorOutput || 'Failed to get video info');
          resolve({ success: false, error });
        }
      });
      
      proc.on('error', (err) => resolve({ success: false, error: err.message }));
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get video title (legacy)
ipcMain.handle('get-video-title', async (event, url) => {
  return await ipcMain.emit('get-video-info', event, url);
});

// Get available subtitles
ipcMain.handle('get-subtitles', async (event, url) => {
  try {
    if (!ytdlpPath) await ensureYtdlp();
    
    return new Promise((resolve) => {
      const args = ['--list-subs', '--skip-download', url];
      
      const proc = spawn(ytdlpPath, args);
      let output = '';
      
      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', (data) => { output += data.toString(); });
      
      proc.on('close', () => {
        const subtitles = [];
        const lines = output.split('\n');
        let inSubtitles = false;
        
        for (const line of lines) {
          if (line.includes('Available subtitles') || line.includes('Available automatic captions')) {
            inSubtitles = true;
            continue;
          }
          if (inSubtitles && line.match(/^[a-z]{2}(-[A-Za-z]+)?\s/)) {
            const match = line.match(/^([a-z]{2}(-[A-Za-z]+)?)\s+(.+)/i);
            if (match) {
              subtitles.push({
                code: match[1],
                name: match[3].split(',')[0].trim()
              });
            }
          }
        }
        
        resolve({ success: true, subtitles });
      });
      
      proc.on('error', () => resolve({ success: true, subtitles: [] }));
    });
  } catch (error) {
    return { success: true, subtitles: [] };
  }
});

// Get channel videos
ipcMain.handle('get-channel-videos', async (event, url, limit = 20) => {
  try {
    if (!ytdlpPath) await ensureYtdlp();
    
    return new Promise((resolve) => {
      const channelUrl = url.includes('/videos') ? url : url + '/videos';
      const baseArgs = [
        '--flat-playlist',
        '--playlist-end', limit.toString(),
        '--print', '%(id)s\t%(title)s\t%(duration_string)s',
        channelUrl
      ];
      const args = buildYtdlpArgs(baseArgs);
      
      const proc = spawn(ytdlpPath, args);
      let output = '';
      let errorOutput = '';
      
      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', (data) => { errorOutput += data.toString(); });
      
      proc.on('close', (code) => {
        if (code === 0) {
          const lines = output.trim().split('\n').filter(l => l.trim());
          const videos = lines.map(line => {
            const parts = line.split('\t');
            const videoId = parts[0]?.trim();
            return {
              id: videoId,
              title: parts[1]?.trim() || 'Unknown',
              duration: parts[2]?.trim() || '',
              url: `https://www.youtube.com/watch?v=${videoId}`,
              thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
            };
          }).filter(v => v.id && v.id.length > 5);
          resolve({ success: true, videos });
        } else {
          resolve({ success: false, error: errorOutput || 'Failed to get channel videos' });
        }
      });
      
      proc.on('error', (err) => resolve({ success: false, error: err.message }));
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Select download folder
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: downloadPath
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    downloadPath = result.filePaths[0];
    saveSettings();
    return downloadPath;
  }
  return null;
});

// Get current download path
ipcMain.handle('get-download-path', () => downloadPath);

// Open download folder
ipcMain.handle('open-download-folder', () => {
  shell.openPath(downloadPath);
});

// Open file location
ipcMain.handle('open-file-location', (event, filePath) => {
  shell.showItemInFolder(filePath);
});

// Get playlist videos
ipcMain.handle('get-playlist-videos', async (event, url) => {
  try {
    if (!ytdlpPath) await ensureYtdlp();
    
    return new Promise((resolve) => {
      const baseArgs = [
        '--flat-playlist',
        '--print', '%(id)s\t%(title)s\t%(duration_string)s',
        url
      ];
      const args = buildYtdlpArgs(baseArgs);
      
      const proc = spawn(ytdlpPath, args);
      let output = '';
      let errorOutput = '';
      
      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', (data) => { errorOutput += data.toString(); });
      
      proc.on('close', (code) => {
        if (code === 0) {
          const lines = output.trim().split('\n').filter(l => l.trim());
          const videos = lines.map(line => {
            const parts = line.split('\t');
            const videoId = parts[0]?.trim();
            return {
              id: videoId,
              title: parts[1]?.trim() || 'Unknown',
              duration: parts[2]?.trim() || '',
              url: `https://www.youtube.com/watch?v=${videoId}`,
              thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
            };
          }).filter(v => v.id && v.id.length > 5);
          resolve({ success: true, videos });
        } else {
          resolve({ success: false, error: errorOutput || 'Failed to get playlist' });
        }
      });
      
      proc.on('error', (err) => resolve({ success: false, error: err.message }));
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Start download
ipcMain.handle('start-download', async (event, options) => {
  const { url, format, type, downloadId, title, trimStart, trimEnd, subtitleLang, embedSubs } = options;
  const id = downloadId || Date.now().toString();
  
  try {
    if (!ytdlpPath) await ensureYtdlp();
    
    const outputTemplate = path.join(downloadPath, '%(title).100s.%(ext)s');
    const resolvedFfmpegPath = getFfmpegPath();
    
    // Build base args
    let baseArgs = [
      '-o', outputTemplate,
      '--newline',
      '--progress-template', 'download:%(progress._percent_str)s %(progress._speed_str)s %(progress._eta_str)s',
      '--ffmpeg-location', resolvedFfmpegPath,
      '--no-playlist'
    ];
    
    // Subtitle options
    if (subtitleLang) {
      baseArgs.push('--write-subs', '--sub-lang', subtitleLang);
      if (embedSubs) {
        baseArgs.push('--embed-subs');
      }
    }
    
    // Trim options - must use force_keyframes_at_cuts for proper audio sync
    if ((trimStart && trimStart !== '0:00' && trimStart !== '0' && trimStart !== '') || (trimEnd && trimEnd !== '')) {
      // Parse time strings to seconds
      const parseTime = (t) => {
        if (!t) return null;
        const parts = t.toString().split(':').map(Number);
        if (parts.length === 1) return parts[0];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return null;
      };
      
      const startSec = parseTime(trimStart) || 0;
      const endSec = parseTime(trimEnd);
      
      if (startSec > 0 || endSec) {
        const sectionStr = endSec ? `*${startSec}-${endSec}` : `*${startSec}-`;
        baseArgs.push('--download-sections', sectionStr);
        // Force keyframes at cuts ensures proper audio/video sync
        baseArgs.push('--force-keyframes-at-cuts');
      }
    }
    
    if (type === 'audio') {
      baseArgs.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    } else {
      // Use simpler format string that ensures audio is included
      let formatStr;
      if (format?.quality === '720p') {
        formatStr = 'bestvideo[height<=720]+bestaudio/best[height<=720]';
      } else if (format?.quality === '480p') {
        formatStr = 'bestvideo[height<=480]+bestaudio/best[height<=480]';
      } else if (format?.quality === '1080p') {
        formatStr = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]';
      } else {
        formatStr = 'bestvideo+bestaudio/best';
      }
      baseArgs.push('-f', formatStr, '--merge-output-format', 'mp4');
    }
    
    baseArgs.push(url);
    
    // Build final args with cookies and custom args
    const args = buildYtdlpArgs(baseArgs);
    
    console.log('Starting download with args:', args);
    
    mainWindow.webContents.send('download-progress', {
      id, progress: 0, status: 'starting', speed: '', eta: ''
    });
    
    return new Promise((resolve) => {
      const proc = spawn(ytdlpPath, args);
      let lastProgress = 0;
      let lastSpeed = '';
      let lastEta = '';
      let totalFragments = 0;
      let currentFragment = 0;
      let outputFilePath = '';
      let errorOutput = '';
      
      activeDownloads.set(id, { proc, paused: false, options });
      
      proc.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('yt-dlp:', output);
        
        // Check for fragment-based download info (HLS/DASH)
        // Format: "[hlsnative] Total fragments: 39" or similar
        const totalFragMatch = output.match(/Total fragments:\s*(\d+)/i);
        if (totalFragMatch) {
          totalFragments = parseInt(totalFragMatch[1]);
        }
        
        // Parse fragment progress: "(frag 28/39)" 
        const fragMatch = output.match(/\(frag\s*(\d+)\/(\d+)\)/);
        if (fragMatch) {
          currentFragment = parseInt(fragMatch[1]);
          totalFragments = parseInt(fragMatch[2]);
        }
        
        // Parse speed and ETA from various formats
        // Format 1: "1.90MiB/s" and "01:56"
        // Format 2: "at   31.25KiB/s ETA 01:23"
        const speedMatch = output.match(/(\d+\.?\d*\s*[KMG]i?B\/s)/i);
        const etaMatch = output.match(/(?:ETA\s*)?(\d{1,2}:\d{2}(?::\d{2})?)/);
        
        if (speedMatch) lastSpeed = speedMatch[1].trim();
        if (etaMatch && !etaMatch[1].includes('/')) lastEta = etaMatch[1];
        
        // Parse percentage - look for patterns like "9.8%" or "69.3% of"
        const percentMatch = output.match(/(\d+\.?\d*)%/);
        if (percentMatch) {
          let progress = parseFloat(percentMatch[1]);
          
          // If we have fragment info, calculate real overall progress
          if (totalFragments > 0 && currentFragment > 0) {
            // Each fragment contributes equally to overall progress
            // Current fragment's progress + completed fragments
            const fragmentProgress = progress / 100;
            progress = ((currentFragment - 1 + fragmentProgress) / totalFragments) * 100;
          }
          
          // Always update if progress changed (handles fragment resets)
          if (Math.abs(progress - lastProgress) > 0.1 || lastSpeed || lastEta) {
            lastProgress = progress;
            mainWindow.webContents.send('download-progress', {
              id, 
              progress: Math.min(Math.round(progress * 10) / 10, 99), 
              status: 'downloading', 
              speed: lastSpeed, 
              eta: lastEta
            });
          }
        }
        
        const destMatch = output.match(/Destination: (.+)/);
        if (destMatch) outputFilePath = destMatch[1].trim();
        
        const mergeMatch = output.match(/Merging formats into "(.+)"/);
        if (mergeMatch) outputFilePath = mergeMatch[1].trim();
        
        if (output.includes('has already been downloaded')) {
          mainWindow.webContents.send('download-progress', {
            id, progress: 100, status: 'completed', speed: '', eta: ''
          });
        }
      });
      
      proc.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      proc.on('close', (code) => {
        activeDownloads.delete(id);
        
        // Find output file - yt-dlp may return code 1 even on success due to warnings
        if (!outputFilePath) {
          try {
            const files = fs.readdirSync(downloadPath);
            const recentFile = files
              .map(f => ({ name: f, time: fs.statSync(path.join(downloadPath, f)).mtime }))
              .sort((a, b) => b.time - a.time)[0];
            // Check if file was created in the last 5 minutes
            if (recentFile && (Date.now() - recentFile.time.getTime()) < 300000) {
              outputFilePath = path.join(downloadPath, recentFile.name);
            }
          } catch {}
        }
        
        // Check for success: either exit code 0, or we got a file and progress reached near 100%
        const downloadSucceeded = code === 0 || (outputFilePath && lastProgress >= 99) || (outputFilePath && fs.existsSync(outputFilePath));
        
        if (downloadSucceeded && outputFilePath) {
          addToHistory({
            id, title, url, type, filePath: outputFilePath,
            format: format?.quality || (type === 'audio' ? 'MP3' : 'Best')
          });
          
          showAppNotification('Download Complete', title.substring(0, 50));
          
          mainWindow.webContents.send('download-progress', {
            id, progress: 100, status: 'completed', filePath: outputFilePath, speed: '', eta: ''
          });
          resolve({ success: true, id, filePath: outputFilePath });
        } else {
          // Provide user-friendly error messages
          let error = errorOutput || 'Download failed';
          if (errorOutput.includes('Sign in to confirm')) {
            error = 'YouTube requires authentication. Please add cookies in Settings > YouTube Authentication.';
          } else if (errorOutput.includes('Video unavailable')) {
            error = 'This video is unavailable or private.';
          } else if (errorOutput.includes('age-restricted')) {
            error = 'This video is age-restricted. Add cookies to access it.';
          }
          
          mainWindow.webContents.send('download-progress', {
            id, progress: 0, status: 'error', error, speed: '', eta: ''
          });
          resolve({ success: false, error, id });
        }
      });
      
      proc.on('error', (err) => {
        activeDownloads.delete(id);
        mainWindow.webContents.send('download-progress', {
          id, progress: 0, status: 'error', error: err.message, speed: '', eta: ''
        });
        resolve({ success: false, error: err.message, id });
      });
    });
  } catch (error) {
    mainWindow.webContents.send('download-progress', {
      id, progress: 0, status: 'error', error: error.message, speed: '', eta: ''
    });
    return { success: false, error: error.message, id };
  }
});

// Cancel download
ipcMain.handle('cancel-download', (event, downloadId) => {
  const download = activeDownloads.get(downloadId);
  if (download && download.proc) {
    download.proc.kill('SIGTERM');
    activeDownloads.delete(downloadId);
    return { success: true };
  }
  return { success: false, error: 'Download not found' };
});

// Pause download (stop process, keep state)
ipcMain.handle('pause-download', (event, downloadId) => {
  const download = activeDownloads.get(downloadId);
  if (download && download.proc) {
    download.proc.kill('SIGSTOP'); // Pause the process
    download.paused = true;
    return { success: true };
  }
  return { success: false, error: 'Download not found' };
});

// Resume download
ipcMain.handle('resume-download', (event, downloadId) => {
  const download = activeDownloads.get(downloadId);
  if (download && download.proc) {
    download.proc.kill('SIGCONT'); // Resume the process
    download.paused = false;
    return { success: true };
  }
  return { success: false, error: 'Download not found' };
});

// Get download history
ipcMain.handle('get-history', () => {
  return loadHistory();
});

// Clear download history
ipcMain.handle('clear-history', () => {
  saveHistory([]);
  return { success: true };
});

// Delete history item
ipcMain.handle('delete-history-item', (event, id) => {
  const history = loadHistory();
  const filtered = history.filter(h => h.id !== id);
  saveHistory(filtered);
  return { success: true };
});

// Schedule download
ipcMain.handle('schedule-download', (event, item) => {
  const scheduled = loadScheduled();
  scheduled.push({
    ...item,
    id: Date.now().toString(),
    status: 'pending',
    createdAt: new Date().toISOString()
  });
  saveScheduled(scheduled);
  return { success: true };
});

// Get scheduled downloads
ipcMain.handle('get-scheduled', () => {
  return loadScheduled();
});

// Cancel scheduled download
ipcMain.handle('cancel-scheduled', (event, id) => {
  const scheduled = loadScheduled();
  const filtered = scheduled.filter(s => s.id !== id);
  saveScheduled(filtered);
  return { success: true };
});

// Run scheduled download now
ipcMain.handle('run-scheduled-now', (event, id) => {
  const scheduled = loadScheduled();
  const item = scheduled.find(s => s.id === id);
  if (item) {
    item.status = 'starting';
    saveScheduled(scheduled);
    mainWindow.webContents.send('scheduled-download-ready', item);
    return { success: true };
  }
  return { success: false, error: 'Scheduled download not found' };
});

// Settings
ipcMain.handle('get-settings', () => {
  return { 
    downloadPath, 
    minimizeToTray, 
    showNotifications, 
    clipboardMonitor: clipboardMonitorEnabled,
    cookiesFilePath,
    customYtdlpArgs,
    currentVersion: CURRENT_VERSION
  };
});

ipcMain.handle('update-settings', (event, settings) => {
  if (settings.downloadPath !== undefined) downloadPath = settings.downloadPath;
  if (settings.minimizeToTray !== undefined) minimizeToTray = settings.minimizeToTray;
  if (settings.showNotifications !== undefined) showNotifications = settings.showNotifications;
  if (settings.clipboardMonitor !== undefined) {
    clipboardMonitorEnabled = settings.clipboardMonitor;
    if (clipboardMonitorEnabled) {
      startClipboardWatcher();
    } else {
      stopClipboardWatcher();
    }
    updateTrayMenu();
  }
  if (settings.cookiesFilePath !== undefined) cookiesFilePath = settings.cookiesFilePath;
  if (settings.customYtdlpArgs !== undefined) customYtdlpArgs = settings.customYtdlpArgs;
  saveSettings();
  return { success: true };
});

// Select cookies file
ipcMain.handle('select-cookies-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select YouTube Cookies File',
    properties: ['openFile'],
    filters: [
      { name: 'Cookies', extensions: ['txt', 'cookies', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];
    
    try {
      // Read the file and check if it's JSON format
      const content = fs.readFileSync(selectedPath, 'utf-8').trim();
      
      if (content.startsWith('[')) {
        // JSON format - convert to proper Netscape format
        const cookies = JSON.parse(content);
        const netscapeLines = [
          '# Netscape HTTP Cookie File',
          '# http://curl.haxx.se/rfc/cookie_spec.html',
          '# This is a generated file!  Do not edit.',
          ''
        ];
        
        for (const cookie of cookies) {
          const domain = cookie.domain || '';
          // Flag is TRUE if domain starts with dot (applies to all subdomains)
          const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
          const cookiePath = cookie.path || '/';
          const secure = cookie.secure ? 'TRUE' : 'FALSE';
          const expiry = Math.floor(cookie.expirationDate || 0);
          const name = cookie.name || '';
          const value = cookie.value || '';
          
          // HttpOnly cookies need #HttpOnly_ prefix
          const prefix = cookie.httpOnly ? '#HttpOnly_' : '';
          
          netscapeLines.push(`${prefix}${domain}\t${flag}\t${cookiePath}\t${secure}\t${expiry}\t${name}\t${value}`);
        }
        
        // Save converted cookies to app data folder with trailing newline
        const convertedPath = path.join(app.getPath('userData'), 'youtube-cookies.txt');
        fs.writeFileSync(convertedPath, netscapeLines.join('\n') + '\n');
        cookiesFilePath = convertedPath;
        console.log('Converted JSON cookies to Netscape format:', convertedPath);
      } else {
        // Already in Netscape format or other format
        cookiesFilePath = selectedPath;
      }
      
      saveSettings();
      return { success: true, path: cookiesFilePath };
    } catch (e) {
      console.error('Failed to process cookies file:', e);
      return { success: false, error: 'Invalid cookies file format' };
    }
  }
  return { success: false };
});

// Clear cookies file
ipcMain.handle('clear-cookies-file', () => {
  cookiesFilePath = '';
  saveSettings();
  return { success: true };
});

// Check for app updates
ipcMain.handle('check-for-updates', async () => {
  try {
    const https = require('https');
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${GITHUB_REPO}/releases/latest`,
        headers: { 'User-Agent': 'RoiTube-App' }
      };
      
      https.get(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const release = JSON.parse(data);
            const latestVersion = release.tag_name?.replace('v', '') || '';
            const hasUpdate = latestVersion && latestVersion !== CURRENT_VERSION;
            resolve({
              success: true,
              hasUpdate,
              currentVersion: CURRENT_VERSION,
              latestVersion,
              downloadUrl: release.html_url,
              releaseNotes: release.body || '',
              assets: release.assets || []
            });
          } catch (e) {
            resolve({ success: false, error: 'Failed to parse release info' });
          }
        });
      }).on('error', (e) => {
        resolve({ success: false, error: e.message });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Download app update
ipcMain.handle('download-update', async (event, downloadUrl) => {
  try {
    shell.openExternal(downloadUrl);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Batch import URLs
ipcMain.handle('parse-urls', (event, text) => {
  const urlRegex = /(https?:\/\/(www\.)?(youtube\.com|youtu\.be)[^\s]+)/gi;
  const matches = text.match(urlRegex) || [];
  const uniqueUrls = [...new Set(matches)];
  return uniqueUrls.filter(u => isValidYouTubeUrl(u));
});

// Update yt-dlp
ipcMain.handle('update-ytdlp', async () => {
  try {
    const YTDlpWrap = require('yt-dlp-wrap').default;
    const downloadTo = path.join(app.getPath('userData'), 'yt-dlp.exe');
    await YTDlpWrap.downloadFromGithub(downloadTo);
    ytdlpPath = downloadTo;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
