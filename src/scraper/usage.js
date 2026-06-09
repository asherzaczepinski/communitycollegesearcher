// Tiny global usage meter for the scraper's network activity.
//
// The scraper has no LLM, so there are no "tokens" in the AI sense — the real
// cost of a recheck is the HTTP work it does. This counts every outbound request
// and the bytes pulled, so the UI can show "how much did this recheck spend" and
// let the user reset the meter.
const meter = { requests: 0, bytes: 0, since: new Date().toISOString() };

export function recordRequest(bytes = 0) {
  meter.requests += 1;
  meter.bytes += bytes || 0;
}

export function getUsage() {
  return { ...meter, mb: Math.round((meter.bytes / 1e6) * 10) / 10 };
}

export function resetUsage() {
  meter.requests = 0;
  meter.bytes = 0;
  meter.since = new Date().toISOString();
  return getUsage();
}
