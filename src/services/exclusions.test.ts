import { describe, it, expect } from "vitest";
import { decide, validateExclusion } from "./exclusions";
import type { Exclusion } from "@/types/exclusion";

const exclusions: Exclusion[] = [
  { id: 1, kind: "app", value: "1Password", note: null },
  { id: 2, kind: "domain", value: "reddit.com", note: null },
  { id: 3, kind: "title_glob", value: "incognito", note: null },
];

describe("exclusions.decide", () => {
  it("excludes exact app-name matches", () => {
    const d = decide(
      { app_name: "1Password", window_title: "", browser_domain: null },
      exclusions
    );
    expect(d.excluded).toBe(true);
  });

  it("excludes domain and its subdomains", () => {
    expect(
      decide(
        { app_name: "Chrome", window_title: "r/", browser_domain: "reddit.com" },
        exclusions
      ).excluded
    ).toBe(true);
    expect(
      decide(
        { app_name: "Chrome", window_title: "r/", browser_domain: "old.reddit.com" },
        exclusions
      ).excluded
    ).toBe(true);
    // Different domain that merely contains the substring must NOT match.
    expect(
      decide(
        { app_name: "Chrome", window_title: "", browser_domain: "notreddit.com" },
        exclusions
      ).excluded
    ).toBe(false);
  });

  it("excludes title patterns case-insensitively", () => {
    expect(
      decide(
        { app_name: "Chrome", window_title: "New Incognito Tab", browser_domain: null },
        exclusions
      ).excluded
    ).toBe(true);
  });

  it("does not exclude ordinary work", () => {
    expect(
      decide(
        { app_name: "VSCode", window_title: "main.ts", browser_domain: null },
        exclusions
      ).excluded
    ).toBe(false);
  });
});

describe("exclusions.validateExclusion", () => {
  it("rejects empty values", () => {
    expect(validateExclusion("app", "  ")).toMatch(/empty/i);
  });

  it("rejects malformed domains", () => {
    expect(validateExclusion("domain", "not a domain")).toMatch(/malformed/i);
    expect(validateExclusion("domain", "example.com")).toBeNull();
    expect(validateExclusion("domain", "sub.example.co.uk")).toBeNull();
  });

  it("rejects unknown kinds", () => {
    expect(validateExclusion("bogus", "x")).toMatch(/unknown/i);
  });

  it("accepts simple app exclusions", () => {
    expect(validateExclusion("app", "1Password")).toBeNull();
  });
});
