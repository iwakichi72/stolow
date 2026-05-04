# Stolow

Stolowは、小説執筆に特化したAIエディタのElectronデスクトップアプリMVPです。
ローカルフォルダ内のMarkdown原稿を編集し、ローカルOllamaを使って次段落候補や選択範囲リライトを生成します。

## 前提

- Webサービスではなく、ローカル完結の単体アプリです。
- 本番利用時にWebサーバや専用バックエンドサーバは起動しません。
- 原稿はローカルMarkdownファイルとして保存します。
- 設定はプロジェクト内の`.stolow/settings.json`に保存します。
- AI生成はOllamaの`/api/chat`を使います。
- Ollamaが未起動でも、編集と保存は利用できます。

## セットアップ

```sh
npm install
```

## 開発起動

```sh
npm run dev
```

`npm run dev`はrendererとElectron main processをビルドし、Electronでローカルの`dist/renderer/index.html`を開きます。
Vite dev serverは起動しません。

## ビルドと起動

```sh
npm run build
npm start
```

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
