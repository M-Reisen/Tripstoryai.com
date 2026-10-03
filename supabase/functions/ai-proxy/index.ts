// M-Reisen · Edge Function "ai-proxy"
// Leitet KI-Anfragen sicher an Anthropic weiter. Der API-Key bleibt geheim.
// Prüft: Nutzer eingeloggt? Tageslimit nicht überschritten?
// Modell und Antwortlänge legt der Server fest, nicht der Browser.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const TAGESLIMIT = 20;               // max. KI-Aufrufe pro Nutzer pro Tag
const MODELL = 'claude-sonnet-4-6';  // einziges erlaubtes Modell
const MAX_TOKENS = 3000;             // längste Antwort, die die Seiten anfordern
const MAX_BODY = 15 * 1024 * 1024;   // max. Anfragegröße (Seite erlaubt Belege bis ≈14 MB Base64)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // CORS-Vorabanfrage
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Nur POST erlaubt.' }, 405);
  }

  try {
    // 1) Nutzer aus dem Auth-Token ermitteln
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return json({ error: 'Nicht eingeloggt.' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ error: 'Ungültige Sitzung.' }, 401);
    }
    const userId = userData.user.id;

    // 2) Anfrage prüfen: Größe und Aufbau
    const raw = await req.text();
    if (raw.length > MAX_BODY) {
      return json({ error: 'Datei zu groß. Bitte ein kleineres Foto oder PDF wählen.' }, 413);
    }
    let body: { max_tokens?: number; messages?: unknown; system?: unknown };
    try { body = JSON.parse(raw); } catch { return json({ error: 'Ungültige Anfrage.' }, 400); }
    if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 20) {
      return json({ error: 'Ungültige Anfrage.' }, 400);
    }
    const maxTokens = Math.min(Math.max(Number(body.max_tokens) || 1000, 1), MAX_TOKENS);

    // 3) Tageslimit atomar reservieren (mit service role, um RLS zu umgehen)
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: stand, error: limitErr } = await admin.rpc('ai_usage_reserve', { p_user: userId, p_limit: TAGESLIMIT });
    if (limitErr) {
      return json({ error: 'Serverfehler beim Tageslimit.' }, 500);
    }
    if (stand === -1) {
      return json({ error: 'Tageslimit erreicht (' + TAGESLIMIT + ' KI-Aufrufe). Morgen geht es weiter.' }, 429);
    }

    // 4) Anfrage an Anthropic weiterleiten (nur erlaubte Felder)
    const anfrage: Record<string, unknown> = { model: MODELL, max_tokens: maxTokens, messages: body.messages };
    if (typeof body.system === 'string') anfrage.system = body.system;
    let anthropicRes: Response;
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(anfrage),
      });
    } catch (e) {
      await admin.rpc('ai_usage_release', { p_user: userId });
      throw e;
    }

    const result = await anthropicRes.json();

    // 5) Bei Fehler den reservierten Aufruf zurückgeben
    if (!anthropicRes.ok) {
      await admin.rpc('ai_usage_release', { p_user: userId });
    }

    return json(result, anthropicRes.status);
  } catch (e) {
    console.error('ai-proxy:', e);
    return json({ error: 'Serverfehler. Bitte später erneut versuchen.' }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}
