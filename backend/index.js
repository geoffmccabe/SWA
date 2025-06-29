const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const TEMP_DIR = path.join(__dirname, 'tmp');

// Create a temporary directory if it doesn't exist
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// --- MIDDLEWARE ---
// Serve static files like CSS or other JS files if you add them later
app.use(express.static(path.join(__dirname, '..')));
// Use a large limit to accommodate potentially large SVG strings in API requests
app.use(express.json({ limit: '10mb' }));


// --- API ROUTES ---
const render = (req, res, format) => {
  const svgData = req.body.svg;
  if (!svgData) {
    return res.status(400).send('SVG data is required.');
  }

  const uniqueId = crypto.randomUUID();
  const inputPath = path.join(TEMP_DIR, `${uniqueId}.svg`);
  const outputPath = path.join(TEMP_DIR, `${uniqueId}.${format}`);
  
  fs.writeFile(inputPath, svgData, (err) => {
    if (err) {
      console.error('Error writing temp SVG file:', err);
      return res.status(500).send('Failed to write temporary file.');
    }

    const command = format === 'mp4'
      ? `ffmpeg -i ${inputPath} -c:v libx264 -pix_fmt yuv420p -y ${outputPath}`
      : `ffmpeg -i ${inputPath} -y ${outputPath}`;

    exec(command, (execErr) => {
      if (execErr) {
        console.error(`Error executing FFmpeg for ${format}:`, execErr);
        fs.unlink(inputPath, () => {});
        return res.status(500).send(`Failed to render ${format}.`);
      }

      res.download(outputPath, `animation.${format}`, (downloadErr) => {
        if (downloadErr) {
          console.error(`Error sending ${format} file:`, downloadErr);
        }
        fs.unlink(inputPath, () => {});
        fs.unlink(outputPath, () => {});
      });
    });
  });
};

app.post('/api/render-mp4', (req, res) => {
  render(req, res, 'mp4');
});

app.post('/api/render-webp', (req, res) => {
  render(req, res, 'webp');
});


// --- FRONTEND HANDLER ---
// This will serve the index.html file for any GET request that doesn't match an API route.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});


// --- SERVER STARTUP ---
app.listen(PORT, () => {
  console.log(`Renderer and Frontend server listening on port ${PORT}`);
});
