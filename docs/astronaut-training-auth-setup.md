# Astronaut Training Auth Setup (Supabase)

This page now supports real account login instead of a hardcoded client-side passcode.

## 1) Create a Supabase project

1. Create a project at [https://supabase.com](https://supabase.com).
2. In `Authentication -> Providers`, enable `Email`.
3. Decide whether email confirmation is required (recommended for public usage).

## 2) Add website URL to allowed redirects

In `Authentication -> URL Configuration`, add:

- `https://dhutererprats.github.io`
- `https://dhutererprats.github.io/astronaut-training.html`

## 3) Configure this repository

Edit [astronaut-training-auth-config.js](/Users/dahu1128/Library/CloudStorage/OneDrive-UCB-O365/Documents/Daniel/Personal_Website/HutererPrats.github.io-main/astronaut-training-auth-config.js):

```js
window.ASTRO_AUTH_CONFIG = {
  provider: "supabase",
  supabaseUrl: "https://YOUR_PROJECT_ID.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY"
};
```

Notes:
- The anon key is safe to expose in a client app.
- Keep service role keys out of the frontend.

## 4) Test login

1. Open `astronaut-training.html`.
2. Create account with email + password.
3. If confirmation is enabled, verify email and sign in.
4. Confirm top bar shows `Signed in: ...` and `Sign Out` appears.

## 5) Fallback behavior

If Supabase config is missing/empty, the page stays usable in `Local-Only Mode`.
