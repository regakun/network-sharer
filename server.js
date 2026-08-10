const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const cors = require('cors');
const compression = require('compression');
const sharp = require('sharp');

const ENV_PATH = path.join(__dirname, '.env');

// Helper: Load .env variables on server startup
function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  try {
    const content = fs.readFileSync(ENV_PATH, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    });
  } catch (e) {}
}

// Helper: Save key=value pair to .env file
function saveEnvVar(key, value) {
  try {
    let envLines = [];
    if (fs.existsSync(ENV_PATH)) {
      envLines = fs.readFileSync(ENV_PATH, 'utf8').split('\n');
    }

    let found = false;
    envLines = envLines.map(line => {
      if (line.trim().startsWith(`${key}=`)) {
        found = true;
        return `${key}=${value}`;
      }
      return line;
    });

    if (!found) {
      envLines.push(`${key}=${value}`);
    }

    fs.writeFileSync(ENV_PATH, envLines.filter(l => l.trim().length > 0).join('\n') + '\n');
  } catch (e) {}
}

// Load environment variables from .env if present
loadEnv();

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Active upload directory state
let activeUploadDir = process.env.UPLOAD_DIR || DEFAULT_UPLOADS_DIR;

// Parse CLI argument for custom target directory: node server.js /custom/path
const cliArgs = process.argv.slice(2);
const dirArg = cliArgs.find(arg => !arg.startsWith('--'));
if (dirArg) {
  activeUploadDir = path.isAbsolute(dirArg) ? dirArg : path.resolve(process.cwd(), dirArg);
}

// Ensure active upload & thumbnail directories exist
function getActiveUploadDir() {
  if (!fs.existsSync(activeUploadDir)) {
    fs.mkdirSync(activeUploadDir, { recursive: true });
  }
  return activeUploadDir;
}

function getThumbnailsDir() {
  const thumbDir = path.join(getActiveUploadDir(), '.thumbnails');
  if (!fs.existsSync(thumbDir)) {
    fs.mkdirSync(thumbDir, { recursive: true });
  }
  return thumbDir;
}

// In-memory text snippets store
const textSnippets = [];
// SSE client connections
let sseClients = [];

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR, { maxAge: '1d' }));

// Configure Multer storage for dynamic target & subfolders
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let target = getActiveUploadDir();
    const rawSub = (req.body.subfolder || req.query.subfolder || '').trim();
    const subfolder = rawSub.replace(/[^a-zA-Z0-9_-]/g, '_');

    if (subfolder) {
      target = path.join(target, subfolder);
      if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
      }
    }
    cb(null, target);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}_${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 } // 5GB limit per file
});

// Helper: Get all local IPv4 addresses
function getAllLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if ((iface.family === 'IPv4' || iface.family === 4) && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips.length > 0 ? ips : [{ name: 'loopback', address: '127.0.0.1' }];
}

function getPrimaryLocalIp() {
  const ips = getAllLocalIpAddresses();
  const lanIp = ips.find(i => i.address.startsWith('192.168.') || i.address.startsWith('10.') || i.address.startsWith('172.'));
  return lanIp ? lanIp.address : ips[0].address;
}

// Helper: Broadcast SSE event to all connected clients
function broadcastEvent(eventType, payload) {
  const data = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach(client => client.res.write(data));
}

// Format file object metadata
function formatFileObject(filename, subfolder = '') {
  const fileDir = subfolder ? path.join(getActiveUploadDir(), subfolder) : getActiveUploadDir();
  const filePath = path.join(fileDir, filename);

  let stats = { size: 0, mtimeMs: Date.now() };
  try {
    stats = fs.statSync(filePath);
  } catch (e) {}

  const ext = path.extname(filename).toLowerCase();
  const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.svg', '.bmp', '.tiff'].includes(ext);
  const isVideo = ['.mp4', '.mov', '.webm', '.m4v', '.mkv', '.avi'].includes(ext);
  const isAudio = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(ext);

  const parts = filename.split('_');
  const originalName = parts.length > 1 ? parts.slice(1).join('_') : filename;
  const subQuery = subfolder ? `?subfolder=${encodeURIComponent(subfolder)}` : '';

  return {
    id: subfolder ? `${subfolder}/${filename}` : filename,
    filename,
    subfolder,
    originalName,
    size: stats.size,
    createdAt: new Date(stats.mtimeMs).toISOString(),
    isImage,
    isVideo,
    isAudio,
    ext,
    url: `/api/files/${encodeURIComponent(filename)}${subQuery}`,
    thumbnailUrl: isImage ? `/api/thumbnail/${encodeURIComponent(filename)}${subQuery}` : `/api/files/${encodeURIComponent(filename)}${subQuery}`
  };
}

