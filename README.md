# VibeLens

VibeLens breaks unfamiliar code into readable blocks, flags security risks, and lets you review AI edits before applying them. Built for Google’s #BuildHybridAI hackathon.

[Try the live demo](https://vibelens-am.vercel.app/) and select **Try demo files** to get started.

- **Read and learn** with plain-language explanations, architecture maps, and interactive Vibe Cards.
- **Bring your code** by uploading files, pasting a snippet, or importing a public GitHub repository.
- **Review security** with VibeGuard’s local scan for likely credentials and unsafe patterns.
- **Preview edits** with Gemini 3.5 Flash-Lite through Firebase AI Logic. VibeGuard masks detected credentials in the request before sending it. The workspace keeps the original code.

## Run locally

Use Node.js 20.9 or newer.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The reader and demo files work without Firebase configuration. For cloud edits, copy [`.env.example`](.env.example) to `.env.local`, add your Firebase web app settings, and configure [Firebase App Check](https://firebase.google.com/docs/ai-logic/app-check). Set `NEXT_PUBLIC_ENABLE_FIREBASE_MUTATE=true` in production and authorize the deployed domain in reCAPTCHA Enterprise.

Run `npm run build:dist` to create a static export in `dist/`.
