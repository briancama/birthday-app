// Copy to js/config.js and fill in your project keys (publishable/anon keys only —
// never the service role). Dev vs prod is selected automatically by hostname.
const isLocal =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname === "";

export const SUPABASE_CONFIG = isLocal
  ? {
      // DEV Supabase project
      url: "https://your-dev-project.supabase.co",
      key: "sb_publishable_your_dev_key",
    }
  : {
      // PRODUCTION Supabase project
      url: "https://your-prod-project.supabase.co",
      key: "sb_publishable_your_prod_key",
    };

export const FIREBASE_CONFIG = isLocal
  ? {
      // DEV Firebase project (web app config from Firebase console)
      apiKey: "your-dev-api-key",
      authDomain: "your-dev-project.firebaseapp.com",
      projectId: "your-dev-project",
      storageBucket: "your-dev-project.firebasestorage.app",
      messagingSenderId: "000000000000",
      appId: "1:000000000000:web:xxxxxxxxxxxxxxxxxxxxxx",
    }
  : {
      // PRODUCTION Firebase project
      apiKey: "your-prod-api-key",
      authDomain: "your-prod-project.firebaseapp.com",
      projectId: "your-prod-project",
      storageBucket: "your-prod-project.firebasestorage.app",
      messagingSenderId: "000000000000",
      appId: "1:000000000000:web:xxxxxxxxxxxxxxxxxxxxxx",
    };

export const APP_CONFIG = {
  // Disable auto-refresh in development for easier browser inspection
  enableAutoRefresh: !isLocal,
  refreshInterval: 10000,
};

// Web Push public keys (npx web-push generate-vapid-keys); private keys go in .env
const VAPID_PUBLIC_KEY_DEV = "your-dev-vapid-public-key";
const VAPID_PUBLIC_KEY_PROD = "your-prod-vapid-public-key";

export const VAPID_PUBLIC_KEY = isLocal ? VAPID_PUBLIC_KEY_DEV : VAPID_PUBLIC_KEY_PROD;
