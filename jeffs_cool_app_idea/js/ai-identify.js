import { blobToBase64 } from './utils.js';

// Calls Claude's vision API directly from the browser to guess an
// appliance/equipment's manufacturer, model number, and category from a
// photo. Requires the user's own Anthropic API key (entered in Settings,
// stored only in this browser's IndexedDB). The key is sent only to
// api.anthropic.com — never to any other server — via the
// anthropic-dangerous-direct-browser-access header, which Anthropic
// requires as an explicit acknowledgement that the key is exposed to
// whoever controls this browser session. That's an acceptable trade-off
// for a personal, single-user tool; it is not safe to do this in an app
// multiple untrusted people will use with a shared key.

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5-5';

const PROMPT = `You are looking at a photo of a home appliance, fixture, or piece of equipment (HVAC unit, water heater, generator, electrical panel, light fixture, faucet, etc.), usually of its nameplate/label or the unit itself.

Identify what you can and respond with ONLY a JSON object (no markdown fences, no commentary) with these keys:
{
  "category": "best-guess category, e.g. HVAC, Appliance, Plumbing Fixture, Lighting, Electrical, Generator, Other",
  "manufacturer": "manufacturer name or null",
  "modelNumber": "model number or null",
  "serialNumber": "serial number or null, only if clearly legible",
  "confidence": "high | medium | low",
  "notes": "anything else useful: capacity, fuel type, voltage, what you weren't sure about"
}

If you genuinely cannot read a nameplate or identify the item, set fields to null and confidence to "low" rather than guessing specifics.`;

export async function identifyFromImage(blob, { apiKey, model } = {}) {
  if (!apiKey) {
    throw new Error('No Anthropic API key configured. Add one in Settings to use photo identification.');
  }
  const base64 = await blobToBase64(blob);
  const mediaType = blob.type || 'image/jpeg';

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = (data.content || []).map((block) => block.text || '').join('\n').trim();
  return parseResult(text);
}

function parseResult(text) {
  const cleaned = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { category: null, manufacturer: null, modelNumber: null, serialNumber: null, confidence: 'low', notes: text };
  }
}
