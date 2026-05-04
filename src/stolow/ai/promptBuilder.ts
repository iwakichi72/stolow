import type { ChatMessage, PromptBuildInput } from "./types.js";
import { MODE_PROMPT_INSTRUCTIONS } from "./suggestionModes.js";

export function buildPromptMessages(input: PromptBuildInput): ChatMessage[] {
  const { context, mode, settings } = input;
  const count = settings.suggestionCount;
  const kindLabel = context.kind === "rewrite" ? "選択範囲リライト" : "次段落サジェスト";

  const system = [
    "あなたは小説執筆支援エディタ Stolow のAIアシスタントです。",
    "作者の代わりに物語を書き切るのではなく、作者の執筆フローを保ったまま短い候補を出します。",
    "必ず日本語で回答してください。",
    "出力はJSONのみです。Markdown、説明、コードフェンス、前置きは禁止です。"
  ].join("\n");

  const taskRules =
    context.kind === "rewrite"
      ? [
          "選択範囲だけを書き換えてください。",
          "元の出来事、人物、時系列、視点を変えないでください。",
          "新しい設定、事件、人物、伏線を勝手に追加しないでください。",
          "文章表現、読みやすさ、リズム、情緒だけを改善してください。"
        ]
      : [
          "現在のカーソル位置から続く次の1段落候補を生成してください。",
          "1候補あたり1段落のみ、2〜6文程度、最大600文字程度にしてください。",
          "物語を進めすぎないでください。",
          "重大な真相、犯人、世界設定の核心を勝手に明かさないでください。",
          "本文へ自動挿入される前提で書かず、候補として自然に読める段落にしてください。"
        ];

  const user = [
    `# タスク: ${kindLabel}`,
    `# 候補数: ${count}`,
    `# 最大文字数: ${settings.maxParagraphChars}`,
    `# モード: ${mode}`,
    MODE_PROMPT_INSTRUCTIONS[mode],
    "",
    "# 共通制約",
    ...taskRules.map((rule) => `- ${rule}`),
    "",
    "# 任意コンテキスト: summary.md",
    fenceOrEmpty(context.summaryText),
    "",
    "# 任意コンテキスト: notes.md",
    fenceOrEmpty(context.notesText),
    "",
    "# 見出し",
    context.headings.length > 0 ? context.headings.join("\n") : "(なし)",
    "",
    "# カーソル前本文",
    fenceOrEmpty(context.beforeText),
    "",
    context.kind === "rewrite" ? "# 選択範囲" : "# カーソル後本文",
    context.kind === "rewrite" ? fenceOrEmpty(context.selectedText) : fenceOrEmpty(context.afterText),
    "",
    context.kind === "rewrite" ? "# カーソル後本文" : "",
    context.kind === "rewrite" ? fenceOrEmpty(context.afterText) : "",
    "",
    "# 出力形式",
    '次のJSONオブジェクトだけを返してください: {"suggestions":[{"title":"案1","text":"候補本文"}]}',
    "suggestions配列の件数は候補数と同じにしてください。textは空にしないでください。"
  ]
    .filter((line) => line !== "")
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}

function fenceOrEmpty(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 0 ? `---\n${trimmed}\n---` : "(なし)";
}
