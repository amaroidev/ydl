# RoiTube Downloader

A beautiful, powerful video downloader built with Electron. Download videos from YouTube, Twitter, TikTok, Instagram, and 1800+ other sites.

## Supported Platforms

- 🎬 **YouTube** - Videos, Shorts, Playlists, Channels
- 🐦 **Twitter/X** - Video tweets
- 📱 **TikTok** - Videos (may require cookies)
- 📸 **Instagram** - Reels, Posts, Stories, IGTV
- 📘 **Facebook** - Videos, Reels, Watch
- 🎮 **Twitch** - Clips, VODs
- 🔴 **Reddit** - Video posts
- 🎥 **Vimeo** - Videos
- 🎵 **SoundCloud** - Audio tracks
- **+1800 more sites** - Powered by yt-dlp

## Features

- 🎬 **Video Downloads** - Download in multiple quality options (1080p, 720p, 480p, etc.)
- 🎵 **Audio Downloads** - Extract audio as high-quality MP3 (320kbps)
- 📱 **WhatsApp Compatible** - H.264 codec for maximum compatibility
- 📊 **Progress Tracking** - Real-time download progress with speed & ETA
- 📁 **Custom Download Location** - Choose where to save your downloads
- ✂️ **Video Trimming** - Download specific portions of videos
- 📜 **Download History** - Keep track of all your past downloads
- ⏰ **Scheduled Downloads** - Schedule downloads for later
- 🔄 **Batch Downloads** - Download multiple videos at once
- 🎨 **Modern UI** - Beautiful dark theme with smooth animations
- 🪟 **Custom Window** - Frameless window with custom title bar

## Installation

1. Make sure you have [Node.js](https://nodejs.org/) installed (v16 or higher)

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the application:
   ```bash
   npm start
   ```

## Usage

1. **Paste URL** - Copy a YouTube video URL and paste it in the search box
2. **Select Quality** - Choose your preferred video quality or audio format
3. **Download** - Click the download button and watch the progress
4. **Access Files** - Find your downloads in the History tab or download folder

## Tech Stack

- **Electron** - Cross-platform desktop app framework
- **yt-dlp** - Powerful video download engine (1800+ sites)
- **ffmpeg-static** - Bundled FFmpeg binary for video/audio processing
- **Deno** - JavaScript runtime for YouTube decryption

## Development

```bash
# Run in development mode
npm run dev

# Build for production
npm run build
```

## License

MIT
