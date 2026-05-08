import { contextBridge, ipcRenderer } from "electron";
import type {
  GenerateSuggestionsPayload,
  ProjectReplaceApplyPayload,
  ProjectReplacePreviewPayload,
  ProjectSearchOptions,
  StolowApi,
  StolowAppSettings,
  StolowSettings
} from "../shared/types.js";

const api: StolowApi = {
  openProject: () => ipcRenderer.invoke("project:open"),
  openLastProject: () => ipcRenderer.invoke("project:openLast"),
  refreshProject: (projectPath: string) => ipcRenderer.invoke("project:refresh", projectPath),
  getCurrentProjectSnapshot: () => ipcRenderer.invoke("project:getCurrentSnapshot"),
  openSettingsWindow: () => ipcRenderer.invoke("window:openSettings"),
  readFile: (projectPath: string, relativePath: string) =>
    ipcRenderer.invoke("file:read", projectPath, relativePath),
  saveFile: (projectPath: string, relativePath: string, contents: string) =>
    ipcRenderer.invoke("file:save", projectPath, relativePath, contents),
  createMarkdownFile: (projectPath: string, relativePath: string) =>
    ipcRenderer.invoke("file:create", projectPath, relativePath),
  getAppSettings: () => ipcRenderer.invoke("appSettings:get"),
  updateAppSettings: (settings: StolowAppSettings) => ipcRenderer.invoke("appSettings:update", settings),
  updateSettings: (projectPath: string, settings: StolowSettings) =>
    ipcRenderer.invoke("settings:update", projectPath, settings),
  generateSuggestions: (payload: GenerateSuggestionsPayload) => ipcRenderer.invoke("ai:generate", payload),
  searchProject: (projectPath: string, options: ProjectSearchOptions) =>
    ipcRenderer.invoke("project:search", projectPath, options),
  replacePreview: (payload: ProjectReplacePreviewPayload) =>
    ipcRenderer.invoke("project:replacePreview", payload),
  replaceApply: (payload: ProjectReplaceApplyPayload) => ipcRenderer.invoke("project:replaceApply", payload),
  getProjectStats: (projectPath: string) => ipcRenderer.invoke("project:getStats", projectPath)
};

contextBridge.exposeInMainWorld("stolow", api);
