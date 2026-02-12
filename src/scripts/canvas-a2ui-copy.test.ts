import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { copyA2uiAssets } from "../../scripts/canvas-a2ui-copy.js";

describe("canvas a2ui copy", () => {
  it("throws a helpful error when assets are missing and skip is disabled", async () => {
    const prev = process.env.OPENCLAW_A2UI_SKIP_MISSING;
    process.env.OPENCLAW_A2UI_SKIP_MISSING = "0";
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-a2ui-"));

    try {
      await expect(copyA2uiAssets({ srcDir: dir, outDir: path.join(dir, "out") })).rejects.toThrow(
        'Run "pnpm canvas:a2ui:bundle"',
      );
    } finally {
      if (prev === undefined) delete process.env.OPENCLAW_A2UI_SKIP_MISSING;
      else process.env.OPENCLAW_A2UI_SKIP_MISSING = prev;
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("skips gracefully when assets are missing by default", async () => {
    const prev = process.env.OPENCLAW_A2UI_SKIP_MISSING;
    delete process.env.OPENCLAW_A2UI_SKIP_MISSING;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-a2ui-"));

    try {
      // Should resolve without error (default skipMissing = true)
      await expect(
        copyA2uiAssets({ srcDir: dir, outDir: path.join(dir, "out") }),
      ).resolves.toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.OPENCLAW_A2UI_SKIP_MISSING;
      else process.env.OPENCLAW_A2UI_SKIP_MISSING = prev;
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("copies bundled assets to dist", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-a2ui-"));
    const srcDir = path.join(dir, "src");
    const outDir = path.join(dir, "dist");

    try {
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, "index.html"), "<html></html>", "utf8");
      await fs.writeFile(path.join(srcDir, "a2ui.bundle.js"), "console.log(1);", "utf8");

      await copyA2uiAssets({ srcDir, outDir });

      await expect(fs.stat(path.join(outDir, "index.html"))).resolves.toBeTruthy();
      await expect(fs.stat(path.join(outDir, "a2ui.bundle.js"))).resolves.toBeTruthy();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
