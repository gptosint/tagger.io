const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tagger-'));
const tagsFile = path.join(tempDir, 'tags.json');

process.env.TAGS_FILE = tagsFile;

const { app } = require('../backend');

async function withServer(fn) {
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();

  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

beforeEach(() => {
  fs.rmSync(tagsFile, { force: true });
});

after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('GET /api/tags returns an empty array when no tags exist', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/tags`);
    assert.strictEqual(response.status, 200);
    const data = await response.json();
    assert.deepStrictEqual(data, []);
  });
});

test('POST /api/tags stores a sanitized tag and returns success', async () => {
  await withServer(async (baseUrl) => {
    const payload = {
      lat: 51.5,
      lng: -0.12,
      text: '  Hello London ',
      userId: '  example-user  ',
    };

    const postResponse = await fetch(`${baseUrl}/api/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(postResponse.status, 200);
    const body = await postResponse.json();
    assert.deepStrictEqual(body, { success: true });

    const getResponse = await fetch(`${baseUrl}/api/tags`);
    const tags = await getResponse.json();

    assert.strictEqual(tags.length, 1);
    const tag = tags[0];
    assert.strictEqual(tag.text, 'Hello London');
    assert.strictEqual(tag.userId, 'example-user');
    assert.strictEqual(tag.lat, payload.lat);
    assert.strictEqual(tag.lng, payload.lng);
    assert.ok(typeof tag.timestamp === 'number');
  });
});

test('POST /api/tags rejects invalid data', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 'not-a-number', lng: 0, text: '' }),
    });

    assert.strictEqual(response.status, 400);
    const data = await response.json();
    assert.deepStrictEqual(data, { error: 'Invalid tag data' });
  });
});
