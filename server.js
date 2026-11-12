// HandRewrite backend: keeps the Gemini key on the server and proxies transcription requests.
// Run: GEMINI_API_KEY=your_key node server.js   (Node 18+)
// Then open http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const KEY = process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const PREFERRED = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest'];
const RETRYABLE = [404, 429, 500, 503];
const MAX_BODY = 12 * 1024 * 1024;

const SYS = 'You transcribe images of school or university assignments. Transcribe ALL text exactly as written, including spelling and punctuation mistakes. Do not fix, rephrase, summarize, translate, or add anything. Preserve structure: headings, numbering, bullet points, line breaks, paragraphs, and blank answer space. Write math and formulas in plain text or LaTeX-style. Mark any diagram, graph or drawing as a separate block whose text is "[DIAGRAM: short description]" and add "box": [x,y,w,h] with fractions (0 to 1) of the full image width and height that enclose it. Block types: heading, paragraph, list, math, diagram. Return ONLY JSON with no markdown fences or commentary: {"blocks":[{"type":"heading|paragraph|list|math|diagram","text":"...","box":[x,y,w,h]}]}. Include box only for diagram blocks. If the image is too blurry to read, return {"error":"blurry"}. If it contains no readable text, return {"error":"no_text"}.';

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function listModels() {
  try {
    const r = await fetch(BASE + '?pageSize=100', { headers: { 'x-goog-api-key': KEY } });
    if (!r.ok) return [];
    const list = (await r.json()).models || [];
    return list.filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', ''));
  } catch { return []; }
}

async function transcribe(imageBase64) {
  const usable = await listModels();
  let names = PREFERRED.filter(n => usable.includes(n));
  if (!names.length) names = usable.filter(n => /flash/.test(n) && !/tts|image|embed|audio|live|omni|transcribe/.test(n));
  if (!names.length) names = PREFERRED;

  let last = { status: 500, message: 'No model available.' };
  for (const model of names.slice(0, 4)) {
    const body = {
      systemInstruction: { parts: [{ text: SYS }] },
      contents: [{ parts: [
        { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
        { text: 'Transcribe this assignment.' }
      ] }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 8000,
        ...(/2\.5|latest/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {})
      }
    };
    let r;
    try {
      r = await fetch(BASE + model + ':generateContent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });
    } catch (e) {
      last = { status: 504, message: e.name === 'TimeoutError' ? 'Gemini took too long. Try again.' : 'Could not reach Gemini.' };
      continue;
    }
    if (r.ok) {
      const j = await r.json();
      const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
      return { ok: true, text };
    }
    let message = await r.text();
    try { message = JSON.parse(message).error.message; } catch {}
    last = { status: r.status, message };
    if (!RETRYABLE.includes(r.status)) break;
  }
  return { ok: false, ...last };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/api/transcribe') {
    if (!KEY) return send(res, 500, { error: 'Server has no GEMINI_API_KEY set.' });
    let payload;
    try { payload = JSON.parse(await readBody(req)); }
    catch (e) { return send(res, 413, { error: e.message === 'too_large' ? 'Image is too large.' : 'Invalid request.' }); }
    const image = payload.image;
    if (typeof image !== 'string' || !image.length) return send(res, 400, { error: 'No image was sent.' });

    const result = await transcribe(image.replace(/^data:image\/\w+;base64,/, ''));
    if (!result.ok) {
      const friendly = {
        400: 'Gemini rejected the image. Try a smaller photo.',
        403: 'This Gemini key is not allowed. Create a new key in Google AI Studio.',
        429: 'Gemini free-tier limit reached. Wait a minute and try again.'
      };
      const busy = result.status >= 500 || result.status === 404;
      return send(res, busy ? 503 : result.status, { error: friendly[result.status] || (busy ? 'Gemini is busy right now. Try again shortly.' : 'Gemini error: ' + String(result.message).slice(0, 200)) });
    }
    let parsed;
    const m = result.text.match(/\{[\s\S]*\}/);
    try { parsed = JSON.parse(m ? m[0] : ''); }
    catch { return send(res, 502, { error: 'Could not understand the AI response. Please try again.' }); }
    return send(res, 200, parsed);
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return send(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'index.html')), 'text/html; charset=utf-8');
  }

  send(res, 404, { error: 'Not found' });
});

if (!KEY) console.warn('Warning: GEMINI_API_KEY is not set. Transcription will fail until you set it.');
server.listen(PORT, () => console.log(`HandRewrite running at http://localhost:${PORT}`));