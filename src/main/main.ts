import { existsSync, realpathSync } from "node:fs";
import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  GenerateSuggestionsPayload,
  ProjectFile,
  ProjectFileKind,
  ProjectSnapshot,
  ProjectReplaceApplyPayload,
  ProjectReplaceApplyResult,
  ProjectReplacePreviewPayload,
  ProjectReplacePreviewResult,
  ProjectSearchOptions,
  ProjectSearchResult,
  SaveFileResult,
  StolowSettings
} from "../shared/types.js";
import { DEFAULT_STOLOW_SETTINGS, normalizeSettings } from "../stolow/ai/config.js";
import { generateSuggestions } from "../stolow/ai/generateSuggestions.js";
import { StolowAiError } from "../stolow/ai/stolowAiError.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 同一プロジェクトでも `/tmp` と `/private/tmp` など表記が揃わないと path 検証や read が失敗するため、ルートは常に実パスへ揃える。 */
function canonicalProjectRoot(rawPath: string): string {
  const resolved = path.resolve(rawPath);
  try {
    return realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

app.setName("Stolow");
const PROJECT_VERSION = 1;
const MAX_PROJECT_FILES = 1000;
const MAX_SEARCH_MATCHES = 2000;
const MAX_SEARCH_FILES_WITH_MATCHES = 250;

let mainWindow: BrowserWindow | null = null;

function resolveWindowIcon(): string | undefined {
  const candidates = app.isPackaged
    ? [path.join(app.getAppPath(), "assets", "icon.png")]
    : [path.join(__dirname, "../../assets", "icon.png")];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: "Stolow",
    icon: resolveWindowIcon(),
    backgroundColor: "#191712",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.resolve(__dirname, "../../dist/renderer/index.html"));
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function registerIpcHandlers(): void {
  ipcMain.handle("project:open", async (): Promise<ProjectSnapshot | null> => {
    const options: OpenDialogOptions = {
      title: "Stolowプロジェクトを開く",
      properties: ["openDirectory", "createDirectory"]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) return null;

    const rawRoot = result.filePaths[0];
    const rootPath = canonicalProjectRoot(rawRoot);
    await ensureProject(rootPath);
    return readProjectSnapshot(rootPath);
  });

  ipcMain.handle("project:refresh", async (_event, projectPath: string): Promise<ProjectSnapshot> => {
    const rootPath = canonicalProjectRoot(projectPath);
    await ensureProject(rootPath);
    return readProjectSnapshot(rootPath);
  });

  ipcMain.handle(
    "file:read",
    async (_event, projectPath: string, relativePath: string): Promise<string> => {
      const filePath = resolveProjectMarkdownPath(projectPath, relativePath);
      return fs.readFile(filePath, "utf8");
    }
  );

  ipcMain.handle(
    "file:save",
    async (_event, projectPath: string, relativePath: string, contents: string): Promise<SaveFileResult> => {
      try {
        const filePath = resolveProjectMarkdownPath(projectPath, relativePath);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, contents, "utf8");
        return { savedAt: new Date().toISOString() };
      } catch (error) {
        console.error("Failed to save file", error);
        throw new Error("ファイル保存に失敗しました。");
      }
    }
  );

  ipcMain.handle(
    "file:create",
    async (_event, projectPath: string, relativePath: string): Promise<ProjectFile> => {
      const rootPath = canonicalProjectRoot(projectPath);
      const normalized = normalizeNewMarkdownRelativePath(relativePath);
      assertCreatableMarkdownRelativePath(normalized);
      const filePath = resolveProjectMarkdownPath(rootPath, normalized);
      if (await pathExists(filePath)) {
        throw new Error("同じ名前のファイルが既に存在します。");
      }
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const baseName = path.basename(filePath, ".md");
      await fs.writeFile(filePath, `# ${baseName}\n\n`, "utf8");
      return {
        relativePath: toPosix(path.relative(rootPath, filePath)),
        name: path.basename(filePath),
        kind: fileKind(toPosix(path.relative(rootPath, filePath)))
      };
    }
  );

  ipcMain.handle(
    "settings:update",
    async (_event, projectPath: string, settings: StolowSettings): Promise<StolowSettings> => {
      const normalized = normalizeSettings(settings);
      await fs.mkdir(path.join(projectPath, ".stolow"), { recursive: true });
      await writeJson(path.join(projectPath, ".stolow", "settings.json"), normalized);
      return normalized;
    }
  );

  ipcMain.handle(
    "ai:generate",
    async (_event, payload: GenerateSuggestionsPayload) => {
      try {
        if (!payload.projectPath) {
          throw new StolowAiError("PROJECT_NOT_OPEN", "Project is not open.");
        }

        const selectedContextFiles = (payload.contextFiles ?? []).filter((p) => typeof p === "string" && p);
        const useSelectedFiles = selectedContextFiles.length > 0;

        const includeSummary = payload.includeSummary !== false;
        const includeNotes = payload.includeNotes !== false;

        let summaryText = "";
        let notesText = "";
        let chapterText = "";

        if (useSelectedFiles) {
          const contents = await Promise.all(
            selectedContextFiles.map((relativePath) => readOptionalProjectFile(payload.projectPath, relativePath))
          );

          // summary.md は専用枠へ、その他は notes 相当としてまとめる
          const summaryIndex = selectedContextFiles.findIndex((p) => p === "context/summary.md");
          summaryText = summaryIndex >= 0 ? contents[summaryIndex] ?? "" : "";

          const otherParts: string[] = [];
          for (let i = 0; i < selectedContextFiles.length; i++) {
            const rel = selectedContextFiles[i];
            const text = contents[i] ?? "";
            if (!text.trim()) continue;
            if (rel === "context/summary.md") continue;
            otherParts.push(`# ${rel}\n\n${text.trim()}\n`);
          }
          notesText = otherParts.join("\n");
        } else {
          const [summary, notes] = await Promise.all([
            includeSummary ? readOptionalProjectFile(payload.projectPath, "context/summary.md") : Promise.resolve(""),
            includeNotes ? readOptionalProjectFile(payload.projectPath, "context/notes.md") : Promise.resolve("")
          ]);
          summaryText = summary;
          notesText = notes;
        }

        const chapterLevel = payload.chapterHeadingLevel ?? 0;
        if (chapterLevel > 0) {
          chapterText = extractChapterByHeadingLevel(payload.documentText, payload.selection, payload.cursorPosition, chapterLevel);
        }

        return await generateSuggestions({
          ...payload,
          summaryText,
          notesText,
          chapterText
        });
      } catch (error) {
        console.error("AI generation failed", error);
        throw new Error(toUserFacingAiMessage(error));
      }
    }
  );

  ipcMain.handle(
    "project:search",
    async (_event, projectPath: string, options: ProjectSearchOptions): Promise<ProjectSearchResult> => {
      const rootPath = canonicalProjectRoot(projectPath);
      const snapshot = await readProjectSnapshot(rootPath);
      const normalizedOptions = normalizeSearchOptions(options);
      return await searchProjectFiles(rootPath, snapshot.files, normalizedOptions);
    }
  );

  ipcMain.handle(
    "project:replacePreview",
    async (_event, payload: ProjectReplacePreviewPayload): Promise<ProjectReplacePreviewResult> => {
      const rootPath = canonicalProjectRoot(payload.projectPath);
      const snapshot = await readProjectSnapshot(rootPath);
      const normalizedOptions = normalizeSearchOptions(payload);
      return await replacePreviewProjectFiles(rootPath, snapshot.files, normalizedOptions, payload.replace);
    }
  );

  ipcMain.handle(
    "project:replaceApply",
    async (_event, payload: ProjectReplaceApplyPayload): Promise<ProjectReplaceApplyResult> => {
      const rootPath = canonicalProjectRoot(payload.projectPath);
      const snapshot = await readProjectSnapshot(rootPath);
      const normalizedOptions = normalizeSearchOptions(payload);
      return await replaceApplyProjectFiles(rootPath, snapshot.files, normalizedOptions, payload.replace);
    }
  );
}

function extractChapterByHeadingLevel(
  documentText: string,
  selection: { from: number; to: number },
  cursorPosition: number,
  headingLevel: number
): string {
  const cursor = Math.max(0, Math.min(cursorPosition, documentText.length));
  const anchor = selection.to > selection.from ? Math.max(0, Math.min(selection.from, documentText.length)) : cursor;

  const lines = documentText.split("\n");
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  const lineIndex = (() => {
    let idx = 0;
    for (let i = 0; i < lineOffsets.length; i++) {
      if (lineOffsets[i] <= anchor) idx = i;
      else break;
    }
    return idx;
  })();

  const headingRe = /^(\#{1,6})\s+(.+)$/;
  const isHeadingLine = (line: string): number | null => {
    const m = headingRe.exec(line);
    if (!m) return null;
    return m[1]?.length ?? null;
  };

  let startLine = 0;
  for (let i = lineIndex; i >= 0; i--) {
    const level = isHeadingLine(lines[i] ?? "");
    if (level !== null && level <= headingLevel) {
      startLine = i;
      break;
    }
  }

  let endLine = lines.length;
  for (let i = startLine + 1; i < lines.length; i++) {
    const level = isHeadingLine(lines[i] ?? "");
    if (level !== null && level <= headingLevel) {
      endLine = i;
      break;
    }
  }

  const slice = lines.slice(startLine, endLine).join("\n").trim();
  return slice;
}

async function ensureProject(rootPath: string): Promise<void> {
  const stolowDir = path.join(rootPath, ".stolow");
  const manuscriptDir = path.join(rootPath, "manuscript");
  const contextDir = path.join(rootPath, "context");

  await Promise.all([
    fs.mkdir(stolowDir, { recursive: true }),
    fs.mkdir(manuscriptDir, { recursive: true }),
    fs.mkdir(contextDir, { recursive: true })
  ]);

  const projectJsonPath = path.join(stolowDir, "project.json");
  if (!(await pathExists(projectJsonPath))) {
    await writeJson(projectJsonPath, {
      name: path.basename(rootPath),
      version: PROJECT_VERSION,
      createdAt: new Date().toISOString()
    });
  }

  const settingsPath = path.join(stolowDir, "settings.json");
  const existingSettings = await readJsonIfExists<Partial<StolowSettings>>(settingsPath);
  await writeJson(settingsPath, normalizeSettings(existingSettings));

  await writeTextIfMissing(path.join(contextDir, "summary.md"), "# Summary\n\n");
  await writeTextIfMissing(path.join(contextDir, "notes.md"), "# Notes\n\n");

  const manuscriptFiles = await listMarkdownFiles(manuscriptDir, rootPath, MAX_PROJECT_FILES);
  if (manuscriptFiles.length === 0) {
    await writeTextIfMissing(path.join(manuscriptDir, "01-opening.md"), "# Opening\n\n");
  }
}

async function readProjectSnapshot(rootPath: string): Promise<ProjectSnapshot> {
  const settings = normalizeSettings(
    await readJsonIfExists<Partial<StolowSettings>>(path.join(rootPath, ".stolow", "settings.json"))
  );
  const files = await listMarkdownFiles(rootPath, rootPath, MAX_PROJECT_FILES);

  return {
    rootPath,
    name: path.basename(rootPath),
    settings,
    files
  };
}

async function listMarkdownFiles(startPath: string, projectPath: string, limit: number): Promise<ProjectFile[]> {
  const files: ProjectFile[] = [];

  async function walk(directoryPath: string): Promise<void> {
    if (files.length >= limit) return;

    let entries;
    try {
      entries = await fs.readdir(directoryPath, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name, "ja"));

    for (const entry of entries) {
      if (files.length >= limit) return;
      if (entry.name.startsWith(".")) continue;

      const absolutePath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "dist-electron") continue;
        await walk(absolutePath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        const relativePath = toPosix(path.relative(projectPath, absolutePath));
        files.push({
          relativePath,
          name: entry.name,
          kind: fileKind(relativePath)
        });
      }
    }
  }

  await walk(startPath);
  return files.sort((left, right) => {
    const kindOrder = kindRank(left.kind) - kindRank(right.kind);
    if (kindOrder !== 0) return kindOrder;
    return left.relativePath.localeCompare(right.relativePath, "ja");
  });
}

function kindRank(kind: ProjectFileKind): number {
  if (kind === "manuscript") return 0;
  if (kind === "context") return 1;
  return 2;
}

function fileKind(relativePath: string): ProjectFileKind {
  if (relativePath.startsWith("manuscript/")) return "manuscript";
  if (relativePath.startsWith("context/")) return "context";
  return "other";
}

function resolveProjectMarkdownPath(projectPath: string, relativePath: string): string {
  const root = path.resolve(projectPath);
  const filePath = path.resolve(root, relativePath);
  const rel = path.relative(root, filePath);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Invalid project file path.");
  }

  if (!filePath.toLowerCase().endsWith(".md")) {
    throw new Error("Only Markdown files can be opened.");
  }

  return filePath;
}

