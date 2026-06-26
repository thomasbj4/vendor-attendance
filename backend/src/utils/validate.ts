export function parseId(value: unknown): number | null {
  const id = parseInt(String(value), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function parsePositiveInt(value: unknown): number | null {
  const n = parseInt(String(value), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}
