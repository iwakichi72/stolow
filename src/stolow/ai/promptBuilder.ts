import type { ChatMessage, PromptBuildInput } from "./types.js";
import { isMeaningfulContextMarkdown } from "./contextContent.js";
import { MODE_PROMPT_INSTRUCTIONS } from "./suggestionModes.js";

export function buildPromptMessages(input: PromptBuildInput): ChatMessage[] {
  const { context, mode, settings } = input;
  const count = settings.suggestionCount;
  const maxChars = settings.maxParagraphChars;
  const kindLabel = context.kind === "rewrite" ? "選択範囲リライト" : "次段落サジェスト";

  const system = [
    "あなたは小説執筆支援エディタ Stolow のAIアシスタントです。",
    "作者の代わりに物語を書き切らず、作者の執筆フローを保ったまま短い候補だけを出します。",
    "必ず日本語で書いてください。",
    "応答は有効なJSONオブジェクト1個のみ。それ以外の文字（説明、Markdown、コードフェンス、前置き、後書き）は1文字も出さないでください。"
  ].join("\n");

  const taskRules =
    context.kind === "rewrite"
      ? [
          "選択範囲のテキストだけを置き換える形で出力してください（前後の段落を足さない）。",
          "元の出来事、人物、時系列、視点を変えないでください。",
          "新しい設定、事件、人物、伏線を勝手に追加しないでください。",
          "文章表現、読みやすさ、リズム、情緒だけを改善してください。",
          `各候補の text は1段落のみ、最大約 ${maxChars} 文字までにしてください。`
        ]
      : [
          "現在のカーソル位置から続く「次の1段落」だけを各候補に含めてください。",
          "1候補 = 1段落。複数段落や章のまとまり、箇条書きにしないでください。",
          `各候補は2〜6文程度、最大約 ${maxChars} 文字までにしてください。`,
          "次の大きな展開やクライマックスへ進めないでください。会話の1往復、短い描写、小さな気づき程度にとどめてください。",
          "重大な真相、犯人、世界設定の核心を勝手に明かさないでください。",
          "本文へ自動挿入される前提で書かず、候補として自然に読める段落にしてください。"
        ];

  const userParts: string[] = [
    `# タスク: ${kindLabel}`,
    `# 候補数: ${count}（必ずこの件数）`,
    `# 各候補の最大文字数目安: ${maxChars}`,
    `# モード: ${mode}`,
    MODE_PROMPT_INSTRUCTIONS[mode],
    "",
    "# 共通制約",
    ...taskRules.map((rule) => `- ${rule}`),
    ""
  ];

  if (isMeaningfulContextMarkdown(context.summaryText)) {
    userParts.push("# プロジェクト context/summary.md（参考）", fenceBlock(context.summaryText), "");
  }

  if (isMeaningfulContextMarkdown(context.notesText)) {
    userParts.push("# プロジェクト context/notes.md（参考）", fenceBlock(context.notesText), "");
  }

  if (isMeaningfulContextMarkdown(context.chapterText)) {
    userParts.push("# 現在の章（見出し単位の抜粋。参考）", fenceBlock(context.chapterText), "");
  }

  userParts.push(
    "# 見出し（原稿内）",
    context.headings.length > 0 ? context.headings.join("\n") : "(なし)",
    "",
    "# カーソル前本文",
    fenceBlock(context.beforeText),
    "",
    context.kind === "rewrite" ? "# 選択範囲（リライト対象）" : "# カーソル後本文",
    context.kind === "rewrite" ? fenceBlock(context.selectedText) : fenceBlock(context.afterText),
    ""
  );

  if (context.kind === "rewrite") {
    userParts.push("# カーソル後本文（リライト後もこの流れと整合させる）", fenceBlock(context.afterText), "");
  }

  userParts.push(
    "# 出力形式（厳守）",
    `{"suggestions":[{"title":"案1","text":"..."},{"title":"案2","text":"..."},...]}`,
    `suggestions は必ず ${count} 件。各 text は空にしない。JSON 以外は出力禁止。`
  );

  const user = userParts.join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}

function fenceBlock(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 0 ? `---\n${trimmed}\n---` : "(なし)";
}
