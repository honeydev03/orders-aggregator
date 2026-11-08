import { describe, expect, it } from "vitest";
import { fromKop, kopAfterDiscount, parsePercent, parseRub, toKop } from "../src/utils/money.js";

describe("parseRub", () => {
  it("принимает число и строку с числом", () => {
    expect(parseRub(2500)).toBe(2500);
    expect(parseRub("2500.00")).toBe(2500);
    expect(parseRub(" 99 ")).toBe(99);
  });

  it("отклоняет мусор и отрицательные суммы", () => {
    expect(() => parseRub("abc")).toThrow();
    expect(() => parseRub(null)).toThrow();
    expect(() => parseRub(-1)).toThrow();
  });
});

describe("toKop / fromKop", () => {
  it("рубли в копейки", () => {
    expect(toKop(2500)).toBe(250000);
    expect(toKop(99)).toBe(9900);
  });

  it("отбрасывает доли копейки", () => {
    expect(toKop(10.999)).toBe(1099);
  });

  it("копейки в рубли", () => {
    expect(fromKop(250000)).toBe(2500);
    expect(fromKop(1099)).toBe(10.99);
  });
});

describe("toKop и шум плавающей точки", () => {
  it("не теряет копейку", () => {
    expect(toKop(4723.9)).toBe(472390); // 4723.9 * 100 = 472389.99999999994
    expect(toKop(1217.61)).toBe(121761);
    expect(toKop(2379.2)).toBe(237920);
    expect(toKop(0.29)).toBe(29);
  });

  it("настоящие доли копейки по-прежнему отбрасываются", () => {
    expect(toKop(10.999)).toBe(1099);
    expect(toKop(0.009)).toBe(0);
  });
});

describe("parsePercent / kopAfterDiscount", () => {
  it("число и строка", () => {
    expect(parsePercent(15)).toBe(15);
    expect(parsePercent(" 12.5 ")).toBe(12.5);
  });

  it("вне 0..100 и мусор — ошибка", () => {
    expect(() => parsePercent(-1)).toThrow();
    expect(() => parsePercent(101)).toThrow();
    expect(() => parsePercent("abc")).toThrow();
    expect(() => parsePercent(null)).toThrow();
  });

  it("сумма после скидки в копейках", () => {
    expect(kopAfterDiscount(1000_00, 15)).toBe(850_00);
    expect(kopAfterDiscount(3000_00, 13.75)).toBe(2587_50);
    expect(kopAfterDiscount(9746_00, 13)).toBe(8479_02);
    expect(kopAfterDiscount(123, 0)).toBe(123);
  });
});
