import { describe, expect, it } from "vitest";
import {
  assertMediaPath,
  encodeMediaPath,
  normalizeMediaPath,
} from "../src/media-path.js";

describe("media paths", () => {
  it("normalizes nested paths and encodes segments", () => {
    expect(normalizeMediaPath("photos//summer/")).toBe("photos/summer");
    expect(encodeMediaPath("photos/my file#.jpg")).toBe(
      "photos/my%20file%23.jpg",
    );
  });
  it("rejects traversal and root escapes", () => {
    expect(normalizeMediaPath("/")).toBe("");
    expect(() => normalizeMediaPath("/secret")).toThrow(
      "Absolute media paths are not allowed",
    );
    expect(() => normalizeMediaPath("../secret")).toThrow("Invalid media path");
    expect(() => assertMediaPath("other/file.jpg", "media")).toThrow(
      "outside configured root",
    );
  });
});
