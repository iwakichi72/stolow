import fs from "node:fs/promises";
import path from "node:path";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function pickDuplicateRelativePath(
  projectRoot: string,
  dir: string,
  baseName: string
): Promise<string> {
  const safeDir = dir === "." ? "" : dir.replace(/^\/+/, "").replace(/\/+$/, "");
  const prefix = safeDir ? `${safeDir}/` : "";

  const baseCandidate = `${prefix}${baseName} - コピー.md`;
  if (!(await pathExists(path.join(projectRoot, baseCandidate)))) {
    return baseCandidate;
  }

  for (let i = 2; i <= 200; i++) {
    const candidate = `${prefix}${baseName} - コピー ${i}.md`;
    if (!(await pathExists(path.join(projectRoot, candidate)))) {
      return candidate;
    }
  }

  throw new Error("複製ファイル名を決められませんでした。");
}

export async function deleteFileOrThrow(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error("Failed to delete file", error);
    throw new Error("ファイル削除に失敗しました。");
  }
}

