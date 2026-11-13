# HandRewrite

Turn a photo of an assignment into an editable page written in your own handwriting style.

## Use it
- Open `index.html` for the homepage, then click **Start with a photo**.
- Or open `app.html` directly.

Everything runs in your browser. No account is needed. Photos stay on your device unless you paste a Gemini key in the optional "Better handwriting reading" section, in which case the photo is sent to Google for reading.

## Files
- `index.html`: homepage
- `app.html`: the editor (upload, read, edit, style, export)

## Publish with GitHub Pages
1. Upload both files to the root of the repository.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then click **Save**.
4. Your site opens at `https://<your-username>.github.io/<repo-name>/`.

## Notes
- Do not commit API keys to this repository.
- Offline reading (Tesseract) works best on printed text. Handwriting is more accurate with the Gemini option.
