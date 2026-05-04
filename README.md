# Stolow

Stolowは、小説執筆に特化したAIエディタのElectronデスクトップアプリMVPです。
ローカルフォルダ内のMarkdown原稿を編集し、ローカルOllamaを使って次段落候補や選択範囲リライトを生成します。

## 前提

- Webサービスではなく、ローカル完結の単体アプリです（常駐サーバ・ログイン・外部DBは不要です）。
- 本番利用時にWebサーバや専用バックエンドサーバは起動しません。
- 原稿はローカルMarkdownファイルとして保存します。
- 設定はプロジェクト内の`.stolow/settings.json`に保存します。
- AI生成はOllamaの`/api/chat`を使います。
- Ollamaが未起動でも、アプリの起動・編集・保存は利用できます。AI候補の生成だけOllamaとモデルが必要です。

## セットアップ

```sh
npm install
```

## 開発起動（macOS / 共通）

```sh
npm run dev
```

`npm run dev`はrendererとElectron main processをビルドし、Electronでローカルの`dist/renderer/index.html`を開きます。
Vite dev serverは起動しません。

## ビルドと起動（開発用）

```sh
npm run build
npm start
```

## macOSアプリのビルド

開発初期のため、Apple Developer IDによるコード署名やnotarizationは行っていません。
そのため、初回起動時にGatekeeperの警告（未確認の開発元など）が表示されることがあります。システム設定から「このまま開く」等で回避できます。

### アイコン（.icns）の再生成

ロゴ差し替え後に`.icns`を作り直す場合（**macOS上のみ**）:

```sh
npm run icon:mac
```

`assets/icon.png`を元に`assets/icon.icns`を生成します。`sips`と`iconutil`を使用します。

### 配布用ビルド

```sh
npm run dist:mac
```

- `npm run build`の後、`electron-builder`でmacOS向け成果物を生成します。
- コード署名は無効です（`CSC_IDENTITY_AUTO_DISCOVERY=false` と `build.mac.identity: null`）。

### 生成物の場所

| 種類 | パス |
|------|------|
| `.app` バンドル | `release/mac-arm64/Stolow.app` |
| DMGインストーラ | `release/Stolow-<version>-arm64.dmg`（例: `Stolow-0.1.0-arm64.dmg`） |

Apple Silicon（arm64）向けにビルドされます。Intel Mac向けが必要な場合は、`electron-builder`の`--mac`に加えアーキテクチャ指定などで調整してください。

## 使い方

1. Stolowを起動します。
2. `Open`から小説プロジェクトにしたいローカルフォルダを開きます。
3. フォルダに必要な構成がない場合は、`manuscript/`、`context/`、`.stolow/`が作成されます。
4. `manuscript/*.md`を編集して保存します。
5. 右パネルでモードとモデルプロファイルを選び、候補を生成します。
6. 候補の`Apply`を押したものだけが本文に反映されます。

## 想定プロジェクト構成

```sh
my-story/
  manuscript/
    01-opening.md
  context/
    summary.md
    notes.md
  .stolow/
    project.json
    settings.json
```

## Ollama設定

初期設定は次の通りです。

```json
{
  "ollamaUrl": "http://localhost:11434",
  "defaultModel": "qwen3.5:9b",
  "quickModel": "gemma4:e4b",
  "qualityModel": "gemma4:26b"
}
```

モデル名は右パネルの設定から変更できます。

AI機能を使うには、Ollamaを起動し、利用するモデルをPullしておく必要があります。例:

```sh
ollama pull qwen3.5:9b
ollama pull gemma4:e4b
ollama pull gemma4:26b
```
