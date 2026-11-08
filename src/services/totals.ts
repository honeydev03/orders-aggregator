import type { OrdersRepository } from "../repositories/orders.js";
import { fromKop } from "../utils/money.js";
import { datesBetween, localDateFormatter } from "../utils/time.js";
import type { CustomersService } from "./customers.js";

export interface DailyTotal {
  date: string;
  /** Для обратной совместимости: то же, что gross. */
  total: number;
  /** Сумма оплаченных заказов до скидки. */
  gross: number;
  /** gross - net. */
  discount: number;
  /** Сколько клиенты фактически заплатили. */
  net: number;
}

const DAY = 86_400_000;

export class TotalsService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly customers: CustomersService,
  ) {}

  /**
   * Статистика оплаченных заказов клиента по дням в его таймзоне, from..to включительно.
   * Дни без оплат — с нулями. День заказа определяется по смещению зоны в момент заказа (переходы DST).
   */
  async daily(customerId: string, from: string, to: string): Promise<DailyTotal[]> {
    const timezone = await this.customers.timezone(customerId);
    const localDate = localDateFormatter(timezone);

    // Смещения таймзон в пределах ±14 ч: берём с запасом в сутки с каждой стороны
    const rows = await this.orders.paidCreatedBetween(
      customerId,
      new Date(Date.parse(`${from}T00:00:00Z`) - DAY),
      new Date(Date.parse(`${to}T00:00:00Z`) + 2 * DAY),
    );

    const sums = new Map(datesBetween(from, to).map((d) => [d, { gross: 0, net: 0 }]));
    for (const o of rows) {
      const day = sums.get(localDate(o.createdAt));
      if (day) {
        day.gross += o.amountKop;
        day.net += o.amountPaidKop;
      }
    }
    return [...sums].map(([date, { gross, net }]) => ({
      date,
      total: fromKop(gross),
      gross: fromKop(gross),
      discount: fromKop(gross - net),
      net: fromKop(net),
    }));
  }
}
