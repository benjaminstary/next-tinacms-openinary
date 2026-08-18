import { describe, expect, it } from "vitest";
import { mapListing } from "../src/media-mapper.js";

describe("media mapping", () => {
  it("maps folders before files and provides image thumbnails", () => {
    const items = mapListing(
      {
        folders: ["images"],
        files: [{ path: "photo.jpg", url: "/t/photo.jpg" }, "clip.mp4"],
      },
      "https://cdn.example",
    );
    expect(items.map((item) => item.type)).toEqual(["dir", "file", "file"]);
    const photo = items.find((item) => item.filename === "photo.jpg")!;
    const clip = items.find((item) => item.filename === "clip.mp4")!;
    expect(photo.src).toBe("https://cdn.example/t/photo.jpg");
    expect(photo.thumbnails["75x75"]).toBe(
      "https://cdn.example/t/w_75,h_75,c_fit/photo.jpg",
    );
    expect(clip.thumbnails["75x75"]).toBe(clip.src);
  });

  it("encodes special characters in delivery paths", () => {
    const [item] = mapListing(
      { files: ["my file#.jpg"] },
      "https://cdn.example",
    );
    expect(item.src).toBe("https://cdn.example/t/my%20file%23.jpg");
  });

  it("uses configured thumbnail transformations", () => {
    const [item] = mapListing({ files: ["photo.jpg"] }, "https://cdn.example", {
      "75x75": "w_75,h_75,c_thumb",
    });
    expect(item.thumbnails["75x75"]).toBe(
      "https://cdn.example/t/w_75,h_75,c_thumb/photo.jpg",
    );
  });

  it("supports self-hosted relative delivery URLs", () => {
    const [item] = mapListing(
      { files: [{ path: "photo.jpg", url: "/t/photo.jpg" }] },
      "https://media.example",
    );
    expect(item.src).toBe("https://media.example/t/photo.jpg");
  });

  it("falls back to normalized delivery paths for invalid explicit URLs", () => {
    const [item] = mapListing(
      { files: [{ path: "photo.jpg", url: "/files/photo.jpg" }] },
      "https://media.example",
    );
    expect(item.src).toBe("https://media.example/t/photo.jpg");
  });

  it("does not trust explicit URLs from another origin", () => {
    const [item] = mapListing(
      {
        files: [{ path: "photo.jpg", url: "https://evil.example/t/photo.jpg" }],
      },
      "https://media.example",
    );
    expect(item.src).toBe("https://media.example/t/photo.jpg");
  });
});
