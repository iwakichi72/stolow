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

        const includeSummary = payload.includeSummary !== false;
        const includeNotes = payload.includeNotes !== false;

        const [summaryText, notesText] = await Promise.all([
          includeSummary ? readOptionalProjectFile(payload.projectPath, "context/summary.md") : Promise.resolve(""),
          includeNotes ? readOptionalProjectFile(payload.projectPath, "context/notes.md") : Promise.resolve("")
        ]);

        return await generateSuggestions({
          ...payload,
          summaryText,
          notesText
        });
      } catch (error) {
        console.error("AI generation failed", error);
        throw new Error(toUserFacingAiMessage(error));
      }
    }
  );
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
  return withoutLeading.split("/").filter((segment) => segment !== "" && segment !== "." && segment !== "..").join("/");
}

function assertCreatableMarkdownRelativePath(relativePath: string): void {
  if (!relativePath.toLowerCase().endsWith(".md")) {
    throw new Error("Markdown（.md）のパスを指定してください。");
  }
  if (!relativePath.startsWith("manuscript/") && !relativePath.startsWith("context/")) {
    throw new Error("作成できるのは manuscript/ または context/ 配下の Markdown のみです。");
  }
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
