# HandRewrite

Photograph an assignment, read it with Gemini, and re-create it in a handwriting style. The API key stays on the server.

## Requirements
- Node.js 18 or newer (check with `node -v`)
- A Gemini API key from https://aistudio.google.com

## Run it

Windows (PowerShell):
```
cd F:\Subash\Assignmenter\handrewrite-app
$env:GEMINI_API_KEY="paste_your_key_here"
npm start
```

macOS / Linux:
```
cd handrewrite-app
GEMINI_API_KEY=paste_your_key_here npm start
```

Then open http://localhost:3000 in your browser.

## Files
- `server.js`: the backend. Holds the key, lists models your key can use, picks the fastest, and returns clean JSON.
- `public/index.html`: the app UI. Calls `/api/transcribe` on the same server.
- `package.json`: project metadata and the start script.

## Notes
- The key is read from an environment variable and never sent to the browser.
- Free-tier limits apply. If you see a busy or rate-limit message, wait a minute and retry.
- Do not commit your key to GitHub. If you publish this repo, push only the code.
- GitHub Pages cannot run `server.js`, so the hosted page cannot transcribe. Run it locally with the command above.
