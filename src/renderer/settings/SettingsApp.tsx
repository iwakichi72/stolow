import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Save } from "lucide-react";
import type { ProjectSnapshot, StolowAppSettings, StolowSettings } from "../../shared/types";

export function SettingsApp(): JSX.Element {
  const [project, setProject] = useState<ProjectSnapshot | null>(null);
  const [projectSettingsDraft, setProjectSettingsDraft] = useState<StolowSettings | null>(null);
  const [appSettingsDraft, setAppSettingsDraft] = useState<StolowAppSettings | null>(null);
  const [status, setStatus] = useState<string>("読み込み中…");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!window.stolow) {
          setError("Electron のプリロードが読み込まれていません。");
          return;
        }
        const [appSettings, current] = await Promise.all([
          window.stolow.getAppSettings(),
          window.stolow.getCurrentProjectSnapshot()
        ]);
        if (cancelled) return;
        setAppSettingsDraft(appSettings);
        setProject(current);
        setProjectSettingsDraft(current?.settings ?? null);
        setStatus(current ? `プロジェクト: ${current.name}` : "プロジェクト未選択（メイン画面で Open してください）");
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : "設定の読み込みに失敗しました。");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canEditProjectSettings = Boolean(project && projectSettingsDraft);

  const hasChanges = useMemo(() => {
    if (!project) return false;
    // project settings: 保存は blur ではなく明示ボタンで行うため、単純比較で十分
    return projectSettingsDraft !== null;
  }, [project, projectSettingsDraft]);

  const saveAll = useCallback(async (): Promise<void> => {
    setError(null);
    if (!window.stolow) return;
    if (!appSettingsDraft) return;

    setIsSaving(true);
    try {
      await window.stolow.updateAppSettings(appSettingsDraft);
      if (project && projectSettingsDraft) {
        await window.stolow.updateSettings(project.rootPath, projectSettingsDraft);
      }
      setStatus("保存しました。");
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }, [appSettingsDraft, project, projectSettingsDraft]);

  return (
    <main className="app-shell">
      <section className="editor-pane" aria-label="Settings window">
        <div className="editor-topbar">
          <div className="document-title">
            <span>設定</span>
            <span className="document-path">{status}</span>
          </div>
          <div className="document-meta">
            <button
              className="icon-button"
              disabled={isSaving || !appSettingsDraft || Boolean(project && !projectSettingsDraft)}
              onClick={() => void saveAll()}
              title="保存"
              type="button"
            >
              {isSaving ? <Loader2 aria-hidden className="spin" size={16} /> : <Save aria-hidden size={16} />}
            </button>
          </div>
        </div>

        <div style={{ padding: 18, overflow: "auto" }}>
          {error ? (
            <div className="error-box" role="alert" style={{ marginBottom: 14 }}>
              <AlertCircle aria-hidden size={17} />
              <span>{error}</span>
            </div>
          ) : null}

          {appSettingsDraft ? (
            <details className="settings-box" open>
              <summary>アプリ設定</summary>
              <label className="toggle-row">
                <input
                  checked={appSettingsDraft.autoCreateProjectStructure}
                  onChange={(e) =>
                    setAppSettingsDraft((cur) => (cur ? { ...cur, autoCreateProjectStructure: e.target.checked } : cur))
                  }
                  type="checkbox"
                />
                <span>プロジェクトの `manuscript/` と `context/` を自動生成する</span>
              </label>
              <div className="empty-list">
                OFF の場合、フォルダを作らずに開きます（ファイルが無い場合は手動で追加してください）。
              </div>
            </details>
          ) : (
            <div className="empty-list">アプリ設定を読み込めませんでした。</div>
          )}

          <details className="settings-box" open style={{ marginTop: 10 }}>
            <summary>接続とモデル名</summary>
            {!canEditProjectSettings ? (
              <div className="empty-list">
                プロジェクトが選択されていません。メイン画面でプロジェクトを開くと、このウィンドウに反映されます。
              </div>
            ) : null}

            {projectSettingsDraft ? (
              <>
                <SettingsInput
                  label="Ollama URL"
                  value={projectSettingsDraft.ollamaUrl}
                  onChange={(value) => setProjectSettingsDraft((cur) => (cur ? { ...cur, ollamaUrl: value } : cur))}
                />
                <SettingsInput
                  label="Default"
                  value={projectSettingsDraft.defaultModel}
                  onChange={(value) =>
                    setProjectSettingsDraft((cur) => (cur ? { ...cur, defaultModel: value } : cur))
                  }
                />
                <SettingsInput
                  label="Quick"
                  value={projectSettingsDraft.quickModel}
                  onChange={(value) =>
                    setProjectSettingsDraft((cur) => (cur ? { ...cur, quickModel: value } : cur))
                  }
                />
                <SettingsInput
                  label="Quality"
                  value={projectSettingsDraft.qualityModel}
                  onChange={(value) =>
                    setProjectSettingsDraft((cur) => (cur ? { ...cur, qualityModel: value } : cur))
                  }
                />
              </>
            ) : null}

            {!hasChanges ? null : (
              <div className="empty-list">右上の保存ボタンで保存します。</div>
            )}
          </details>
        </div>
      </section>
    </main>
  );
}

function SettingsInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
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
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft.trim();
          if (next && next !== value) onChange(next);
        }}
      />
    </label>
  );
}

