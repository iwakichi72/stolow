import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectFile, ProjectSnapshot, ProjectStats, StolowSettings } from "../../shared/types";
import { parseOutline } from "./OutlinePanel";

export interface StatsPanelProps {
  activeFile: ProjectFile | null;
  documentText: string;
  onTargetCharsChange: (value: number | undefined) => void;
  project: ProjectSnapshot | null;
  settings: StolowSettings | null;
}

export function StatsPanel({
  activeFile,
  documentText,
  onTargetCharsChange,
  project,
  settings
}: StatsPanelProps): JSX.Element {
  const [projectStats, setProjectStats] = useState<ProjectStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const sessionClockRef = useRef(Date.now());
  const documentTextRef = useRef(documentText);
  documentTextRef.current = documentText;

  const [sessionAnchor, setSessionAnchor] = useState<{ path: string | null; len: number }>({
    path: null,
    len: 0
  });

  useEffect(() => {
    sessionClockRef.current = Date.now();
    setSessionAnchor({
      path: activeFile?.relativePath ?? null,
      len: documentTextRef.current.length
    });
  }, [activeFile?.relativePath, project?.rootPath]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 10_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!project) {
      setProjectStats(null);
      return;
    }
    let cancelled = false;
    setStatsLoading(true);
    setStatsError(null);
    void window.stolow
      ?.getProjectStats(project.rootPath)
      .then((s) => {
        if (!cancelled) setProjectStats(s);
      })
      .catch(() => {
        if (!cancelled) setStatsError("統計の取得に失敗しました。");
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project?.rootPath]);

  const refreshStats = useCallback(() => {
    if (!project) return;
    setStatsLoading(true);
    setStatsError(null);
    void window.stolow
      ?.getProjectStats(project.rootPath)
      .then(setProjectStats)
      .catch(() => setStatsError("統計の取得に失敗しました。"))
      .finally(() => setStatsLoading(false));
  }, [project]);

  const lineCount = useMemo(() => {
    if (!documentText) return 0;
    return documentText.split("\n").length;
  }, [documentText]);

  const headingCount = useMemo(() => parseOutline(documentText).length, [documentText]);

  const sessionDelta =
    sessionAnchor.path !== null && activeFile?.relativePath === sessionAnchor.path
      ? documentText.length - sessionAnchor.len
      : 0;

  const charsPerMinute = useMemo(() => {
    const elapsedMin = Math.max(0, (Date.now() - sessionClockRef.current) / 60_000);
    return elapsedMin > 0.01 ? sessionDelta / elapsedMin : 0;
  }, [sessionDelta, tick]);

  const target = settings?.targetChars;
  const progressPct =
    typeof target === "number" && target > 0 && projectStats
      ? Math.min(100, Math.round((projectStats.totalChars / target) * 100))
      : null;

  const otherChars =
    projectStats != null
      ? Math.max(0, projectStats.totalChars - projectStats.manuscriptChars - projectStats.contextChars)
      : 0;

  return (
    <div className="stats-panel">
      <section className="stats-section">
        <h3 className="stats-section-title">現在のファイル</h3>
        <dl className="stats-dl">
          <div>
            <dt>文字数</dt>
            <dd>{documentText.length.toLocaleString()}</dd>
          </div>
          <div>
            <dt>行数</dt>
            <dd>{lineCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>見出し（#〜###）</dt>
            <dd>{headingCount.toLocaleString()}</dd>
          </div>
        </dl>
      </section>

      <section className="stats-section">
        <h3 className="stats-section-title">このファイルのセッション</h3>
        <p className="stats-hint">ファイルを開き直すかプロジェクトを切り替えるとリセットされます。</p>
        <dl className="stats-dl">
          <div>
            <dt>増減（文字）</dt>
            <dd>
              {sessionDelta >= 0 ? "+" : ""}
              {sessionDelta.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt>おおよその速度</dt>
            <dd>{Number.isFinite(charsPerMinute) ? `${Math.round(charsPerMinute)} 字/分` : "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="stats-section">
        <div className="stats-section-header">
          <h3 className="stats-section-title">プロジェクト全体</h3>
          <button className="chip stats-refresh" disabled={!project || statsLoading} onClick={refreshStats} type="button">
            再計算
          </button>
        </div>
        {!project ? (
          <p className="stats-hint">プロジェクトを開いてください。</p>
        ) : statsError ? (
          <p className="stats-error">{statsError}</p>
        ) : statsLoading && !projectStats ? (
          <p className="stats-hint">集計中…</p>
        ) : projectStats ? (
          <dl className="stats-dl">
            <div>
              <dt>総文字数</dt>
              <dd>{projectStats.totalChars.toLocaleString()}</dd>
            </div>
            <div>
              <dt>manuscript</dt>
              <dd>{projectStats.manuscriptChars.toLocaleString()}</dd>
            </div>
            <div>
              <dt>context</dt>
              <dd>{projectStats.contextChars.toLocaleString()}</dd>
            </div>
            {otherChars > 0 ? (
              <div>
                <dt>その他</dt>
                <dd>{otherChars.toLocaleString()}</dd>
              </div>
            ) : null}
            <div>
              <dt>Markdown ファイル数</dt>
              <dd>{projectStats.fileCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt>原稿ファイル数</dt>
              <dd>{projectStats.manuscriptFileCount.toLocaleString()}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <section className="stats-section">
        <h3 className="stats-section-title">目標文字数（プロジェクト）</h3>
        <label className="stats-target-label">
          <span className="sr-only">目標の総文字数</span>
          <input
            className="stats-target-input"
            inputMode="numeric"
            min={0}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onTargetCharsChange(undefined);
                return;
              }
              const n = Number(raw);
              if (Number.isFinite(n) && n >= 0) onTargetCharsChange(Math.round(n));
            }}
            placeholder="未設定"
            type="number"
            value={target === undefined ? "" : String(target)}
          />
        </label>
        {typeof target === "number" && target > 0 && projectStats ? (
          <div className="stats-progress-wrap">
            <div
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={progressPct ?? 0}
              className="stats-progress"
              role="progressbar"
            >
              <div className="stats-progress-bar" style={{ width: `${progressPct ?? 0}%` }} />
            </div>
            <p className="stats-progress-label">
              {projectStats.totalChars.toLocaleString()} / {target.toLocaleString()} 字（{progressPct}%）
            </p>
          </div>
        ) : (
          <p className="stats-hint">数値を入れると、総文字数に対する進捗バーを表示します。</p>
        )}
      </section>
    </div>
  );
}
