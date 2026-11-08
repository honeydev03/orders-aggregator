import { describe, expect, it } from "vitest";
import { dateAtOffset, datesBetween, isCalendarDate, localDateFormatter, parseUtc, tzOffsetMinutes } from "../src/utils/time.js";

describe("parseUtc", () => {
  it("строка с Z", () => {
    expect(parseUtc("2026-03-01T00:40:39.000Z").toISOString()).toBe("2026-03-01T00:40:39.000Z");
  });

  it("строка без зоны — тоже UTC", () => {
    expect(parseUtc("2026-03-01T00:40:39").toISOString()).toBe("2026-03-01T00:40:39.000Z");
  });

  it("мусор — ошибка", () => {
    expect(() => parseUtc("вчера")).toThrow();
    expect(() => parseUtc(42)).toThrow();
  });
});

describe("tzOffsetMinutes", () => {
  it("считает смещение таймзоны", () => {
    const at = new Date("2026-02-10T12:00:00Z");
    expect(tzOffsetMinutes("UTC", at)).toBe(0);
    expect(tzOffsetMinutes("Europe/Moscow", at)).toBe(180);
    expect(tzOffsetMinutes("Asia/Novosibirsk", at)).toBe(420);
    expect(tzOffsetMinutes("America/New_York", at)).toBe(-300);
  });
});

describe("даты", () => {
  it("dateAtOffset", () => {
    expect(dateAtOffset(new Date("2026-02-10T21:30:00Z"), 180)).toBe("2026-02-11");
    expect(dateAtOffset(new Date("2026-02-10T20:30:00Z"), 180)).toBe("2026-02-10");
  });

  it("isCalendarDate", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("26-02-01")).toBe(false);
  });

  it("datesBetween включает границы", () => {
    expect(datesBetween("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });
});

describe("localDateFormatter", () => {
  it("дата в зоне, с учётом DST на момент заказа", () => {
    const berlin = localDateFormatter("Europe/Berlin");
    expect(berlin(new Date("2026-03-28T22:59:59Z"))).toBe("2026-03-28"); // CET, +1
    expect(berlin(new Date("2026-03-28T23:00:00Z"))).toBe("2026-03-29");
    expect(berlin(new Date("2026-03-29T21:59:59Z"))).toBe("2026-03-29"); // CEST, +2
    expect(berlin(new Date("2026-03-29T22:00:00Z"))).toBe("2026-03-30");
  });

  it("зоны без DST и с отрицательным смещением", () => {
    expect(localDateFormatter("Europe/Moscow")(new Date("2026-02-10T21:30:00Z"))).toBe("2026-02-11");
    expect(localDateFormatter("America/New_York")(new Date("2026-03-08T06:59:59Z"))).toBe("2026-03-08"); // 01:59 EST
    expect(localDateFormatter("America/New_York")(new Date("2026-03-08T04:59:59Z"))).toBe("2026-03-07"); // 23:59 EST накануне
    expect(localDateFormatter("UTC")(new Date("2026-02-10T23:59:59Z"))).toBe("2026-02-10");
  });
});
