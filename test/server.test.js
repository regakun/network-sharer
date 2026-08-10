const assert = require('node:assert');
const http = require('node:http');
const path = require('path');
const fs = require('fs');

process.env.PORT = '3099';
const { app, server } = require('../server');

const BASE_URL = 'http://127.0.0.1:3099';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };

    let payload = body;
    if (body && typeof body === 'object' && !Buffer.isBuffer(body) && !headers['Content-Type']) {
      payload = JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
    }

    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, data, json });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function buildMultipart(fields, files) {
  const boundary = '----TestBoundary' + Math.random().toString(36).substring(2);
  let chunks = [];

  for (const [key, val] of Object.entries(fields)) {
    chunks.push(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`);
  }

  for (const file of files) {
    chunks.push(`--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`);
    chunks.push(file.content);
    chunks.push('\r\n');
  }

  chunks.push(`--${boundary}--\r\n`);
  const body = Buffer.concat(chunks.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c)));
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function runTests() {
  console.log('Starting Network Sharer Integration Self-Check...\n');

  try {
    // 1. Check Server Info API
    console.log('1. Testing GET /api/info...');
    const infoRes = await request('GET', '/api/info');
    assert.strictEqual(infoRes.status, 200, 'GET /api/info should return 200');
    assert.ok(infoRes.json.localIp, 'Should contain localIp');
    assert.ok(infoRes.json.qrCodeDataUrl, 'Should contain QR code data URL');
    console.log('   [OK] Local IP detected:', infoRes.json.localIp);

    // 2. Test Text Snippet Sharing API
    console.log('2. Testing POST /api/text and GET /api/text...');
    const textRes = await request('POST', '/api/text', { text: 'Hello from iPhone to PC!' });
    assert.strictEqual(textRes.status, 200, 'POST /api/text should return 200');
    assert.ok(textRes.json.snippet.id, 'Text snippet should have ID');

    const getTextsRes = await request('GET', '/api/text');
    assert.strictEqual(getTextsRes.status, 200);
    assert.ok(getTextsRes.json.some(t => t.text === 'Hello from iPhone to PC!'), 'Should retrieve saved text');
    console.log('   [OK] Text note snippet shared successfully');

    // 3. Test File Upload API
    console.log('3. Testing POST /api/upload...');
    const dummyImageContent = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;', 'latin1');
    const multipart = buildMultipart(
      { caption: 'Sunset Photo' },
      [{ fieldname: 'files', filename: 'test_photo.jpg', contentType: 'image/jpeg', content: dummyImageContent }]
    );

    const uploadRes = await request('POST', '/api/upload', multipart.body, { 'Content-Type': multipart.contentType });
    assert.strictEqual(uploadRes.status, 200, 'POST /api/upload should return 200');
    assert.strictEqual(uploadRes.json.success, true);
    assert.strictEqual(uploadRes.json.files.length, 1);
    
    const uploadedFile = uploadRes.json.files[0];
    assert.strictEqual(uploadedFile.isImage, true);
    assert.strictEqual(uploadedFile.originalName, 'test_photo.jpg');
    console.log('   [OK] Photo file uploaded successfully:', uploadedFile.filename);

    // 4. Test List Files API
    console.log('4. Testing GET /api/files...');
    const listRes = await request('GET', '/api/files');
    assert.strictEqual(listRes.status, 200);
    assert.ok(listRes.json.some(f => f.filename === uploadedFile.filename), 'File list should contain uploaded file');
    console.log('   [OK] Uploaded file retrieved in list');

    // 5. Test File Download API
    console.log('5. Testing GET /api/files/:filename...');
    const downloadRes = await request('GET', uploadedFile.url);
    assert.strictEqual(downloadRes.status, 200);
    assert.strictEqual(downloadRes.data.length, dummyImageContent.length, 'Downloaded content length should match uploaded file');
    console.log('   [OK] File content downloaded and verified');

    // 6. Test File Deletion API
    console.log('6. Testing DELETE /api/files/:filename...');
    const deleteRes = await request('DELETE', `/api/files/${encodeURIComponent(uploadedFile.filename)}`);
    assert.strictEqual(deleteRes.status, 200);
    assert.strictEqual(deleteRes.json.success, true);
    console.log('   [OK] File deleted successfully');

    console.log('\nALL INTEGRATION SELF-CHECKS PASSED SUCCESSFULLY!\n');
  } catch (err) {
    console.error('\nTest Failure:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

runTests();
