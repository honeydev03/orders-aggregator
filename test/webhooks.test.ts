import { describe, expect, it } from "vitest";
import { apiOrder, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("POST /webhooks/order", () => {
  it("создаёт заказ", async () => {
    const res = await postWebhook(ctx.app, apiOrder());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: "created" });
  });

  it("повтор того же события ничего не меняет", async () => {
    const o = apiOrder();
    await postWebhook(ctx.app, o);
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
  });

  it("устаревшее событие после нового игнорируется", async () => {
    const o = apiOrder({ status: "paid", updatedAt: "2026-02-10T12:00:00Z" });
    await postWebhook(ctx.app, { ...o, status: "refunded", updatedAt: "2026-02-11T12:00:00Z" });
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
    const { rows } = await ctx.db.query(`SELECT status FROM orders WHERE id = $1`, [o.id]);
    expect(rows[0].status).toBe("refunded");
  });

  it("новое событие обновляет заказ", async () => {
    const o = apiOrder({ status: "pending" });
    await postWebhook(ctx.app, o);
    const res = await postWebhook(ctx.app, { ...o, status: "paid", updatedAt: "2026-02-11T00:00:00Z" });
    expect(res.json()).toEqual({ result: "updated" });
  });

  it("невалидное тело — 400", async () => {
    const res = await postWebhook(ctx.app, { id: "x" });
    expect(res.statusCode).toBe(400);
  });
  it("параллельная доставка старой и новой версии не откатывает заказ", async () => {
    for (let i = 0; i < 20; i++) {
      const old = apiOrder({ status: "paid", updatedAt: "2026-02-10T12:00:00Z" });
      const fresh = { ...old, status: "refunded", updatedAt: "2026-02-11T12:00:00Z" };
      // старая и новая версии + повторы, все одновременно
      await Promise.all([old, fresh, old, fresh, old].map((o) => postWebhook(ctx.app, o)));
      const { rows } = await ctx.db.query(`SELECT status FROM orders WHERE id = $1`, [old.id]);
      expect(rows[0].status).toBe("refunded");
    }
  });

  it("сохраняет amountPaid (в копейках, без потерь на плавающей точке)", async () => {
    const o = apiOrder({ amount: "5000.00", discountPercent: "5.52", amountPaid: 4723.9 });
    await postWebhook(ctx.app, o);
    const { rows } = await ctx.db.query(`SELECT amount_kop, amount_paid_kop FROM orders WHERE id = $1`, [o.id]);
    expect([Number(rows[0].amount_kop), Number(rows[0].amount_paid_kop)]).toEqual([500000, 472390]);
  });

  it("обновление версии меняет и amountPaid", async () => {
    const o = apiOrder({ status: "pending", amount: 1000, discountPercent: 0, amountPaid: 1000 });
    await postWebhook(ctx.app, o);
    await postWebhook(ctx.app, { ...o, status: "paid", discountPercent: 10, amountPaid: 900, updatedAt: "2026-02-11T00:00:00Z" });
    const { rows } = await ctx.db.query(`SELECT amount_paid_kop, status FROM orders WHERE id = $1`, [o.id]);
    expect([Number(rows[0].amount_paid_kop), rows[0].status]).toEqual([90000, "paid"]);
  });
});
