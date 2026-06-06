// Normalize the many ways colleges label delivery method into 3 buckets.
export const MODALITIES = ['in_person', 'online', 'hybrid'];

export function normalizeModality(raw) {
  if (!raw) return 'in_person';
  const s = String(raw).toLowerCase();

  // Hybrid first — it often contains the word "online" too.
  if (/hybrid|blend|partially online|partly online|hyflex|some on ?campus|online & on/.test(s)) {
    return 'hybrid';
  }
  if (/online|distance|virtual|remote|async|asynchronous|sync(hronous)?|web[- ]?based|dl\b|oltr|olnc/.test(s)) {
    return 'online';
  }
  if (/in[- ]?person|on[- ]?campus|face[- ]?to[- ]?face|lecture|classroom|traditional|ground/.test(s)) {
    return 'in_person';
  }
  return 'in_person';
}

export const MODALITY_LABELS = {
  in_person: 'In Person',
  online: 'Online',
  hybrid: 'Hybrid',
};
