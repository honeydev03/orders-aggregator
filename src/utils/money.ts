/**
 * Деньги внутри сервиса — целые копейки. Рубли — только на входе (внешний API) и в ответах.
 */

/** Сумма из внешнего API: число или строка с числом ("250.10"). */
export function parseRub(raw: unknown): number {
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`invalid amount: ${JSON.stringify(raw)}`);
  }
  return value;
}

/**
 * Рубли → копейки. Доли копейки отбрасываются: деньги клиенту не досчитываем.
 *
 * `rub * 100` в двоичной плавающей точке даёт шум (4723.9 * 100 = 472389.99999999994),
 * и голый Math.floor теряет копейку. Поэтому сначала убираем шум (округление до 1e-6 коп.),
 * и только потом отбрасываем настоящие доли копейки.
 */
export function toKop(rub: number): number {
  return Math.floor(Number((rub * 100).toFixed(6)));
}

/** Копейки → рубли для ответа API. */
export function fromKop(kop: number): number {
  return kop / 100;
}

/** Процент скидки из внешнего API: число или строка с числом ("15"), 0..100. */
export function parsePercent(raw: unknown): number {
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`invalid discountPercent: ${JSON.stringify(raw)}`);
  }
  return value;
}

/** Сумма к оплате в копейках по сумме до скидки и проценту скидки (запасной путь, если amountPaid не пришёл). */
export function kopAfterDiscount(grossKop: number, percent: number): number {
  const basisPoints = Math.round(percent * 100); // 12.5 % → 1250
  return Math.round((grossKop * (10_000 - basisPoints)) / 10_000);
}