// Helper: Recursively scan files inside target upload directory
function scanDirectory(dir, relPath = '') {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // Skip hidden folders like .thumbnails

    const fullPath = path.join(dir, entry.name);
    const itemSubfolder = relPath;

    if (entry.isDirectory()) {
      const nextRel = relPath ? path.join(relPath, entry.name) : entry.name;
      results = results.concat(scanDirectory(fullPath, nextRel));
    } else if (entry.isFile()) {
      results.push(formatFileObject(entry.name, itemSubfolder));
    }
  }
  return results;
}

// API: Settings Endpoint (Get & Change Target Directory)
app.get('/api/settings', (req, res) => {
  res.json({
    activeUploadDir: getActiveUploadDir(),
    defaultUploadDir: DEFAULT_UPLOADS_DIR,
    downloadsDir: path.join(os.homedir(), 'Downloads'),
    picturesDir: path.join(os.homedir(), 'Pictures'),
    desktopDir: path.join(os.homedir(), 'Desktop')
  });
});

app.post('/api/settings', (req, res) => {
  const newDir = (req.body.uploadDir || '').trim();
  if (!newDir) {
    return res.status(400).json({ error: 'Target directory path cannot be empty' });
  }

  const resolvedPath = path.isAbsolute(newDir) ? newDir : path.resolve(process.cwd(), newDir);

  try {
    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }
    activeUploadDir = resolvedPath;
    saveEnvVar('UPLOAD_DIR', activeUploadDir);
    console.log(`[Settings] Target upload directory updated and synced to .env: ${activeUploadDir}`);

    broadcastEvent('settings_updated', { activeUploadDir });
    res.json({ success: true, activeUploadDir });
  } catch (err) {
    res.status(500).json({ error: `Failed to access target directory: ${err.message}` });
  }
});

// API: Connection & Server Info (IP + QR Code + Active Dir)
app.get('/api/info', async (req, res) => {
  const allIps = getAllLocalIpAddresses();
  const selectedIp = req.query.ip || getPrimaryLocalIp();
  const serverUrl = `http://${selectedIp}:${PORT}`;

  try {
    const qrCodeDataUrl = await QRCode.toDataURL(serverUrl, { margin: 2, width: 320 });
    res.json({
      localIp: selectedIp,
      allIps,
      port: PORT,
      serverUrl,
      qrCodeDataUrl,
      activeUploadDir: getActiveUploadDir()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR Code' });
  }
});

// API: SSE Endpoint for Real-time Live Sync
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  res.write('event: connected\ndata: {"status":"connected"}\n\n');

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// API: Serve On-Demand Compressed Image Thumbnail
app.get('/api/thumbnail/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename);
  const subfolder = (req.query.subfolder || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileDir = subfolder ? path.join(getActiveUploadDir(), subfolder) : getActiveUploadDir();
  const filePath = path.join(fileDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const ext = path.extname(filename).toLowerCase();
  const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp', '.tiff'].includes(ext);

  if (!isImage) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(filePath);
  }

  const thumbFilename = `thumb_400_${subfolder ? subfolder + '_' : ''}${filename}.jpg`;
  const thumbPath = path.join(getThumbnailsDir(), thumbFilename);

  if (fs.existsSync(thumbPath)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(thumbPath);
  }

  try {
    await sharp(filePath)
      .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbPath);

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(thumbPath);
  } catch (err) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(filePath);
  }
});

