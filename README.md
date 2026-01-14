# RoiTube Downloader

A beautiful, robust YouTube downloader built with Electron. Download videos and audio with an excellent user experience.

## Features

- 🎬 **Video Downloads** - Download in multiple quality options (1080p, 720p, 480p, etc.)
- 🎵 **Audio Downloads** - Extract audio as high-quality MP3 (320kbps)
- 📊 **Progress Tracking** - Real-time download progress with percentage
- 📁 **Custom Download Location** - Choose where to save your downloads
- 📜 **Download History** - Keep track of all your past downloads
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
- **ytdl-core** - YouTube video download library
- **fluent-ffmpeg** - Audio conversion for MP3 extraction
- **ffmpeg-static** - Bundled FFmpeg binary

## Development

```bash
# Run in development mode
npm run dev

# Build for production
npm run build
```

## License

MIT
