# HandRewrite

Turn a photo of an assignment into an editable page written in a handwriting style.

## Files
- `index.html`: homepage
- `app.html`: the editor (upload, read, edit, style, export)
- `api/transcribe.js`: server function that reads photos with Gemini. It holds the key.
- `vercel.json`: sets the function time limit

## Deploy on Vercel (recommended)
The shared reader needs Vercel, because the key must stay on a server. GitHub Pages can host the pages but cannot run `api/transcribe.js`.

1. Push this folder to your GitHub repository.
2. On vercel.com, sign in with GitHub, click **Add New → Project**, and import the repository. Leave the settings as they are and click **Deploy**.
3. Open **Settings → Environment Variables**. Add `GEMINI_API_KEY` with your key from Google AI Studio. Save.
4. Go to **Deployments** and click **Redeploy** so the key takes effect.

Visitors can then use the site without a key. Anyone who pastes their own key in the tool uses their own quota.

## Limits
- The free Gemini quota is shared by everyone using the site. Heavy use will hit the limit, and visitors will see a message asking them to wait.
- Never put the key in any file in this repository. If a key is ever exposed, delete it in Google AI Studio and create a new one.
