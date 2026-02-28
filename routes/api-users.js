const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.warn('Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE not set — API routes will not function without them');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

// helper: create DOMPurify instance per request (JSDOM window)
function createSanitizer() {
  const window = new JSDOM('').window;
  return createDOMPurify(window);
}

// POST /api/users/:id/profile
// Body: { profile_html }
router.post('/users/:id/profile', async (req, res) => {
  try {
    const targetId = req.params.id;
    const signedUserId = req.signedCookies && req.signedCookies.user_id;

    if (!signedUserId) return res.status(401).json({ error: 'Not authenticated' });
    if (signedUserId !== targetId) return res.status(403).json({ error: 'Forbidden' });

    const { profile_html } = req.body || {};
    if (typeof profile_html !== 'string') return res.status(400).json({ error: 'Invalid profile_html' });

    // Sanitize server-side
    const DOMPurify = createSanitizer();
    const clean = DOMPurify.sanitize(profile_html);

    // Upsert into user_profile table
    const payload = { user_id: signedUserId, profile_html: clean, updated_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from('user_profile')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      console.error('Supabase upsert error:', error.message || error);
      return res.status(500).json({ error: 'Database error' });
    }

    return res.json({ ok: true, profile: data });
  } catch (err) {
    console.error('Error in POST /api/users/:id/profile', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
