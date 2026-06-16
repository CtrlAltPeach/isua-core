import { describe, it, expect } from "vitest";
import { normalizeConsent } from "@/lib/applicant-logic";

describe("normalizeConsent", () => {
  it("applied + согласие true → true", () => {
    expect(normalizeConsent("applied", true)).toBe(true);
  });

  it("applied + согласие false → false", () => {
    expect(normalizeConsent("applied", false)).toBe(false);
  });

  it("withdrawn принудительно снимает согласие (true → false)", () => {
    expect(normalizeConsent("withdrawn", true)).toBe(false);
  });

  it("withdrawn + false → false", () => {
    expect(normalizeConsent("withdrawn", false)).toBe(false);
  });
});
