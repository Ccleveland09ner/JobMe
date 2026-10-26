import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isGreetingOwed, oweGreeting, spendGreeting } from "./greeting";

/** A tab's sessionStorage, or one that refuses everything (private mode). */
function stubStorage(refuse = false) {
  const items = new Map<string, string>();
  const fail = () => {
    throw new Error("denied");
  };
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: refuse ? fail : (key: string) => items.get(key) ?? null,
      setItem: refuse ? fail : (key: string, value: string) => void items.set(key, value),
      removeItem: refuse ? fail : (key: string) => void items.delete(key),
    },
  });
}

describe("the greeting owed", () => {
  beforeEach(() => stubStorage());
  afterEach(() => vi.unstubAllGlobals());

  it("is not owed until the user signs in", () => {
    expect(isGreetingOwed()).toBe(false);
  });

  it("is owed once signed in, and stays owed until her greeting begins", () => {
    oweGreeting();
    expect(isGreetingOwed()).toBe(true);
    expect(isGreetingOwed()).toBe(true);
    spendGreeting();
    expect(isGreetingOwed()).toBe(false);
  });

  it("is owed again only by the next sign-in, not by coming back to the desk", () => {
    oweGreeting();
    spendGreeting();
    expect(isGreetingOwed()).toBe(false);
    oweGreeting();
    expect(isGreetingOwed()).toBe(true);
  });

  it("is never owed where the browser won't store it, and never throws", () => {
    stubStorage(true);
    expect(() => oweGreeting()).not.toThrow();
    expect(isGreetingOwed()).toBe(false);
    expect(() => spendGreeting()).not.toThrow();
  });
});
