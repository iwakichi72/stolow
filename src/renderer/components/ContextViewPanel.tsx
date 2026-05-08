import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectFile, ProjectSnapshot } from "../../shared/types";

function escapeRegExp(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function highlightContent(text: string, query: string): JSX.Element {
  const q = query.trim();
  if (!q) {
    return <pre className="context-view-pre">{text}</pre>;
  }
  let re: RegExp;
  try {
    re = new RegExp(escapeRegExp(q), "gi");
  } catch {
    return <pre className="context-view-pre">{text}</pre>;
  }

  const nodes: JSX.Element[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const m of text.matchAll(re)) {
    const ix = m.index ?? 0;
    if (ix > lastIndex) {
      nodes.push(<span key={key++}>{text.slice(lastIndex, ix)}</span>);
    }
    nodes.push(
      <mark className="context-search-hit" key={key++}>
        {m[0]}
      </mark>
    );
    lastIndex = ix + m[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }
  return <pre className="context-view-pre">{nodes.length > 0 ? nodes : text}</pre>;
}

export interface ContextViewPanelProps {
  contextFiles: ProjectFile[];
  contextSelection: Record<string, boolean>;
  project: ProjectSnapshot | null;
}

export function ContextViewPanel({
  contextFiles,
  contextSelection,
  project
}: ContextViewPanelProps): JSX.Element {
  const contextKey = useMemo(() => contextFiles.map((f) => f.relativePath).join("\0"), [contextFiles]);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [filterQuery, setFilterQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project || contextFiles.length === 0) {
      setSelectedPath(null);
      return;
    }
    setSelectedPath((current) => {
      if (current && contextFiles.some((f) => f.relativePath === current)) return current;
      return contextFiles[0].relativePath;
    });
  }, [project?.rootPath, contextFiles, contextKey]);

  useEffect(() => {
    if (!project || !selectedPath) {
      setContent("");
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void window.stolow
      ?.readFile(project.rootPath, selectedPath)
      .then((text) => {
        if (!cancelled) {
          setContent(text);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("読み込みに失敗しました。");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [project?.rootPath, selectedPath]);

  const matchCount = useMemo(() => {
    const q = filterQuery.trim();
    if (!q || !content) return 0;
    let re: RegExp;
    try {
      re = new RegExp(escapeRegExp(q), "gi");
    } catch {
      return 0;
    }
    return (content.match(re) ?? []).length;
  }, [content, filterQuery]);

  const onSelectFile = useCallback((path: string) => {
    setSelectedPath(path);
  }, []);

  if (!project) {
    return <p className="context-view-hint">プロジェクトを開くと、context ファイルをここで参照できます。</p>;
  }

  if (contextFiles.length === 0) {
    return <p className="context-view-hint">context 内に Markdown がありません。</p>;
  }

  return (
    <div className="context-view-panel">
      <div className="context-file-list" role="listbox" aria-label="Context ファイル">
        {contextFiles.map((file) => {
          const usedByAi = contextSelection[file.relativePath] === true;
          return (
            <button
              aria-label={`${file.name}${usedByAi ? "（AI 参照中）" : ""}`}
              className={`context-file-row${file.relativePath === selectedPath ? " is-active" : ""}`}
              key={file.relativePath}
              onClick={() => onSelectFile(file.relativePath)}
              type="button"
            >
              <span
                aria-hidden
                className={`context-ai-dot${usedByAi ? " is-on" : ""}`}
                title={usedByAi ? "AI サジェストに含める" : "AI 参照オフ"}
              />
              <span className="context-file-name">{file.name}</span>
            </button>
          );
        })}
      </div>

      <label className="context-search-label control-block">
        <span>このファイル内を検索</span>
        <input
          className="context-search-input"
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="キーワード"
          type="search"
          value={filterQuery}
        />
        {filterQuery.trim() ? <span className="context-search-count">{matchCount} 件</span> : null}
      </label>

      <div className="context-view-body">
        {isLoading ? (
          <p className="context-view-status">読み込み中…</p>
        ) : error ? (
          <p className="context-view-status context-view-error">{error}</p>
        ) : (
          highlightContent(content, filterQuery)
        )}
      </div>
    </div>
  );
}
