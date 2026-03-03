const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { RealityDefender } = require('@realitydefender/realitydefender');

const app = express();

// ── Preserve original file extension ─────────────────────────────────────────
// The SDK infers media type from the extension — without it, .MOV/.MP4 uploads
// will fail with "did not match expected pattern" or similar validation errors.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.tmp';
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, unique);
  },
});
const upload = multer({ storage });

app.use(express.static('public'));
app.use(express.json());

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Verbose server-side logger
function slog(label, data) {
  console.log(`\n[${new Date().toISOString()}] ${label}`);
  if (data) console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

// ── Auto detect (one-step) ────────────────────────────────────────────────────
app.post('/api/detect', upload.single('file'), async (req, res) => {
  const { apiKey, pollingInterval, maxAttempts } = req.body;
  const file = req.file;

  slog('POST /api/detect', {
    originalName: file?.originalname,
    savedAs: file?.filename,
    mimeType: file?.mimetype,
    size: file?.size,
    path: file?.path,
  });

  if (!apiKey) return res.status(400).json({ error: 'API key required' });
  if (!file)   return res.status(400).json({ error: 'File required' });

  try {
    const rd = new RealityDefender({ apiKey });
    slog('Calling rd.detect() with filePath:', file.path);

    const result = await rd.detect(
      { filePath: file.path },
      {
        pollingInterval: parseInt(pollingInterval) || 5000,
        maxAttempts:     parseInt(maxAttempts)     || 60,
      }
    );

    slog('detect() result:', result);
    res.json({ ok: true, result });
  } catch (err) {
    slog('detect() ERROR:', { message: err.message, code: err.code, response: err.response?.data, status: err.response?.status, stack: err.stack });
    res.status(500).json({ error: err.message, code: err.code });
  } finally {
    if (file?.path) fs.unlink(file.path, () => {});
  }
});

// ── Two-step: upload ──────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('file'), async (req, res) => {
  const { apiKey } = req.body;
  const file = req.file;

  slog('POST /api/upload', {
    originalName: file?.originalname,
    savedAs: file?.filename,
    mimeType: file?.mimetype,
    size: file?.size,
  });

  if (!apiKey) return res.status(400).json({ error: 'API key required' });
  if (!file)   return res.status(400).json({ error: 'File required' });

  try {
    const rd = new RealityDefender({ apiKey });
    const { requestId, mediaId } = await rd.upload({ filePath: file.path });
    slog('upload() success:', { requestId, mediaId });
    res.json({ ok: true, requestId, mediaId });
  } catch (err) {
    slog('upload() ERROR:', { message: err.message, code: err.code, stack: err.stack });
    res.status(500).json({ error: err.message, code: err.code });
  } finally {
    if (file?.path) fs.unlink(file.path, () => {});
  }
});

// ── Two-step: get result ──────────────────────────────────────────────────────
app.get('/api/result/:requestId', async (req, res) => {
  const { apiKey } = req.query;
  const { requestId } = req.params;

  slog('GET /api/result', { requestId });

  if (!apiKey) return res.status(400).json({ error: 'API key required' });

  try {
    const rd = new RealityDefender({ apiKey, baseUrl: 'https://api.prd.realitydefender.xyz' });
    const result = await rd.getResult(requestId);
    slog('getResult() result:', result);
    res.json({ ok: true, result });
  } catch (err) {
    slog('getResult() ERROR:', { message: err.message, code: err.code });
    res.status(500).json({ error: err.message, code: err.code });
  }
});

// ── Event-driven: upload + SSE polling ───────────────────────────────────────
app.post('/api/stream', upload.single('file'), async (req, res) => {
  const { apiKey, pollingInterval, timeout } = req.body;
  const file = req.file;

  slog('POST /api/stream', {
    originalName: file?.originalname,
    savedAs: file?.filename,
    mimeType: file?.mimetype,
    size: file?.size,
  });

  if (!apiKey || !file) {
    return res.status(400).json({ error: 'API key and file required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    slog(`SSE → ${event}`, data);
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const rd = new RealityDefender({ apiKey });

    send('log', { msg: `Uploading ${file.originalname}…` });
    const { requestId, mediaId } = await rd.upload({ filePath: file.path });
    send('log', { msg: `Uploaded. Request ID: ${requestId}` });
    send('uploaded', { requestId, mediaId });

    rd.pollForResults(requestId, {
      pollingInterval: parseInt(pollingInterval) || 3000,
      timeout:         parseInt(timeout)         || 120000,
    });

    rd.on('result', (result) => {
      slog('pollForResults result:', result);
      send('result', { result });
      res.end();
    });

    rd.on('error', (err) => {
      slog('pollForResults ERROR:', { message: err.message, code: err.code });
      send('error', { error: err.message, code: err.code });
      res.end();
    });

    req.on('close', () => rd.removeAllListeners());
  } catch (err) {
    slog('stream ERROR:', { message: err.message, code: err.code, stack: err.stack });
    send('error', { error: err.message, code: err.code });
    res.end();
  } finally {
    if (file?.path) fs.unlink(file.path, () => {});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`\n  Reality Defender UI → http://localhost:${PORT}\n`)
);