// API: File Upload (Multi-file + Caption & Subfolder support)
app.post('/api/upload', upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }

  const rawSub = (req.body.subfolder || req.query.subfolder || '').trim();
  const subfolder = rawSub.replace(/[^a-zA-Z0-9_-]/g, '_');

  const uploadedFiles = req.files.map(file => formatFileObject(file.filename, subfolder));
  const caption = (req.body.caption || '').trim();

  if (caption) {
    const textSnippet = {
      id: Date.now().toString(),
      text: caption,
      createdAt: new Date().toISOString(),
      source: 'upload_caption'
    };
    textSnippets.unshift(textSnippet);
    broadcastEvent('text_added', textSnippet);
  }

  uploadedFiles.forEach(fileObj => {
    broadcastEvent('file_added', fileObj);
  });

  res.json({
    success: true,
    files: uploadedFiles,
    caption,
    subfolder
  });
});

// API: List Files in Target Directory & Subfolders
app.get('/api/files', (req, res) => {
  try {
    const fileObjects = scanDirectory(getActiveUploadDir()).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    res.json(fileObjects);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read upload directory' });
  }
});

// API: Serve Raw File with Cache Headers & Subfolder Support
app.get('/api/files/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const subfolder = (req.query.subfolder || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileDir = subfolder ? path.join(getActiveUploadDir(), subfolder) : getActiveUploadDir();
  const filePath = path.join(fileDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  if (req.query.download === '1') {
    return res.download(filePath);
  }

  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath);
});

// API: Delete File
app.delete('/api/files/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const subfolder = (req.query.subfolder || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileDir = subfolder ? path.join(getActiveUploadDir(), subfolder) : getActiveUploadDir();
  const filePath = path.join(fileDir, filename);
  const thumbFilename = `thumb_400_${subfolder ? subfolder + '_' : ''}${filename}.jpg`;
  const thumbPath = path.join(getThumbnailsDir(), thumbFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  if (fs.existsSync(thumbPath)) {
    try { fs.unlinkSync(thumbPath); } catch (e) {}
  }

  fs.unlink(filePath, err => {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete file' });
    }
    broadcastEvent('file_deleted', { filename, subfolder });
    res.json({ success: true, filename, subfolder });
  });
});

// API: Text Snippets (Clipboard Share)
app.get('/api/text', (req, res) => {
  res.json(textSnippets);
});

app.post('/api/text', (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'Text cannot be empty' });
  }

  const snippet = {
    id: Date.now().toString(),
    text,
    createdAt: new Date().toISOString()
  };

  textSnippets.unshift(snippet);
  if (textSnippets.length > 100) textSnippets.pop();

  broadcastEvent('text_added', snippet);
  res.json({ success: true, snippet });
});

// API: Graceful Shutdown
app.post('/api/shutdown', (req, res) => {
  res.json({ success: true, message: 'Server is shutting down...' });
  broadcastEvent('server_shutdown', { message: 'Server stopped' });

  console.log('\n[Shutdown] Requested via Web UI / API. Closing server...');
  setTimeout(() => {
    server.close(() => {
      console.log('[Shutdown] Server closed cleanly. Port released.');
      process.exit(0);
    });
  }, 500);
});

// Fallback to static SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Start Server
const server = app.listen(PORT, '0.0.0.0', async () => {
  const primaryIp = getPrimaryLocalIp();
  const allIps = getAllLocalIpAddresses();
  const serverUrl = `http://${primaryIp}:${PORT}`;

  console.log('\n==================================================');
  console.log(` NETWORK SHARER ACTIVE (Listening on 0.0.0.0:${PORT})`);
  console.log(` Target Directory: ${getActiveUploadDir()}`);
  console.log(` Scan QR Code with iPhone Camera to start:`);
  console.log(` Local PC URL: http://localhost:${PORT}`);
  allIps.forEach(ip => {
    console.log(` Network URL (${ip.name}): http://${ip.address}:${PORT}`);
  });
  console.log('==================================================\n');

  try {
    const qrTerminal = await QRCode.toString(serverUrl, { type: 'terminal', small: true });
    console.log(qrTerminal);
  } catch (e) {
    console.log(`Scan or open: ${serverUrl}`);
  }
});

// Handle Ctrl+C and process termination signals
function gracefulExit(signal) {
  console.log(`\n[Shutdown] Received ${signal}. Closing server...`);
  broadcastEvent('server_shutdown', { message: 'Server stopped' });
  server.close(() => {
    console.log('[Shutdown] Server closed cleanly. Port released.');
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulExit('SIGINT'));
process.on('SIGTERM', () => gracefulExit('SIGTERM'));

module.exports = { app, server };
