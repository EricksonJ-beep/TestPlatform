import { describe, expect, it } from "vitest";
import { heatBand } from "./mastery";

describe("heatBand", () => {
  it("puts the boundaries where Jon asked", () => {
    expect(heatBand(100)).toBe("full");
    expect(heatBand(99.9)).toBe("high");
    expect(heatBand(80)).toBe("high");
    expect(heatBand(79.9)).toBe("mid");
    expect(heatBand(60)).toBe("mid");
    expect(heatBand(59.9)).toBe("low");
    expect(heatBand(0)).toBe("low");
  });
});
