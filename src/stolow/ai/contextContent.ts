/**
 * summary.md / notes.md をプロンプトに載せるかどうか。
 * 雛形のみ（見出し＋空行程度）のときは文脈に含めない。
 */
export function isMeaningfulContextMarkdown(text: string): boolean {
  const body = text.replace(/^\uFEFF/, "").trim();
  if (body.length < 20) return false;
  const withoutLeadingHeading = body.replace(/^#{1,6}\s+[^\n]*(\n+|$)/, "").trim();
  return withoutLeadingHeading.length >= 12;
}
