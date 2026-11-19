export function retryAfterSeconds(value: string | null, now = Date.now()) {
  if (!value?.trim()) return undefined;
  const seconds = /^\d+$/.test(value.trim())
    ? Number(value)
    : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : undefined;
}

export function remainingSeconds(until: number, now = Date.now()) {
  return Math.max(0, Math.ceil((until - now) / 1000));
}
