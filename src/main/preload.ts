import { contextBridge, ipcRenderer } from "electron";
import type { GenerateSuggestionsPayload, StolowApi, StolowSettings } from "../shared/types.js";

const api: StolowApi = {
  openProject: () => ipcRenderer.invoke("project:open"),
  refreshProject: (projectPath: string) => ipcRenderer.invoke("project:refresh", projectPath),
  readFile: (projectPath: string, relativePath: string) =>
    ipcRenderer.invoke("file:read", projectPath, relativePath),
  saveFile: (projectPath: string, relativePath: string, contents: string) =>
    ipcRenderer.invoke("file:save", projectPath, relativePath, contents),
  createMarkdownFile: (projectPath: string, relativePath: string) =>
    ipcRenderer.invoke("file:create", projectPath, relativePath),
  updateSettings: (projectPath: string, settings: StolowSettings) =>
    ipcRenderer.invoke("settings:update", projectPath, settings),
  generateSuggestions: (payload: GenerateSuggestionsPayload) => ipcRenderer.invoke("ai:generate", payload)
};

contextBridge.exposeInMainWorld("stolow", api);
