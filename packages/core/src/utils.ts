export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function formatList(items: string[]): string {
  if (items.length === 0) {
    return '';
  }

  if (items.length === 1) {
    return items[0] ?? '';
  }

  if (items.length === 2) {
    return `${items[0] ?? ''} and ${items[1] ?? ''}`;
  }

  const lastItem = items.at(-1);
  return lastItem ? `${items.slice(0, -1).join(', ')}, and ${lastItem}` : items.join(', ');
}
