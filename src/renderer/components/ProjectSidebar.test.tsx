import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { ProjectFile, ProjectSnapshot } from "../../shared/types";
import { ProjectSidebar } from "./ProjectSidebar";

function file(relativePath: string, kind: ProjectFile["kind"]): ProjectFile {
  return {
    relativePath,
    name: relativePath.split("/").pop() ?? relativePath,
    kind
  };
}

const project: ProjectSnapshot = {
  rootPath: "/tmp/project",
  name: "project",
  // ProjectSidebar は settings の中身を見ない
  settings: {
    ollamaUrl: "http://localhost:11434",
    defaultModel: "default",
    quickModel: "quick",
    qualityModel: "quality",
    defaultMode: "natural",
    suggestionCount: 3,
    maxParagraphChars: 2000,
    requestTimeoutMs: 30_000
  },
  files: []
};

describe("ProjectSidebar context menu", () => {
  it("右クリックでメニューが出て、複製が呼ばれる", async () => {
    const onDuplicateFile = vi.fn();
    const onDeleteFile = vi.fn();

    const target = file("manuscript/01.md", "manuscript");

    render(
      <ProjectSidebar
        activeFile={target}
        groupedFiles={{
          manuscript: [target],
          context: [file("context/summary.md", "context")],
          other: []
        }}
        isDirty={false}
        isOpening={false}
        isSaving={false}
        onCreateMarkdown={() => undefined}
        onDeleteFile={onDeleteFile}
        onDuplicateFile={onDuplicateFile}
        onFileSelect={() => undefined}
        onOpenProject={() => undefined}
        onOpenSearch={() => undefined}
        onOpenSettings={() => undefined}
        onRefresh={() => undefined}
        onSave={() => undefined}
        project={project}
        searchPanel={<div />}
        sidebarTab="files"
        sidebarWidth={260}
      />
    );

    const row = screen.getByRole("button", { name: "01.md" });
    fireEvent.contextMenu(row, { clientX: 120, clientY: 80 });

    const menu = screen.getByRole("menu", { name: "ファイル操作" });
    expect(menu).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "複製" }));
    expect(onDuplicateFile).toHaveBeenCalledTimes(1);
    expect(onDuplicateFile).toHaveBeenCalledWith(target);
    expect(onDeleteFile).not.toHaveBeenCalled();
  });

  it("削除を押すと onDeleteFile が呼ばれる", async () => {
    const onDuplicateFile = vi.fn();
    const onDeleteFile = vi.fn();

    const target = file("manuscript/01.md", "manuscript");

    render(
      <ProjectSidebar
        activeFile={target}
        groupedFiles={{
          manuscript: [target],
          context: [],
          other: []
        }}
        isDirty={false}
        isOpening={false}
        isSaving={false}
        onCreateMarkdown={() => undefined}
        onDeleteFile={onDeleteFile}
        onDuplicateFile={onDuplicateFile}
        onFileSelect={() => undefined}
        onOpenProject={() => undefined}
        onOpenSearch={() => undefined}
        onOpenSettings={() => undefined}
        onRefresh={() => undefined}
        onSave={() => undefined}
        project={project}
        searchPanel={<div />}
        sidebarTab="files"
        sidebarWidth={260}
      />
    );

    const row = screen.getByRole("button", { name: "01.md" });
    fireEvent.contextMenu(row, { clientX: 120, clientY: 80 });
    expect(screen.getByRole("menu", { name: "ファイル操作" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "削除" }));
    expect(onDeleteFile).toHaveBeenCalledTimes(1);
    expect(onDeleteFile).toHaveBeenCalledWith(target);
    expect(onDuplicateFile).not.toHaveBeenCalled();
  });

  it("メニュー外クリックで閉じる", async () => {
    const onDuplicateFile = vi.fn();
    const onDeleteFile = vi.fn();

    const target = file("manuscript/01.md", "manuscript");

    render(
      <ProjectSidebar
        activeFile={target}
        groupedFiles={{ manuscript: [target], context: [], other: [] }}
        isDirty={false}
        isOpening={false}
        isSaving={false}
        onCreateMarkdown={() => undefined}
        onDeleteFile={onDeleteFile}
        onDuplicateFile={onDuplicateFile}
        onFileSelect={() => undefined}
        onOpenProject={() => undefined}
        onOpenSearch={() => undefined}
        onOpenSettings={() => undefined}
        onRefresh={() => undefined}
        onSave={() => undefined}
        project={project}
        searchPanel={<div />}
        sidebarTab="files"
        sidebarWidth={260}
      />
    );

    const row = screen.getByRole("button", { name: "01.md" });
    fireEvent.contextMenu(row, { clientX: 120, clientY: 80 });
    expect(screen.getByRole("menu", { name: "ファイル操作" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu", { name: "ファイル操作" })).toBeNull();
  });

  it("Escape でメニューが閉じる", async () => {
    const onDuplicateFile = vi.fn();
    const onDeleteFile = vi.fn();

    const target = file("manuscript/01.md", "manuscript");

    render(
      <ProjectSidebar
        activeFile={target}
        groupedFiles={{ manuscript: [target], context: [], other: [] }}
        isDirty={false}
        isOpening={false}
        isSaving={false}
        onCreateMarkdown={() => undefined}
        onDeleteFile={onDeleteFile}
        onDuplicateFile={onDuplicateFile}
        onFileSelect={() => undefined}
        onOpenProject={() => undefined}
        onOpenSearch={() => undefined}
        onOpenSettings={() => undefined}
        onRefresh={() => undefined}
        onSave={() => undefined}
        project={project}
        searchPanel={<div />}
        sidebarTab="files"
        sidebarWidth={260}
      />
    );

    const row = screen.getByRole("button", { name: "01.md" });
    fireEvent.contextMenu(row, { clientX: 120, clientY: 80 });
    expect(screen.getByRole("menu", { name: "ファイル操作" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "ファイル操作" })).toBeNull();
  });
});

