import { describe, expect, it } from "vitest";

import { clipboardWidth, heldFor, layoutFor } from "./stationLayout";

const ID = "8d1c5c0e-6b7a-4f1e-9d2c-3b4a5f6e7d8c";

describe("layoutFor", () => {
  it("lays each route over the scene its own way", () => {
    expect(layoutFor("/")).toBe("overlay");
    expect(layoutFor("/login")).toBe("clipboard");
    expect(layoutFor("/settings")).toBe("board");
    expect(layoutFor(`/interview/${ID}`)).toBe("room");
    for (const path of ["/dashboard", "/reports", "/interview/new", `/interview/${ID}/report`]) expect(layoutFor(path)).toBe("held");
    expect(layoutFor("/dev/building/room")).toBe("panel");
    expect(layoutFor("/dev/book")).toBe("panel");
    expect(layoutFor("/logout")).toBe("panel");
  });
});

describe("heldFor", () => {
  it("names the desk object a route holds", () => {
    expect(heldFor("/dashboard", "ledger")).toBe("ledger");
    expect(heldFor("/dashboard", null)).toBeNull();
    expect(heldFor("/reports", null)).toBe("reports");
    expect(heldFor(`/interview/${ID}/report`, null)).toBe("reports");
    expect(heldFor("/interview/new", null)).toBe("clipboard");
    expect(heldFor(`/interview/${ID}`, null)).toBeNull();
    expect(heldFor("/settings", "ledger")).toBeNull();
  });
});

describe("clipboardWidth", () => {
  it("sizes only the standalone clipboard pages", () => {
    expect(clipboardWidth("/login")).toBe("md:w-[27rem]");
    expect(clipboardWidth("/dashboard")).toBe("");
  });
});
