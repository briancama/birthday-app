// Supabase Edge Function: Validate Firebase ID Token and Proxy to Supabase
// File: supabase/functions/validate-firebase-token/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { initializeApp, cert } from "npm:firebase-admin/app";
import { getAuth } from "npm:firebase-admin/auth";

// Initialize Firebase Admin SDK with environment variables
initializeApp({
  credential: cert({
    projectId: Deno.env.get("FIREBASE_PROJECT_ID"),
    clientEmail: Deno.env.get("FIREBASE_CLIENT_EMAIL"),
    privateKey: Deno.env.get("FIREBASE_PRIVATE_KEY"),
  }),
});

serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Missing Authorization", { status: 401 });

  const DEV_MODE = Deno.env.get("DEV_MODE") === "true";
  if (DEV_MODE) {
    // Optionally, check for test phone numbers or tokens here
    // Return a mock user or relaxed response for dev
    return new Response(JSON.stringify({ dev: true, user_id: "test-user" }), { status: 200 });
  }

  const idToken = authHeader.replace("Bearer ", "");
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    const userId = decoded.uid;

    // Proxy request to Supabase with userId for RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const targetPath = new URL(req.url).pathname.replace("/validate-firebase-token", "/rest/v1");
    const proxyRes = await fetch(`${supabaseUrl}${targetPath}`, {
      method: req.method,
      headers: {
        ...req.headers,
        Authorization: `Bearer ${supabaseKey}`,
        "X-User-Id": userId,
      },
      body: req.body,
    });

    // Return proxied response
    return proxyRes;
  } catch (err) {
    return new Response("Invalid token", { status: 401 });
  }
});

// Usage:
// - Deploy this function as a Supabase Edge Function named "validate-firebase-token"
// - Client sends Firebase ID token in Authorization header
// - Edge Function verifies token, extracts userId, proxies request to Supabase
// - Supabase RLS policies use userId from X-User-Id header
