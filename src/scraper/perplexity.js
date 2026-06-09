// Tiny Perplexity API client. Used to research the colleges whose schedule we
// can't crack and that aren't on the CVC Exchange — to find the public
// schedule-of-classes URL and learn whether it's login-blocked.
//
// Reads the key from env: PPLX_API_KEY. Never hardcode the key in the repo.
//   export PPLX_API_KEY=pplx-...
const ENDPOINT = 'https://api.perplexity.ai/chat/completions';

export function pplxKey() {
  const k = process.env.PPLX_API_KEY;
  if (!k) throw new Error('PPLX_API_KEY env var not set');
  return k;
}

// Ask Perplexity a question. Returns { answer, citations, results }.
// `results` is the structured search_results array (title/url/snippet).
export async function ask(prompt, { model = 'sonar', system = null, timeoutMs = 60000 } = {}) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pplxKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Perplexity HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    return {
      answer: json.choices?.[0]?.message?.content || '',
      citations: json.citations || [],
      results: json.search_results || [],
    };
  } finally {
    clearTimeout(t);
  }
}