/** ユーザー入力やIPCから渡される相対パスをPOSIX風に正規化（ディレクトリ区切りは `/` に揃える）。 */
function normalizeNewMarkdownRelativePath(raw: string): string {
  const trimmed = raw.trim().replace(/\\/g, "/");
  const withoutLeading = trimmed.replace(/^\/+/, "").replace(/^\.\/+/, "");
  const parts = withoutLeading
    .split("/")
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..");

  // 最後のセグメント（ファイル名）のみ、クロスプラットフォームで壊れやすい文字をサニタイズする。
  // - Windows 禁則（<>:"/\|?* + 制御文字）
  // - 末尾のドット/空白（Windows で不正になりやすい）
  // - 空文字化したらエラーにする（後段の assert で弾く）
  if (parts.length > 0) {
    const dir = parts.slice(0, -1);
    const file = parts[parts.length - 1] ?? "";
    const safeFile = sanitizeFilenameSegment(file);
    return [...dir, safeFile].join("/");
  }

  return parts.join("/");
}

function assertCreatableMarkdownRelativePath(relativePath: string): void {
  if (!relativePath.toLowerCase().endsWith(".md")) {
    throw new Error("Markdown（.md）のパスを指定してください。");
  }
  if (!relativePath.startsWith("manuscript/") && !relativePath.startsWith("context/")) {
    throw new Error("作成できるのは manuscript/ または context/ 配下の Markdown のみです。");
  }

  const base = relativePath.split("/").pop() ?? "";
  if (!base || base === ".md") {
    throw new Error("ファイル名が不正です。");
  }
  if (base.length > 200) {
    throw new Error("ファイル名が長すぎます。");
  }
}

