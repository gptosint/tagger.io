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

// Add a new tag (expects { lat, lng, text } in body)
app.post('/api/tags', (req, res) => {
  const { lat, lng, text, userId } = req.body;
  const latNum = Number(lat);
  const lngNum = Number(lng);
  const safeUserId =
    typeof userId === 'string' && userId.trim().length > 0
      ? userId.trim().slice(0, 50)
      : 'anonymous';
  if (
    Number.isNaN(latNum) ||
    Number.isNaN(lngNum) ||
    typeof text !== 'string' ||
    text.trim() === ''
  ) {
    return res.status(400).json({ error: 'Invalid tag data' });
  }
  const tags = loadTags();
  tags.push({
    lat: latNum,
    lng: lngNum,
    text: text.trim(),
    userId: safeUserId,
    timestamp: Date.now(),
  });
  saveTags(tags);
  res.json({ success: true });
});

// Delete all tags
app.delete('/api/tags', (req, res) => {
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
