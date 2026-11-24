# Strike

A personal, mobile-first **Progressive Web App (PWA)** for frictionless task planning and AI-categorized daily activity logging—built with an OLED Dark Mode, Apple/iOS-inspired UI and zero custom backend required.

## Core Features (v1)

- **Plan (Tasks Ahead):** Frictionless task capture split into **Today** and **Later** with 1-tap promote/demote and zero mandatory metadata. Checking off a task moves it into **Completed Today** and automatically logs it to Today's Daily Log.
- **Today (Brain Dump + Gemini AI):** Type or dictate what you accomplished in plain, messy text. Strike calls the Gemini API using **Structured Outputs (`responseSchema`)** (defaulting to `gemini-4-hydrogen`, with `gemini-3.5-flash-lite`, `gemini-3.8-flash`, and custom model options) to split, clean up, and strictly categorize completed activities—and pops up a quick iOS sheet to 1-tap approve unfinished tasks or check off matching open tasks.
- **History & Backfill:** Scrollable day-by-day archive with category filter pills, instant search, inline editing, and a **Log Past Day** backfill sheet.
- **Cloud Sync + Offline Local-First:** Instant local storage on boot with optional **Firebase Authentication** (Email/Password & Google Sign-In) + **Cloud Firestore** (offline IndexedDB cache) storing your tasks, logs, categories, and Gemini API key inside your UID-locked private Firestore documents.
- **Own Your Data:** 1-click **Markdown (`.md`)** and **JSON (`.json`)** exports plus lossless JSON backup import.
- **Native-Feel PWA:** Custom icons, `manifest.webmanifest`, offline Service Worker, and iOS safe-area handling (`viewport-fit=cover`).

---

## Local Development

```bash
npm install
npm run dev
```

Run tests and production build:

```bash
npm test
npm run build
```

---

## Setting Up Cloud Sync (Firebase)

Strike works immediately in local-only mode. To log in and sync your tasks, daily logs, and Gemini API key across devices:

1. Create a free Firebase project at [console.firebase.google.com](https://console.firebase.google.com/).
2. Enable **Authentication** → **Sign-in method** → turn on **Email/Password** and/or **Google**.
   - Add your GitHub Pages domain (e.g. `adityacoder1.github.io`) under **Authentication → Settings → Authorized domains**.
3. Create a **Cloud Firestore** database and publish these **Firestore Security Rules** (locks every user's data and Gemini API key strictly to their own UID):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

4. Register a **Web App** in Project Settings and either:
   - **Option A (Zero rebuild):** Paste the Firebase Web Config JSON directly inside **Strike → Settings → Cloud Sync (Firebase)**, **or**
   - **Option B (Auto-configured on GitHub Pages):** Add the following **Repository Variables** under **GitHub Repo → Settings → Secrets and variables → Actions → Variables**:
     - `VITE_FIREBASE_API_KEY`
     - `VITE_FIREBASE_AUTH_DOMAIN`
     - `VITE_FIREBASE_PROJECT_ID`
     - `VITE_FIREBASE_STORAGE_BUCKET`
     - `VITE_FIREBASE_MESSAGING_SENDER_ID`
     - `VITE_FIREBASE_APP_ID`
     - `VITE_GOOGLE_CLIENT_ID` *(recommended for Google Sign-In on Firefox Mobile & installed PWAs)*

### Mobile / Firefox Google Sign-In (Same-Tab OAuth)

Mobile browsers like Firefox Android and installed Home Screen PWAs often block cross-origin `firebaseapp.com` popups. To enable bulletproof **same-tab Google Sign-In** on GitHub Pages:

1. In [Firebase Console](https://console.firebase.google.com/) → **Authentication → Sign-in method → Google → Web SDK configuration**, copy your **Web client ID** (`...apps.googleusercontent.com`).
2. In [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**, click your auto-created **Web client** and add your GitHub Pages URL under **Authorized redirect URIs**:
   - `https://adityacoder1.github.io/strike-productivity/`
3. Add `VITE_GOOGLE_CLIENT_ID` as a GitHub Actions Repository Variable (or paste it inside **Strike → Settings → Cloud Sync → Fix Mobile**).

---

## Deploying to GitHub Pages

This repository includes `.github/workflows/deploy.yml`, which automatically tests, builds, and deploys `dist/` on pushes to `main`.

1. On GitHub, go to **Settings → Pages → Build and deployment**.
2. Set **Source** to **GitHub Actions**.
3. Push to `main` (or run the workflow manually via **Actions**).

### Install on iPhone (Home Screen)

1. Open your GitHub Pages URL (`https://adityacoder1.github.io/strike-productivity/`) in **Safari**.
2. Tap the **Share** button → **Add to Home Screen**.
3. Launch **Strike** from your Home Screen for full-screen OLED dark-mode standalone experience.