---
description: "Use when: working on video downloader projects, fixing yt-dlp integration, debugging download errors"
applyTo:
  - "**/main.js"
  - "**/renderer.js"
  - "**/package.json"
---

# Video Downloader Development Guidelines

## yt-dlp Integration Best Practices

1. **Always test yt-dlp commands directly** before implementing in code
2. **Handle chunked output** - yt-dlp stdout may be split across multiple data events
3. **Use platform-specific args only when needed** - don't apply YouTube args to Twitter URLs
4. **Capture multiple output patterns** - yt-dlp uses different formats for file paths

## Error Handling Patterns

- **Empty outputFilePath**: Scan buffered output for file path patterns
- **Authentication failures**: Check for cookie requirements and guest tokens
- **Codec issues**: Prefer H.264/AAC for social media compatibility
- **Process exit codes**: yt-dlp may return code 1 even on success due to warnings

## Multi-platform Support

- Add URL validation patterns for each supported platform
- Update UI to show detected platform
- Handle platform-specific authentication requirements
- Test with real URLs from each platform

## Testing Protocol

1. Test YouTube URL (baseline functionality)
2. Test Twitter/X URL (social platform)
3. Test TikTok/Instagram (authentication-sensitive)
4. Verify WhatsApp compatibility (H.264 codec)

## Release Checklist

- [ ] Update version in package.json and main.js
- [ ] Test downloads on all supported platforms
- [ ] Verify build process works
- [ ] Update README with new features
- [ ] Create and push Git tag