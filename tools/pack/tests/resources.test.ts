import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { copyBundledResourceTrees, copyOptionalVelaCliBinary } from "../src/resources.js";

describe("copyBundledResourceTrees", () => {
  it("includes daemon resource trees", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-"));
    const workspaceRoot = join(root, "workspace");
    const resourceRoot = join(root, "resources");

    try {
      const promptTemplatePath = join(
        workspaceRoot,
        "prompt-templates",
        "image",
        "sample.json",
      );
      const designTemplatePath = join(
        workspaceRoot,
        "design-templates",
        "orbit-general",
        "SKILL.md",
      );
      const communityPetPath = join(
        workspaceRoot,
        "assets",
        "community-pets",
        "sample",
        "pet.json",
      );
      const communityRegistryPath = join(
        workspaceRoot,
        "plugins",
        "registry",
        "community",
        "open-design-marketplace.json",
      );
      await mkdir(join(workspaceRoot, "skills", "sample"), { recursive: true });
      // The skills/design-templates split (see specs/current/
      // skills-and-design-templates.md) added a separate top-level
      // `design-templates/` tree that copyBundledResourceTrees now also
      // bundles. Create it in the fixture so the recursive copy does not
      // fail with ENOENT before reaching the prompt-templates assertion.
      await mkdir(join(workspaceRoot, "design-templates", "orbit-general"), {
        recursive: true,
      });
      await mkdir(join(workspaceRoot, "design-systems", "sample"), {
        recursive: true,
      });
      await mkdir(join(workspaceRoot, "craft", "sample"), { recursive: true });
      await mkdir(join(workspaceRoot, "plugins", "_official", "sample"), {
        recursive: true,
      });
      await mkdir(join(workspaceRoot, "plugins", "registry", "community"), {
        recursive: true,
      });
      await mkdir(join(workspaceRoot, "assets", "frames"), { recursive: true });
      await mkdir(join(workspaceRoot, "assets", "community-pets", "sample"), {
        recursive: true,
      });
      await mkdir(join(workspaceRoot, "prompt-templates", "image"), {
        recursive: true,
      });
      await writeFile(promptTemplatePath, "{\"id\":\"sample\"}\n", "utf8");
      await writeFile(designTemplatePath, "# Orbit General\n", "utf8");
      await writeFile(communityPetPath, "{\"name\":\"sample\"}\n", "utf8");
      await writeFile(
        join(workspaceRoot, "plugins", "_official", "sample", "open-design.json"),
        "{\"id\":\"sample\"}\n",
        "utf8",
      );
      await writeFile(communityRegistryPath, "{\"plugins\":[]}\n", "utf8");

      await copyBundledResourceTrees({ workspaceRoot, resourceRoot });

      await expect(
        readFile(
          join(resourceRoot, "prompt-templates", "image", "sample.json"),
          "utf8",
        ),
      ).resolves.toBe("{\"id\":\"sample\"}\n");
      await expect(
        readFile(
          join(resourceRoot, "design-templates", "orbit-general", "SKILL.md"),
          "utf8",
        ),
      ).resolves.toBe("# Orbit General\n");
      await expect(
        readFile(
          join(resourceRoot, "community-pets", "sample", "pet.json"),
          "utf8",
        ),
      ).resolves.toBe("{\"name\":\"sample\"}\n");
      await expect(
        readFile(
          join(resourceRoot, "plugins", "_official", "sample", "open-design.json"),
          "utf8",
        ),
      ).resolves.toBe("{\"id\":\"sample\"}\n");
      await expect(
        readFile(
          join(
            resourceRoot,
            "plugins",
            "registry",
            "community",
            "open-design-marketplace.json",
          ),
          "utf8",
        ),
      ).resolves.toBe("{\"plugins\":[]}\n");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("copyOptionalVelaCliBinary", () => {
  it("copies a configured Vela CLI binary into the POSIX resource bin", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-vela-"));
    const source = join(root, "source", "vela");
    const resourceRoot = join(root, "resources", "open-design");

    try {
      await mkdir(join(root, "source"), { recursive: true });
      await writeFile(source, "#!/bin/sh\nexit 0\n", "utf8");

      const copied = await copyOptionalVelaCliBinary({
        env: { OPEN_DESIGN_VELA_CLI_BIN: source },
        platform: "mac",
        resourceRoot,
      });

      const target = join(resourceRoot, "bin", "vela");
      await expect(readFile(target, "utf8")).resolves.toBe("#!/bin/sh\nexit 0\n");
      expect(copied).toEqual({ source, target });
      expect((await stat(target)).mode & 0o111).not.toBe(0);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("copies a configured Vela CLI binary into the Windows resource bin", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-vela-win-"));
    const source = join(root, "source", "vela.exe");
    const resourceRoot = join(root, "resources", "open-design");

    try {
      await mkdir(join(root, "source"), { recursive: true });
      await writeFile(source, "fake exe\n", "utf8");

      const copied = await copyOptionalVelaCliBinary({
        env: { OPEN_DESIGN_VELA_CLI_BIN: source },
        platform: "win",
        resourceRoot,
      });

      const target = join(resourceRoot, "bin", "vela.exe");
      await expect(readFile(target, "utf8")).resolves.toBe("fake exe\n");
      expect(copied).toEqual({ source, target });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
