import type { SuggestionMode } from "../../shared/types.js";

export const MODE_LABELS: Record<SuggestionMode, string> = {
  natural: "自然に続きを出す",
  surprising: "少し意外な方向にずらす",
  ominous: "不穏さや違和感を足す",
  emotional: "心理描写や余韻を強める",
  fast: "テンポよく会話や行動で進める",
  styleOnly: "展開を進めすぎず文体に寄せる"
};

export const MODE_PROMPT_INSTRUCTIONS: Record<SuggestionMode, string> = {
  natural: "直前の文体、視点、テンポに自然につながる一段落にしてください。",
  surprising: "既存設定を壊さず、少しだけ意外な観察、反応、違和感で方向をずらしてください。",
  ominous: "明確な真相は明かさず、不穏さや説明しきれない違和感を薄く足してください。",
  emotional: "人物の心理、身体感覚、余韻を少し強め、出来事そのものは大きく進めないでください。",
  fast: "会話や行動を中心に、冗長な説明を避けてテンポよくつなげてください。",
  styleOnly: "新しい展開を足しすぎず、既存の文体、語彙、リズムへの寄せを最優先してください。"
};
