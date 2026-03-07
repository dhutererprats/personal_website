// Astronaut Training auth configuration.
// By default this keeps the page in local-only mode.
// To enable account sign-in, set provider to "supabase"
// and fill supabaseUrl + supabaseAnonKey.
window.ASTRO_AUTH_CONFIG = window.ASTRO_AUTH_CONFIG || {
  provider: "local",
  supabaseUrl: "",
  supabaseAnonKey: ""
};
