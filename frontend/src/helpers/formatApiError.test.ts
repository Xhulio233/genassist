import { describe, it, expect } from "vitest";
import { AxiosError } from "axios";
import { formatApiError } from "./formatApiError";

describe("formatApiError", () => {
  it("reads `detail` from an axios response body", () => {
    const err = new AxiosError("Request failed with status code 403");
    err.response = { data: { detail: "Not allowed" } } as AxiosError["response"];
    expect(formatApiError(err)).toBe("Not allowed");
  });

  it("prefers `error` then `message` from the body", () => {
    const err = new AxiosError("generic");
    err.response = { data: { error: "Bad input" } } as AxiosError["response"];
    expect(formatApiError(err)).toBe("Bad input");
  });

  it("falls back to the axios message when the body has none", () => {
    const err = new AxiosError("Network Error");
    expect(formatApiError(err)).toBe("Network Error");
  });

  it("reads the message from a plain Error", () => {
    expect(formatApiError(new Error("boom"))).toBe("boom");
  });

  it("returns a raw string error as-is", () => {
    expect(formatApiError("plain string")).toBe("plain string");
  });

  it("uses the fallback for unknown values", () => {
    expect(formatApiError(null, "Default message")).toBe("Default message");
  });
});
