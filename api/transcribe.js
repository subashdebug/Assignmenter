// Vercel serverless function. The Gemini key is read from the GEMINI_API_KEY
// environment variable on Vercel. It is never sent to the browser.
//
// How it avoids "Gemini is busy": the photo is sent to several Gemini models at
// the same time, and the first good answer wins. Each model has its own free
// quota, and one busy model does not block the others.
const MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'];
const PROMPT = "You are making an exact copy of a photo of a school assignment (handwritten or printed). Output the text line by line, exactly as it appears on the page. Rules: transcribe every word, number, symbol and punctuation mark exactly as written, including spelling and grammar mistakes. Never correct, complete, rephrase, summarize or translate. Keep the original order and numbering. Keep every blank line on the page as an empty line, with the same number of blank lines between sections. Keep indentation: start a line with the same number of spaces the text is indented on the page. Keep the gaps between words: use one space per normal gap and more spaces where the page has a wider gap. Write math as plain text (x^2, (a)/(b)). If a word is unclear, write your best reading followed by [?]. For each drawing, graph or figure write one line: [DIAGRAM: short description]. Ignore the notebook binding, margins and background. Output only the transcription, with no commentary and no markdown.";
const BUSY = 'Gemini is busy right now. Wait a minute and click again.';
const LIMIT = 'The shared reader is at its limit right now. Wait a minute and try again.';
const TOTAL_MS = 55000;    // stay inside the 60 second function limit
const MODEL_MS = 30000;    // per-model timeout inside one round
const sleep = ms => new Promise(r => setTimeout(r, ms));

function thinkingFor(model) {
  if (/^gemini-3/.test(model)) return { thinkingConfig: { thinkingLevel: 'low' } };
  if (/2\.5/.test(model)) return { thinkingConfig: { thinkingBudget: 0 } };
  return {};
}

// Resolves with the transcription text, or rejects with {status, message}.
async function askModel(model, image, KEY, timeoutMs) {
  const payload = {
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: image } }] }],
    generationConfig: Object.assign({ temperature: 0, maxOutputTokens: 8000 }, thinkingFor(model))
  };
  let r;
  try {
    r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (e) {
    throw { status: 504, message: 'network or timeout' };
  }
  if (!r.ok) {
    let message = '';
    try { message = (await r.json()).error.message; } catch (e) {}
    throw { status: r.status, message };
  }
  const j = await r.json().catch(() => ({}));
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  const text = parts.map(p => p.text || '').join('').replace(/```[a-z]*\n?/gi, '').trim();
  if (!text) throw { status: 502, message: 'empty reply' };
  return text;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const KEY = (process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!KEY) return res.status(500).json({ error: 'The shared reader is not set up yet. Paste your own key to continue.' });

  const image = req.body && typeof req.body.image === 'string' ? req.body.image : '';
  if (!image || image.length > 6000000) return res.status(400).json({ error: 'Image missing or too large.' });

  const started = Date.now();
  let last = { status: 503, message: BUSY };

  // Up to 3 rounds. Each round asks every model at once; the first good answer wins.
  for (let round = 0; round < 3; round++) {
    const left = TOTAL_MS - (Date.now() - started);
    if (left < 8000) break;
    const timeout = Math.min(MODEL_MS, left - 2000);
    try {
      const text = await Promise.any(MODELS.map(m => askModel(m, image, KEY, timeout)));
      return res.status(200).json({ text });
    } catch (agg) {
      const errors = (agg && agg.errors) || [];
      // A bad image or a bad key will fail the same way on every model: stop now.
      const fatal = errors.find(e => e && (e.status === 400 || e.status === 403));
      if (fatal) {
        return res.status(fatal.status).json({
          error: fatal.status === 403 ? 'This Gemini key is not allowed. Check the key in Vercel.' : 'Gemini rejected the image. Try a smaller photo.'
        });
      }
      const limited = errors.some(e => e && e.status === 429);
      last = { status: limited ? 429 : 503, message: '' };
    }
    if (Date.now() - started + 3000 < TOTAL_MS) await sleep(3000);
  }
  return res.status(last.status === 429 ? 429 : 503).json({
    error: last.status === 429 ? LIMIT : BUSY
  });
};
