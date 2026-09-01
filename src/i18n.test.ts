import { describe, expect, it } from "vitest";
import { dictionaries, formatRelativeTime, t } from "./i18n";

describe("i18n", () => {
  it("has every key in both languages", () => {
    expect(Object.keys(dictionaries.tr).sort()).toEqual(Object.keys(dictionaries.en).sort());
  });
  it("interpolates variables", () => {
    expect(t("en", "playRange", { start: 1, end: 4 })).toBe("Play bars 1–4");
    expect(t("tr", "selectedBars", { start: 2, end: 3, track: "Bas" })).toContain("Bas kanalında 2–3");
  });
  it("formats relative time", () => {
    const now = 1_000_000_000;
    expect(formatRelativeTime(now - 5000, "en", now)).toBe("just now");
    expect(formatRelativeTime(now - 5 * 60_000, "tr", now)).toBe("5 dk önce");
    expect(formatRelativeTime(now - 3 * 3_600_000, "en", now)).toBe("3 h ago");
  });
});
