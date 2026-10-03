// M-Reisen · Edge Function "ai-demo"
// „Ohne Anmeldung testen“: Besucher laden EIN Bild (Kassenzettel, Buchungs-Screenshot, Ticket) hoch
// und bekommen einen kurzen Tagesbericht als Probe. Nichts wird gespeichert.
// Schutz: festes Modell und fester Auftrag (der Browser schickt nur das Bild), kleines Antwortlimit,
// Limit pro IP und Gesamtlimit pro Tag, optional Cloudflare Turnstile (wenn TURNSTILE_SECRET gesetzt ist).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const LIMIT_PRO_IP = 3;          // Testaufrufe pro Besucher (IP) und Tag
const LIMIT_GESAMT = 100;        // Testaufrufe aller Besucher zusammen pro Tag (Kostendeckel)
const MODELL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 700;
const MAX_BILD = 3 * 1024 * 1024; // Base64-Länge; die Seite verkleinert Bilder vorher auf ca. 0,5 MB
const BILDTYPEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const AUFTRAG = `Du bist die KI von Travona, einem Reisetagebuch. Auf dem Bild ist ein Reisebeleg: ein Kassenzettel, eine Rechnung, ein Ticket oder ein Screenshot einer Buchung (z. B. Hotel, Flug, Mietwagen, Ausflug).
Lies die wichtigsten Angaben aus und schreibe daraus einen kurzen Tagebuch-Eintrag in der Ich-Form, 3 bis 4 Sätze, auf Deutsch, so wie ihn ein Reisender abends notieren würde.
Regeln: Keine Ausrufezeichen. Keine Superlative und keine Wörter wie "traumhaft", "atemberaubend", "unvergesslich", "magisch". Keine Werbefloskeln, kein Fazit. Nur erwähnen, was auf dem Beleg steht oder sich direkt daraus ergibt, nichts dazuerfinden. Persönliche Daten wie Namen, Buchungsnummern oder Kartennummern nicht wiedergeben.
Antworte NUR mit JSON in genau dieser Form:
{"art":"Kassenzettel|Buchung|Ticket|Rechnung|Sonstiges","ort":"Ort oder leer","datum":"JJJJ-MM-TT oder leer","betrag":Zahl oder null,"waehrung":"EUR","titel":"kurzer Titel für den Tag, höchstens 6 Wörter","text":"der Tagebuch-Eintrag"}
Wenn auf dem Bild kein Reisebeleg zu erkennen ist, antworte nur mit {"fehler":"kurzer Hinweis, was auf dem Bild fehlt"}.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Nur POST erlaubt.' }, 405);

  try {
    const raw = await req.text();
    if (raw.length > MAX_BILD + 20000) return json({ error: 'Das Bild ist zu groß.' }, 413);
    let body: { bild?: unknown; typ?: unknown; captcha?: unknown };
    try { body = JSON.parse(raw); } catch { return json({ error: 'Ungültige Anfrage.' }, 400); }
    const bild = typeof body.bild === 'string' ? body.bild : '';
    const typ = typeof body.typ === 'string' ? body.typ : '';
    if (!bild || !BILDTYPEN.includes(typ) || !/^[A-Za-z0-9+/=]+$/.test(bild)) {
      return json({ error: 'Bitte ein Foto oder einen Screenshot (JPG, PNG, WebP) hochladen.' }, 400);
    }
    if (bild.length > MAX_BILD) return json({ error: 'Das Bild ist zu groß.' }, 413);

    // 1) Bot-Schutz (nur wenn das Turnstile-Geheimnis als Secret hinterlegt ist)
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unbekannt';
    const secret = Deno.env.get('TURNSTILE_SECRET');
    if (secret) {
      const form = new FormData();
      form.append('secret', secret);
      form.append('response', typeof body.captcha === 'string' ? body.captcha : '');
      if (ip !== 'unbekannt') form.append('remoteip', ip);
      const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
      const vr = await v.json().catch(() => ({}));
      if (!vr.success) return json({ error: 'Die Sicherheitsprüfung ist fehlgeschlagen. Bitte Seite neu laden.' }, 403);
    }

    // 2) Limits: nur ein Hash der IP wird gezählt (täglich wechselnd, nicht zurückrechenbar)
    const salz = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').slice(-24);
    const ipHash = await sha256(ip + '|' + new Date().toISOString().slice(0, 10) + '|' + salz);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: stand, error: limitErr } = await admin.rpc('ai_demo_reserve', {
      p_ip: ipHash, p_ip_limit: LIMIT_PRO_IP, p_total_limit: LIMIT_GESAMT,
    });
    if (limitErr) return json({ error: 'Serverfehler. Bitte später erneut versuchen.' }, 500);
    if (stand === -1) return json({ error: 'Du hast heute schon ' + LIMIT_PRO_IP + ' Proben gemacht. Mit einem Konto geht es sofort weiter.', limit: true }, 429);
    if (stand === -2) return json({ error: 'Heute sind alle Proben vergeben. Mit einem Konto geht es sofort weiter.', limit: true }, 429);

    // 3) Fester Auftrag an Anthropic
    let res: Response;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODELL,
          max_tokens: MAX_TOKENS,
          system: AUFTRAG,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: typ, data: bild } },
            { type: 'text', text: 'Hier ist mein Reisebeleg.' },
          ] }],
        }),
      });
    } catch (e) {
      await admin.rpc('ai_demo_release', { p_ip: ipHash });
      throw e;
    }
    const result = await res.json().catch(() => null);
    if (!res.ok || !result) {
      await admin.rpc('ai_demo_release', { p_ip: ipHash });
      console.error('ai-demo anthropic:', res.status, JSON.stringify(result).slice(0, 300));
      return json({ error: 'Die KI ist gerade nicht erreichbar. Bitte später erneut versuchen.' }, 502);
    }

    // 4) JSON aus der Antwort lesen
    const text = (result.content || []).map((c: { text?: string }) => c.text || '').join('');
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    let ergebnis: Record<string, unknown> | null = null;
    try { ergebnis = JSON.parse(text.slice(a, b + 1)); } catch { ergebnis = null; }
    if (!ergebnis) return json({ error: 'Das hat nicht geklappt. Versuch es mit einem schärferen Bild.' }, 422);
    return json({ ergebnis, rest: Math.max(LIMIT_PRO_IP - Number(stand), 0) });
  } catch (e) {
    console.error('ai-demo:', e);
    return json({ error: 'Serverfehler. Bitte später erneut versuchen.' }, 500);
  }
});

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'content-type': 'application/json' } });
}
