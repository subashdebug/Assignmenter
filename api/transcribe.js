// Vercel serverless function. The Gemini key is read from the GEMINI_API_KEY
// environment variable on Vercel. It is never sent to the browser.
const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest'];
const PROMPT = "You are making an exact copy of a photo of a school assignment (handwritten or printed). Output the text line by line, exactly as it appears on the page. Rules: transcribe every word, number, symbol and punctuation mark exactly as written, including spelling and grammar mistakes. Never correct, complete, rephrase, summarize or translate. Keep the original order and numbering. Keep every blank line on the page as an empty line, with the same number of blank lines between sections. Keep indentation: start a line with the same number of spaces the text is indented on the page. Keep the gaps between words: use one space per normal gap and more spaces where the page has a wider gap. Write math as plain text (x^2, (a)/(b)). If a word is unclear, write your best reading followed by [?]. For each drawing, graph or figure write one line: [DIAGRAM: short description]. Ignore the notebook binding, margins and background. Output only the transcription, with no commentary and no markdown.";
const RETRY = [404, 429, 500, 503];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BUSY = 'Gemini is busy right now. Wait a minute and click again.';
const LIMIT = 'The shared reader is at its limit right now. Wait a minute and try again.';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'The shared reader is not set up yet. Paste your own key to continue.' });

  const image = req.body && typeof req.body.image === 'string' ? req.body.image : '';
  if (!image || image.length > 6000000) return res.status(400).json({ error: 'Image missing or too large.' });

  const deadline = Date.now() + 50000; // stay inside the 60 second function limit
  let last = { status: 503, message: BUSY };

  for (let round = 0; round < 2; round++) {
    for (const model of MODELS) {
      if (Date.now() > deadline) break;
      const payload = {
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: image } }] }],
        generationConfig: Object.assign({ temperature: 0, maxOutputTokens: 8000 },
          /2\.5|latest/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {})
      };
      let r;
      try {
        r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(20000)
        });
      } catch (e) {
        last = { status: 504, message: BUSY };
        continue;
      }
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
        const text = parts.map(p => p.text || '').join('').replace(/```[a-z]*\n?/gi, '');
        return res.status(200).json({ text });
      }
      let message = '';
      try { message = (await r.json()).error.message; } catch (e) {}
      last = { status: r.status, message };
      if (!RETRY.includes(r.status)) {
        return res.status(r.status === 400 || r.status === 403 ? r.status : 502).json({
          error: r.status === 429 ? LIMIT : 'Gemini error: ' + String(message).slice(0, 160)
        });
      }
    }
    if (round === 0 && Date.now() < deadline) await sleep(2000);
  }
  const limited = last.status === 429;
  return res.status(limited ? 429 : 503).json({ error: limited ? LIMIT : BUSY });
};
