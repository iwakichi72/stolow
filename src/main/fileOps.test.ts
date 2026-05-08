// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pickDuplicateRelativePath } from "./fileOps.js";

async function makeTempDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "stolow-test-"));
}

describe("pickDuplicateRelativePath", () => {
  it("空きがあれば「 - コピー.md」を返す", async () => {
    const root = await makeTempDir();
    const rel = await pickDuplicateRelativePath(root, "manuscript", "chapter-01");
    expect(rel).toBe("manuscript/chapter-01 - コピー.md");
  });

  it("既に存在する場合は連番を付ける（2〜）", async () => {
    const root = await makeTempDir();
    await fs.mkdir(path.join(root, "manuscript"), { recursive: true });
    await fs.writeFile(path.join(root, "manuscript/chapter-01 - コピー.md"), "x", "utf8");
    await fs.writeFile(path.join(root, "manuscript/chapter-01 - コピー 2.md"), "x", "utf8");

    const rel = await pickDuplicateRelativePath(root, "manuscript", "chapter-01");
    expect(rel).toBe("manuscript/chapter-01 - コピー 3.md");
  });

  it("dir が '.' の場合はルート直下に作る", async () => {
    const root = await makeTempDir();
    const rel = await pickDuplicateRelativePath(root, ".", "notes");
    expect(rel).toBe("notes - コピー.md");
  });
});

describe("deleteFileOrThrow", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  afterEach(() => {
    errorSpy.mockClear();
  });

  it("ファイルが存在すれば削除する", async () => {
    const root = await makeTempDir();
    const p = path.join(root, "tmp.md");
    await fs.writeFile(p, "x", "utf8");

    const { deleteFileOrThrow } = await import("./fileOps.js");
    await deleteFileOrThrow(p);

    await expect(fs.access(p)).rejects.toBeDefined();
  });

  it("存在しない場合はユーザー向けエラーにする", async () => {
    const root = await makeTempDir();
    const p = path.join(root, "missing.md");

    const { deleteFileOrThrow } = await import("./fileOps.js");
    await expect(deleteFileOrThrow(p)).rejects.toThrow("ファイル削除に失敗しました。");
    expect(errorSpy).toHaveBeenCalled();
  });
});

