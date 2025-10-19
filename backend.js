const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve index.html and static files from current directory
app.use(express.static(__dirname));
app.use(bodyParser.json());

const tagsFile = process.env.TAGS_FILE
  ? path.resolve(process.env.TAGS_FILE)
  : path.join(__dirname, 'tags.json');

// Helper: Load tags from file
function loadTags() {
  if (!fs.existsSync(tagsFile)) return [];
  const raw = fs.readFileSync(tagsFile);
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// Helper: Save tags to file
function saveTags(tags) {
  fs.writeFileSync(tagsFile, JSON.stringify(tags, null, 2));
}

// Get all tags
app.get('/api/tags', (req, res) => {
  res.json(loadTags());
});

function sanitizeUserId(raw) {
  if (typeof raw !== 'string') {
    return 'anonymous';
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return 'anonymous';
  }
  return trimmed.slice(0, 50);
}

function normalizeCoordinates(lat, lng) {
  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
    return null;
  }

  return { lat: latNum, lng: lngNum };
}

function normalizeText(rawText) {
  if (typeof rawText !== 'string') {
    return null;
  }
  const trimmed = rawText.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function persistTag({ lat, lng, text, userId }) {
  const tags = loadTags();
  const entry = {
    lat,
    lng,
    text,
    userId: sanitizeUserId(userId),
    timestamp: Date.now(),
  };
  tags.push(entry);
  saveTags(tags);
  return entry;
}

function isMultipartRequest(req) {
  const contentType = req.headers['content-type'];
  return typeof contentType === 'string' && contentType.startsWith('multipart/form-data');
}

async function parseMultipartForm(req) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(.*)$/);
  if (!boundaryMatch) {
    return {};
  }

  const boundary = boundaryMatch[1];
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  const parts = buffer
    .toString('utf8')
    .split(`--${boundary}`)
    .filter((part) => part && part !== '--' && part !== '--\r\n');

  const fields = {};

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [rawHeaders, ...bodyParts] = trimmed.split('\r\n\r\n');
    if (!rawHeaders || bodyParts.length === 0) continue;
    const body = bodyParts.join('\r\n\r\n');
    const dispositionLine = rawHeaders
      .split('\r\n')
      .find((line) => line.toLowerCase().startsWith('content-disposition'));
    if (!dispositionLine) continue;
    const nameMatch = dispositionLine.match(/name="([^\"]+)"/);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];
    const cleanedBody = body.replace(/\r\n$/, '');
    fields[fieldName] = cleanedBody;
  }

  return fields;
}

// Add a new tag (expects { lat, lng, text } in body)
app.post('/api/tags', (req, res) => {
  const { lat, lng, text, userId } = req.body;
  const coords = normalizeCoordinates(lat, lng);
  const safeText = normalizeText(text);

  if (!coords || !safeText) {
    return res.status(400).json({ error: 'Invalid tag data' });
  }

  const entry = persistTag({
    lat: coords.lat,
    lng: coords.lng,
    text: safeText,
    userId,
  });

  res.json({ success: true, tag: entry });
});

// Delete all tags
app.delete('/api/tags', (req, res) => {
  saveTags([]);
  res.json({ success: true });
});

// Legacy compatibility routes -------------------------------------------------

app.get('/api/recording', (req, res) => {
  res.json({ tags: loadTags() });
});

app.post('/api/recording', async (req, res) => {
  try {
    let body = req.body || {};
    if (isMultipartRequest(req)) {
      body = await parseMultipartForm(req);
    }

    const latValue = body.lat ?? body.latitude;
    const lngValue = body.lng ?? body.longitude;
    const coords = normalizeCoordinates(latValue, lngValue);

    let text = body.text;
    if (typeof text !== 'string' && typeof body.file === 'string') {
      text = body.file;
    }

    const safeText = normalizeText(text);

    if (!coords || !safeText) {
      return res.status(400).json({ error: 'Invalid tag data' });
    }

    const entry = persistTag({
      lat: coords.lat,
      lng: coords.lng,
      text: safeText,
      userId: body.userId,
    });

    res.json({ success: true, tag: entry });
  } catch (error) {
    res.status(400).json({ error: 'Invalid tag data' });
  }
});

app.delete('/api/recording', (req, res) => {
  saveTags([]);
  res.json({ success: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}/`);
  });
}

module.exports = {
  app,
};
