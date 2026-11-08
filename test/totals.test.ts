import { describe, expect, it } from "vitest";
import { apiOrder, dailyTotals, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("GET /customers/:id/daily-totals", () => {
  it("суммирует оплаченные заказы по дням в таймзоне клиента", async () => {
    // c_1 — Europe/Moscow (UTC+3): 20:30Z ещё 10-е, 21:30Z уже 11-е
    await postWebhook(ctx.app, apiOrder({ amount: 1000, createdAt: "2026-02-10T20:30:00Z" }));
    await postWebhook(ctx.app, apiOrder({ amount: 250, createdAt: "2026-02-10T21:30:00Z" }));
    await postWebhook(ctx.app, apiOrder({ amount: "99", createdAt: "2026-02-11T10:00:00Z" }));

    const res = await dailyTotals(ctx.app, "c_1", "2026-02-09", "2026-02-11");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { date: "2026-02-09", total: 0, gross: 0, discount: 0, net: 0 },
      { date: "2026-02-10", total: 1000, gross: 1000, discount: 0, net: 1000 },
      { date: "2026-02-11", total: 349, gross: 349, discount: 0, net: 349 },
    ]);
  });

  it("не учитывает pending и refunded", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 500 }));
    await postWebhook(ctx.app, apiOrder({ amount: 700, status: "pending" }));
    await postWebhook(ctx.app, apiOrder({ amount: 900, status: "refunded" }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 500, gross: 500, discount: 0, net: 500 }]);
  });

  it("учитывает только заказы этого клиента", async () => {
    ctx.api.customers.set("c_2", "Asia/Novosibirsk");
    await postWebhook(ctx.app, apiOrder({ amount: 500 }));
    await postWebhook(ctx.app, apiOrder({ amount: 800, customerId: "c_2" }));
    const res = await dailyTotals(ctx.app, "c_2", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 800, gross: 800, discount: 0, net: 800 }]);
  });

  it("таймзона клиента берётся из API один раз", async () => {
    await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    ctx.api.customers.set("c_1", "UTC");
    await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    const { rows } = await ctx.db.query(`SELECT timezone FROM customers WHERE id = 'c_1'`);
    expect(rows[0].timezone).toBe("Europe/Moscow");
  });

  it("валидирует даты", async () => {
    expect((await dailyTotals(ctx.app, "c_1", "2026-02-30", "2026-03-01")).statusCode).toBe(400);
    expect((await dailyTotals(ctx.app, "c_1", "2026-03-02", "2026-03-01")).statusCode).toBe(400);
  });

  it("неизвестный клиент — 404", async () => {
    const res = await dailyTotals(ctx.app, "nobody", "2026-02-10", "2026-02-10");
    expect(res.statusCode).toBe(404);
  });
  it("скидки: gross до скидки, net — сколько заплатили, discount = gross - net, total = gross", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 2500, discountPercent: 0, amountPaid: 2500 }));
    await postWebhook(ctx.app, apiOrder({ amount: 3000, discountPercent: 13.75, amountPaid: 2587.5 }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 5500, gross: 5500, discount: 412.5, net: 5087.5 }]);
  });

  it("скидки не учитываются у pending и refunded; процент строкой не мешает", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 1000, discountPercent: "10", amountPaid: 900 }));
    await postWebhook(ctx.app, apiOrder({ amount: 1000, discountPercent: 50, amountPaid: 500, status: "pending" }));
    await postWebhook(ctx.app, apiOrder({ amount: 1000, discountPercent: 50, amountPaid: 500, status: "refunded" }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 1000, gross: 1000, discount: 100, net: 900 }]);
  });

  it("заказ без полей скидки (до их появления в API) — без скидки; без amountPaid берём процент", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 800 }));
    await postWebhook(ctx.app, apiOrder({ amount: 1000, discountPercent: 15 }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 1800, gross: 1800, discount: 150, net: 1650 }]);
  });

  it("копейки не теряются на плавающей точке (4723.9 * 100 = 472389.999…)", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 5000, discountPercent: 5.52, amountPaid: 4723.9 }));
    await postWebhook(ctx.app, apiOrder({ amount: 1500, discountPercent: 18.8, amountPaid: 1217.61 }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 6500, gross: 6500, discount: 558.49, net: 5941.51 }]);
  });

  it("amountPaid больше amount — заказ невалиден", async () => {
    const res = await postWebhook(ctx.app, apiOrder({ amount: 100, amountPaid: 150 }));
    expect(res.statusCode).toBe(400);
  });

  // Регрессия: смещение зоны бралось на «сейчас», а не на момент заказа. Берлин переходит на летнее время
  // 2026-03-29 в 01:00 UTC. Заказы в 22:30Z: 28.03 — ещё CET (+1, то есть 23:30 того же дня),
  // 29.03 — уже CEST (+2, то есть 00:30 следующего дня). Тест падает и при «зимнем», и при «летнем» «сейчас».
  describe("переход на летнее время (Europe/Berlin)", () => {
    it("день заказа считается по смещению на момент заказа", async () => {
      ctx.api.customers.set("c_7", "Europe/Berlin");
      await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 100, createdAt: "2026-03-28T22:30:00Z" }));
      await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 200, createdAt: "2026-03-29T22:30:00Z" }));
      await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 400, createdAt: "2026-03-30T22:30:00Z" }));
      const res = await dailyTotals(ctx.app, "c_7", "2026-03-28", "2026-03-31");
      expect(res.json().map((d: { date: string; total: number }) => [d.date, d.total])).toEqual([
        ["2026-03-28", 100],
        ["2026-03-29", 0],
        ["2026-03-30", 200],
        ["2026-03-31", 400],
      ]);
    });

    it("границы суток вокруг самого перехода (01:00Z)", async () => {
      ctx.api.customers.set("c_7", "Europe/Berlin");
      await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 1, createdAt: "2026-03-28T22:59:59Z" })); // 23:59:59 CET → 28.03
      await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 2, createdAt: "2026-03-28T23:00:00Z" })); // 00:00 CET → 29.03
      await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 4, createdAt: "2026-03-29T21:59:59Z" })); // 23:59:59 CEST → 29.03
      await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 8, createdAt: "2026-03-29T22:00:00Z" })); // 00:00 CEST → 30.03
      const res = await dailyTotals(ctx.app, "c_7", "2026-03-28", "2026-03-30");
      expect(res.json().map((d: { date: string; total: number }) => [d.date, d.total])).toEqual([
        ["2026-03-28", 1],
        ["2026-03-29", 6],
        ["2026-03-30", 8],
      ]);
    });
  });
});
