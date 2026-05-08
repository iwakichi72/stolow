import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { ProjectReplacePreviewResult, ProjectSearchResult, ProjectSnapshot } from "../../shared/types";

export interface SearchPanelProps {
  error: string | null;
  project: ProjectSnapshot | null;
  registerFocus: (fn: () => void) => void;
  onJump: (relativePath: string, from: number, to: number) => Promise<void>;
  onRefreshAfterReplace: () => Promise<void>;
  setPanelError: (value: string | null) => void;
  setStatusMessage: (value: string) => void;
}

export function SearchPanel({
  error,
  registerFocus,
  onJump,
  onRefreshAfterReplace,
  project,
  setPanelError,
  setStatusMessage
}: SearchPanelProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [replace, setReplace] = useState("");
  const [isRegex, setIsRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [result, setResult] = useState<ProjectSearchResult | null>(null);
  const [preview, setPreview] = useState<ProjectReplacePreviewResult | null>(null);
  const queryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    registerFocus(() => {
      queryInputRef.current?.focus();
      queryInputRef.current?.select();
    });
  }, [registerFocus]);

  const canRun = Boolean(project) && query.trim().length > 0 && !isSearching;

  const runSearch = useCallback(async (): Promise<void> => {
    if (!project) {
      setPanelError("プロジェクトを開いてください。");
      return;
    }
    const q = query.trim();
    if (!q) return;
    setIsSearching(true);
    setPanelError(null);
    setPreview(null);
    try {
      const next = await window.stolow.searchProject(project.rootPath, {
        query: q,
        isRegex,
        caseSensitive,
        wholeWord
      });
      setResult(next);
      setStatusMessage(
        next.totalMatches > 0 ? `検索: ${next.totalMatches.toLocaleString()} 件ヒット` : "検索: ヒットなし"
      );
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : "検索に失敗しました。");
    } finally {
      setIsSearching(false);
    }
  }, [caseSensitive, isRegex, project, query, setPanelError, setStatusMessage, wholeWord]);

  const runReplacePreview = useCallback(async (): Promise<void> => {
    if (!project) {
      setPanelError("プロジェクトを開いてください。");
      return;
    }
    const q = query.trim();
    if (!q) return;
    setIsPreviewing(true);
    setPanelError(null);
    try {
      const next = await window.stolow.replacePreview({
        projectPath: project.rootPath,
        query: q,
        replace,
        isRegex,
        caseSensitive,
        wholeWord
      });
      setPreview(next);
      setStatusMessage(
        next.totalMatches > 0 ? `置換プレビュー: ${next.totalMatches.toLocaleString()} 件` : "置換プレビュー: 対象なし"
      );
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : "置換プレビューに失敗しました。");
    } finally {
      setIsPreviewing(false);
    }
  }, [caseSensitive, isRegex, project, query, replace, setPanelError, setStatusMessage, wholeWord]);

  const runReplaceApply = useCallback(async (): Promise<void> => {
    if (!project) return;
    if (!preview || preview.totalMatches === 0) return;
    setIsApplying(true);
    setPanelError(null);
    try {
      const applied = await window.stolow.replaceApply({
        projectPath: project.rootPath,
        query: preview.query,
        replace: preview.replace,
        isRegex,
        caseSensitive,
        wholeWord
      });
      setStatusMessage(
        `置換: ${applied.totalMatches.toLocaleString()} 件 / ${applied.updatedFiles.toLocaleString()} ファイル更新`
      );
      setPreview(null);
      await onRefreshAfterReplace();
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : "置換に失敗しました。");
    } finally {
      setIsApplying(false);
    }
  }, [caseSensitive, isRegex, onRefreshAfterReplace, preview, project, setPanelError, setStatusMessage, wholeWord]);

  return (
    <>
      <div className="search-form">
        <label className="settings-input">
          <span>検索</span>
          <input
            ref={queryInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例: 彼女 / /禁則.*/ / (?:彼|彼女)"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
          />
        </label>

        <fieldset className="control-block control-fieldset">
          <legend className="control-legend">オプション</legend>
          <label className="toggle-row">
            <input checked={isRegex} onChange={(e) => setIsRegex(e.target.checked)} type="checkbox" />
            <span>正規表現</span>
          </label>
          <label className="toggle-row">
            <input
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              type="checkbox"
            />
            <span>大/小文字を区別</span>
          </label>
          <label className="toggle-row">
            <input checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} type="checkbox" />
            <span>単語境界（whole word）</span>
          </label>
        </fieldset>

        <div className="search-actions">
          <button className="generate-button" disabled={!canRun} onClick={() => void runSearch()} type="button">
            {isSearching ? "検索中…" : "検索"}
          </button>
        </div>

        <details className="settings-box">
          <summary>置換</summary>
          <label className="settings-input">
            <span>置換後</span>
            <input value={replace} onChange={(e) => setReplace(e.target.value)} spellCheck={false} />
          </label>
          <div className="search-actions">
            <button
              className="chip"
              disabled={!project || !query.trim() || isPreviewing}
              onClick={() => void runReplacePreview()}
              type="button"
            >
              {isPreviewing ? "プレビュー中…" : "プレビュー"}
            </button>
            <button
              className="primary-action"
              disabled={!preview || preview.totalMatches === 0 || isApplying}
              onClick={() => void runReplaceApply()}
              type="button"
            >
              {isApplying ? "適用中…" : "置換を適用"}
            </button>
          </div>
          {preview ? (
            <div className="hint-box" role="status">
              {preview.totalMatches.toLocaleString()} 件 / {preview.files.length.toLocaleString()} ファイル
              {preview.truncated ? "（表示は一部）" : ""}
            </div>
          ) : null}
        </details>
      </div>

      {error ? (
        <div className="error-box" role="alert">
          <AlertCircle aria-hidden size={17} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="search-results">
        {result ? (
          <>
            <div className="search-summary">
              <span>
                {result.totalMatches.toLocaleString()} 件 / {result.files.length.toLocaleString()} ファイル
                {result.truncated ? "（表示は一部）" : ""}
              </span>
            </div>
            {result.files.map((file) => (
              <details className="search-file" key={file.relativePath}>
                <summary>
                  <span className="search-file-path">{file.relativePath}</span>
                  <span className="search-file-count">{file.matchCount.toLocaleString()}</span>
                </summary>
                <div className="search-hits">
                  {file.items.map((hit, idx) => (
                    <button
                      className="search-hit"
                      key={`${file.relativePath}-${hit.from}-${hit.to}-${idx}`}
                      onClick={() => void onJump(file.relativePath, hit.from, hit.to)}
                      type="button"
                    >
                      <span className="search-hit-loc">
                        {hit.line}:{hit.column}
                      </span>
                      <span className="search-hit-text">{hit.lineText}</span>
                    </button>
                  ))}
                </div>
              </details>
            ))}
          </>
        ) : (
          <div className="empty-suggestions">
            <span>検索結果はここに表示されます。</span>
          </div>
        )}
      </div>
    </>
  );
}