function sanitizeFilenameSegment(name: string): string {
  // NOTE: path セパレータは事前に `/` に揃えているが、念のため両方潰す。
  const replaced = name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/g, ""); // 末尾のドット/空白を除去

  // macOS/Linux では利用できても、Windows では不正になりうる予約語を回避する。
  const upper = replaced.toUpperCase();
  const isReserved =
    upper === "CON" ||
    upper === "PRN" ||
    upper === "AUX" ||
    upper === "NUL" ||
    /^COM[1-9]$/.test(upper) ||
    /^LPT[1-9]$/.test(upper);

  const safe = isReserved ? `${replaced}-file` : replaced;
  return safe;
}

async function readOptionalProjectFile(projectPath: string, relativePath: string): Promise<string> {
  try {
    const filePath = resolveProjectMarkdownPath(projectPath, relativePath);
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const contents = await fs.readFile(filePath, "utf8");
    return JSON.parse(contents) as T;
  } catch {
    return null;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeTextIfMissing(filePath: string, contents: string): Promise<void> {
  if (await pathExists(filePath)) return;
  await fs.writeFile(filePath, contents, "utf8");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function toUserFacingAiMessage(error: unknown): string {
  if (!(error instanceof StolowAiError)) {
    return "AI生成に失敗しました。詳細は開発者コンソールを確認してください。";
  }

  switch (error.code) {
    case "OLLAMA_UNAVAILABLE":
      return "Ollamaに接続できません。ターミナルで `ollama serve` が動いているか、設定の Ollama URL（例: http://localhost:11434）が正しいか確認してください。";
    case "MODEL_NOT_FOUND":
      return "指定モデルが見つかりません。`ollama list` で名前を確認し、未 Pull なら `ollama pull <モデル名>` を実行してください。";
    case "PROJECT_NOT_OPEN":
      return "プロジェクトが開かれていません。";
    case "LLM_JSON_INVALID":
      return "LLM応答を読み取れませんでした。もう一度生成するか、別モデル・温度を試してください。";
    case "EMPTY_SUGGESTIONS":
      return "候補が空でした。もう一度生成してください。";
    case "TIMEOUT":
      return "通信がタイムアウトしました。モデルが重い場合は時間をおくか、クイック用モデルに切り替えてください。";
    case "HTTP_ERROR":
      return "OllamaからのHTTP応答が不正でした。Ollamaを再起動するか、URLとモデル名を確認してください。";
    default:
      return "AI生成に失敗しました。詳細は開発者コンソールを確認してください。";
  }
}

function normalizeSearchOptions(options: ProjectSearchOptions): Required<ProjectSearchOptions> {
  return {
    query: options.query ?? "",
    isRegex: options.isRegex ?? false,
    caseSensitive: options.caseSensitive ?? false,
    wholeWord: options.wholeWord ?? false
  };
}

function compileSearchRegExp(options: Required<ProjectSearchOptions>): RegExp | null {
  const query = options.query.trim();
  if (!query) return null;

  let source = query;
  if (!options.isRegex) {
    source = escapeRegExp(query);
  }
  if (options.wholeWord) {
    source = `\\b(?:${source})\\b`;
  }

  const flags = `g${options.caseSensitive ? "" : "i"}`;
  try {
    return new RegExp(source, flags);
  } catch {
    throw new Error("正規表現が不正です。");
  }
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function computeLineInfo(text: string, index: number): { line: number; column: number; lineText: string } {
  const before = text.slice(0, index);
  const line = before.split("\n").length;
  const lastNl = before.lastIndexOf("\n");
  const lineStart = lastNl === -1 ? 0 : lastNl + 1;
  const nextNl = text.indexOf("\n", index);
  const lineEnd = nextNl === -1 ? text.length : nextNl;
  const column = index - lineStart + 1;
  const lineText = text.slice(lineStart, lineEnd);
  return { line, column, lineText };
}

async function searchProjectFiles(
  projectRoot: string,
  files: ProjectFile[],
  options: Required<ProjectSearchOptions>
): Promise<ProjectSearchResult> {
  const re = compileSearchRegExp(options);
  if (!re) {
    return { query: options.query, options, totalMatches: 0, files: [], truncated: false };
  }

  let totalMatches = 0;
  let truncated = false;
  const matchesByFile: ProjectSearchResult["files"] = [];

  for (const file of files) {
    if (matchesByFile.length >= MAX_SEARCH_FILES_WITH_MATCHES) {
      truncated = true;
      break;
    }
    const filePath = resolveProjectMarkdownPath(projectRoot, file.relativePath);
    let text = "";
    try {
      text = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }

    re.lastIndex = 0;
    const items: ProjectSearchResult["files"][number]["items"] = [];
    let fileMatchCount = 0;

    while (true) {
      const m = re.exec(text);
      if (!m) break;
      const from = m.index;
      const to = m.index + (m[0]?.length ?? 0);
      fileMatchCount += 1;
      totalMatches += 1;

      const { line, column, lineText } = computeLineInfo(text, from);
      items.push({ from, to, line, column, lineText });

      if (totalMatches >= MAX_SEARCH_MATCHES) {
        truncated = true;
        break;
      }
      if (m[0]?.length === 0) {
        // avoid infinite loop on zero-width matches
        re.lastIndex += 1;
      }
    }

    if (fileMatchCount > 0) {
      matchesByFile.push({
        relativePath: file.relativePath,
        matchCount: fileMatchCount,
        items
      });
    }
    if (truncated) break;
  }

  return {
    query: options.query,
    options,
    totalMatches,
    files: matchesByFile,
    truncated
  };
}

async function replacePreviewProjectFiles(
  projectRoot: string,
  files: ProjectFile[],
  options: Required<ProjectSearchOptions>,
  replace: string
): Promise<ProjectReplacePreviewResult> {
  const re = compileSearchRegExp(options);
  if (!re) {
    return { query: options.query, replace, totalMatches: 0, files: [], truncated: false };
  }

  let totalMatches = 0;
  let truncated = false;
  const perFile: Array<{ relativePath: string; matchCount: number }> = [];

  for (const file of files) {
    if (perFile.length >= MAX_SEARCH_FILES_WITH_MATCHES) {
      truncated = true;
      break;
    }
    const filePath = resolveProjectMarkdownPath(projectRoot, file.relativePath);
    let text = "";
    try {
      text = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }

    re.lastIndex = 0;
    let count = 0;
    while (true) {
      const m = re.exec(text);
      if (!m) break;
      count += 1;
      totalMatches += 1;
      if (totalMatches >= MAX_SEARCH_MATCHES) {
        truncated = true;
        break;
      }
      if (m[0]?.length === 0) re.lastIndex += 1;
    }

    if (count > 0) perFile.push({ relativePath: file.relativePath, matchCount: count });
    if (truncated) break;
  }

  return { query: options.query, replace, totalMatches, files: perFile, truncated };
}

async function replaceApplyProjectFiles(
  projectRoot: string,
  files: ProjectFile[],
  options: Required<ProjectSearchOptions>,
  replace: string
): Promise<ProjectReplaceApplyResult> {
  const re = compileSearchRegExp(options);
  if (!re) return { totalMatches: 0, updatedFiles: 0 };

  let totalMatches = 0;
  let updatedFiles = 0;

  for (const file of files) {
    const filePath = resolveProjectMarkdownPath(projectRoot, file.relativePath);
    let text = "";
    try {
      text = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }

    re.lastIndex = 0;
    let count = 0;
    while (true) {
      const m = re.exec(text);
      if (!m) break;
      count += 1;
      if (m[0]?.length === 0) re.lastIndex += 1;
    }
    if (count === 0) continue;

    // Apply
    re.lastIndex = 0;
    const next = text.replace(re, replace);
    if (next !== text) {
      await fs.writeFile(filePath, next, "utf8");
      updatedFiles += 1;
      totalMatches += count;
    }
  }

  return { totalMatches, updatedFiles };
}
