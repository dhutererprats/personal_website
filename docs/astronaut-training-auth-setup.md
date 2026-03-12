# Astronaut Training Auth Setup (Supabase)

This page now supports real account login instead of a hardcoded client-side passcode.

## 1) Create a Supabase project

1. Create a project at [https://supabase.com](https://supabase.com).
2. In `Authentication -> Providers`, enable `Email`.
3. Decide whether email confirmation is required (recommended for public usage).

## 2) Add website URL to allowed redirects

In `Authentication -> URL Configuration`, add:

- `https://dhutererprats.github.io/personal_website/`
- `https://dhutererprats.github.io/personal_website/astronaut-training.html`

## 3) Enable anti-bot + abuse protections (recommended)

In Supabase Auth settings, enable:

- email confirmation
- bot protection (Cloudflare Turnstile or hCaptcha)
- rate limits for signup/signin/reset endpoints

This is the primary defense against scripted mass account creation when auth is public.

## 4) Configure this repository

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

## 5) Test login

1. Open `astronaut-training.html`.
2. Create account with email + password.
3. If confirmation is enabled, verify email and sign in.
4. Confirm top bar shows `Signed in: ...` and `Sign Out` appears.

## 6) Fallback behavior

If Supabase config is missing/empty, the page stays usable with:

- `Create Account` (local account on that device only)
- `Sign In` (to that local account)
- `Local-Only Mode` (guest mode for current browser session)

## 7) Leaderboard schema

To enable optional leaderboard sync, apply the SQL in:
[astronaut-training-leaderboard-setup.md](/Users/dahu1128/Library/CloudStorage/OneDrive-UCB-O365/Documents/Daniel/Personal_Website/HutererPrats.github.io-main/docs/astronaut-training-leaderboard-setup.md)
