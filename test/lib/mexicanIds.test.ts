import { describe, expect, it } from "vitest";
import { isValidCodigoPostal, isValidRfc } from "@/lib/v1/mexicanIds";

describe("isValidRfc", () => {
  it("accepts a well-formed persona física RFC (4 letters + YYMMDD + 3-char homoclave)", () => {
    expect(isValidRfc("PEPJ800101ABC")).toBe(true);
  });

  it("accepts a well-formed persona moral RFC (3 letters + YYMMDD + 3-char homoclave)", () => {
    expect(isValidRfc("ABC800101AB1")).toBe(true);
  });

  it("accepts SAT's reserved generic RFCs regardless of homoclave", () => {
    expect(isValidRfc("XAXX010101000")).toBe(true);
    expect(isValidRfc("XEXX010101000")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isValidRfc("pepj800101abc")).toBe(true);
  });

  it("rejects the wrong length", () => {
    expect(isValidRfc("PEPJ800101AB")).toBe(false);
    expect(isValidRfc("PEPJ800101ABCD")).toBe(false);
  });

  it("rejects an invalid month or day in the date segment", () => {
    expect(isValidRfc("PEPJ801301ABC")).toBe(false); // month 13
    expect(isValidRfc("PEPJ800132ABC")).toBe(false); // day 32
  });

  it("rejects disallowed characters", () => {
    expect(isValidRfc("PEP-800101ABC")).toBe(false);
    expect(isValidRfc("")).toBe(false);
  });
});

describe("isValidCodigoPostal", () => {
  it("accepts a well-formed 5-digit código postal", () => {
    expect(isValidCodigoPostal("06600")).toBe(true);
  });

  it("rejects a código postal that isn't exactly 5 digits", () => {
    expect(isValidCodigoPostal("6600")).toBe(false);
    expect(isValidCodigoPostal("066000")).toBe(false);
    expect(isValidCodigoPostal("0660A")).toBe(false);
  });
});
