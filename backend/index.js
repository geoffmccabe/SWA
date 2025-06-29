const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8080;
const TEMP_DIR = path.join(__dirname, 'tmp');

// Create temp directory if needed
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// Middleware
app.use(express.static(path.join(__dirname, '..')));
app.use(express.json({ limit: '10mb' }));

// API Routes
const render = (req, res, format) => {
  const svgData = req.body.svg;
  if (!svgData) return res.status(400).send('SVG data required');

  const uniqueId = crypto.randomUUID();
  const inputPath = path.join(TEMP_DIR, `${uniqueId}.svg`);
  const outputPath = path.join(TEMP_DIR, `${uniqueId}.${format}`);
  
  fs.writeFile(inputPath, svgData, (err) => {
    if (err) return res.status(500).send('File write error');

    const ffmpegCmd = format === 'mp4'
      ? `ffmpeg -i ${inputPath} -c:v libx264 -pix_fmt yuv420p -y ${outputPath}`
      : `ffmpeg -i ${inputPath} -y ${outputPath}`;

    exec(ffmpegCmd, (execErr) => {
      if (execErr) {
        fs.unlink(inputPath, () => {});
        return res.status(500).send(`FFmpeg error: ${execErr.message}`);
      }

      res.download(outputPath, `animation.${format}`, (dlErr) => {
        fs.unlink(inputPath, () => {});
        fs.unlink(outputPath, () => {});
        if (dlErr) console.error('Download error:', dlErr);
      });
    });
  });
};

app.post('/api/render-mp4', (req, res) => render(req, res, 'mp4'));
app.post('/api/render-webp', (req, res) => render(req, res, 'webp'));

// Frontend Route (MUST BE LAST)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend available at /index.html`);
});
