import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check } from "lucide-react";
import type { ProjectSnapshot, StolowAppSettings, StolowSettings } from "../../shared/types";

type SettingsTab = "general" | "connection";

export function SettingsApp(): JSX.Element {
  const [project, setProject] = useState<ProjectSnapshot | null>(null);
  const [projectSettings, setProjectSettings] = useState<StolowSettings | null>(null);
  const [appSettings, setAppSettings] = useState<StolowAppSettings | null>(null);
  const [status, setStatus] = useState<string>("読み込み中…");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<SettingsTab>("general");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const isMac =
      typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");
    if (!isMac) return;
    document.documentElement.classList.add("macos-vibrancy");
    return () => document.documentElement.classList.remove("macos-vibrancy");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!window.stolow) {
          setError("Electron のプリロードが読み込まれていません。");
          return;
        }
        const [current, currentProject] = await Promise.all([
          window.stolow.getAppSettings(),
          window.stolow.getCurrentProjectSnapshot()
        ]);
        if (cancelled) return;
        setAppSettings(current);
        setProject(currentProject);
        setProjectSettings(currentProject?.settings ?? null);
        setStatus(
          currentProject
            ? `プロジェクト: ${currentProject.name}`
            : "プロジェクト未選択（メイン画面で Open してください）"
        );
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : "設定の読み込みに失敗しました。");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const flashToast = useCallback((message: string): void => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  const persistAppSettings = useCallback(
    async (next: StolowAppSettings): Promise<void> => {
      if (!window.stolow) return;
      setAppSettings(next);
      try {
        const saved = await window.stolow.updateAppSettings(next);
        setAppSettings(saved);
        flashToast("設定を保存しました");
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : "アプリ設定の保存に失敗しました。");
      }
    },
    [flashToast]
  );

  const persistProjectSettings = useCallback(
    async (next: StolowSettings): Promise<void> => {
      if (!window.stolow || !project) return;
      setProjectSettings(next);
      try {
        const saved = await window.stolow.updateSettings(project.rootPath, next);
        setProjectSettings(saved);
        flashToast("設定を保存しました");
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : "プロジェクト設定の保存に失敗しました。");
      }
    },
    [flashToast, project]
  );

  return (
    <main className="app-shell sidebar-closed settings-shell">
      <section className="editor-pane" aria-label="Settings window">
        <div className="editor-topbar">
          <div className="document-title">
            <span>設定</span>
            <span className="document-path">{status}</span>
          </div>
          <div className="document-meta">
            <div
              className="panel-tabs panel-tabs-multi"
              role="tablist"
              aria-label="設定カテゴリ"
            >
              <button
                aria-selected={tab === "general"}
                className={tab === "general" ? "active" : ""}
                onClick={() => setTab("general")}
                role="tab"
                type="button"
              >
                全般
              </button>
              <button
                aria-selected={tab === "connection"}
                className={tab === "connection" ? "active" : ""}
                onClick={() => setTab("connection")}
                role="tab"
                type="button"
              >
                接続
              </button>
            </div>
          </div>
        </div>

        <div className="settings-content">
          {error ? (
            <div className="error-box" role="alert">
              <AlertCircle aria-hidden size={17} />
              <span>{error}</span>
            </div>
          ) : null}

          {tab === "general" ? (
            <section className="settings-section">
              <h3 className="settings-section-title">全般</h3>
              {appSettings ? (
                <label className="toggle-row">
                  <input
                    checked={appSettings.autoCreateProjectStructure}
                    onChange={(e) =>
                      void persistAppSettings({
                        ...appSettings,
                        autoCreateProjectStructure: e.target.checked
                      })
                    }
                    type="checkbox"
                  />
                  <span>プロジェクトの `manuscript/` と `context/` を自動生成する</span>
                </label>
              ) : (
                <div className="empty-list">アプリ設定を読み込めませんでした。</div>
              )}
              <p className="settings-hint">
                OFF の場合、フォルダを作らずに開きます（ファイルが無い場合は手動で追加してください）。
              </p>
            </section>
          ) : (
            <section className="settings-section">
              <h3 className="settings-section-title">接続とモデル</h3>
              {!project || !projectSettings ? (
                <div className="empty-list">
                  プロジェクトが選択されていません。メイン画面でプロジェクトを開くと、このウィンドウに反映されます。
                </div>
              ) : (
                <div className="settings-grid">
                  <SettingsInput
                    label="Ollama URL"
                    value={projectSettings.ollamaUrl}
                    placeholder="http://localhost:11434"
                    onCommit={(value) =>
                      void persistProjectSettings({ ...projectSettings, ollamaUrl: value })
                    }
                  />
                  <SettingsInput
                    label="Default モデル"
                    value={projectSettings.defaultModel}
                    onCommit={(value) =>
                      void persistProjectSettings({ ...projectSettings, defaultModel: value })
                    }
                  />
                  <SettingsInput
                    label="Quick モデル"
                    value={projectSettings.quickModel}
                    onCommit={(value) =>
                      void persistProjectSettings({ ...projectSettings, quickModel: value })
                    }
                  />
                  <SettingsInput
                    label="Quality モデル"
                    value={projectSettings.qualityModel}
                    onCommit={(value) =>
                      void persistProjectSettings({ ...projectSettings, qualityModel: value })
                    }
                  />
                </div>
              )}
              <p className="settings-hint">
                入力後に他の項目へ移動すると自動保存します（フォーカスを外したタイミング）。
              </p>
            </section>
          )}
        </div>

        {toast ? (
          <div className="settings-toast" role="status" aria-live="polite">
            <Check aria-hidden size={14} />
            <span>{toast}</span>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function SettingsInput({
  label,
  value,
  placeholder,
  onCommit
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <label className="settings-input">
      <span>{label}</span>
      <input
        autoComplete="off"
        placeholder={placeholder}
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft.trim();
          if (next && next !== value) onCommit(next);
          else setDraft(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}
