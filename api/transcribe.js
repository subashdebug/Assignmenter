const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const PREFERRED = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest'];
const RETRYABLE = [404, 429, 500, 503];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SYS = 'You transcribe images of school or university assignments. Transcribe ALL text exactly as written, including spelling and punctuation mistakes. Do not fix, rephrase, summarize, translate, or add anything. Preserve structure: headings, numbering, bullet points, line breaks, paragraphs, and blank answer space. Write math and formulas in plain text or LaTeX-style. Mark any diagram, graph or drawing as a separate block whose text is "[DIAGRAM: short description]" and add "box": [x,y,w,h] with fractions (0 to 1) of the full image width and height that enclose it. Block types: heading, paragraph, list, math, diagram. Return ONLY JSON with no markdown fences or commentary: {"blocks":[{"type":"heading|paragraph|list|math|diagram","text":"...","box":[x,y,w,h]}]}. Include box only for diagram blocks. If the image is too blurry to read, return {"error":"blurry"}. If it contains no readable text, return {"error":"no_text"}.';

async function callModel(KEY, model, image) {
  const body = {
    systemInstruction: { parts: [{ text: SYS }] },
    contents: [{ parts: [
      { inline_data: { mime_type: 'image/jpeg', data: image } },
      { text: 'Transcribe this assignment.' }
    ] }],
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: 8000,
      ...(/2\.5|latest/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {})
    }
  };
  try {
    const r = await fetch(BASE + model + ':generateContent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
    if (r.ok) {
      const j = await r.json();
      return { ok: true, text: (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('') };
    }
    let message = await r.text();
    try { message = JSON.parse(message).error.message; } catch {}
    return { ok: false, status: r.status, message };
  } catch (e) {
    return { ok: false, status: 504, message: 'Gemini took too long.' };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'Server has no GEMINI_API_KEY set.' });
  const raw = req.body?.image;
  if (typeof raw !== 'string' || !raw.length) return res.status(400).json({ error: 'No image was sent.' });
  const image = raw.replace(/^data:image\/\w+;base64,/, '');

  // Try up to 2 rounds across the models to stay within the time limit.
  let last = { status: 500, message: 'No model available.' };
  const names = PREFERRED.slice(0, 3);
  for (let round = 0; round < 2; round++) {
    for (const model of names) {
      const result = await callModel(KEY, model, image);
      if (result.ok) {
        const m = result.text.match(/\{[\s\S]*\}/);
        try { return res.status(200).json(JSON.parse(m ? m[0] : '')); }
        catch { return res.status(502).json({ error: 'Could not understand the AI response. Please try again.' }); }
      }
      last = result;
      if (!RETRYABLE.includes(result.status) && result.status !== 504) break;
    }
    if (round === 0) await sleep(2000);
  }
  const busy = last.status >= 500 || last.status === 404 || last.status === 504;
  const friendly = {
    400: 'Gemini rejected the image. Try a smaller photo.',
    403: 'This Gemini key is not allowed. Create a new key in Google AI Studio.',
    429: 'Gemini free-tier limit reached. Wait a minute and try again.'
  };
  return res.status(busy ? 503 : last.status).json({
    error: friendly[last.status] || (busy ? 'Gemini is busy right now. Wait a minute and click again.' : 'Gemini error: ' + String(last.message).slice(0, 200))
  });
};