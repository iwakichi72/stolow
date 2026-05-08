import { useMemo } from "react";

export interface OutlineItem {
  level: 1 | 2 | 3;
  title: string;
  from: number;
  charCount: number;
}

/** 先頭の # / ## / ### 行をアウトラインとして解析 */
export function parseOutline(text: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = text.split("\n");
  let offset = 0;
  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (m) {
      const level = m[1].length as 1 | 2 | 3;
      items.push({ level, title: m[2].trimEnd(), from: offset, charCount: 0 });
    }
    offset += line.length + 1;
  }
  for (let i = 0; i < items.length; i++) {
    const next = items[i + 1]?.from ?? text.length;
    items[i].charCount = next - items[i].from;
  }
  return items;
}

function activeOutlineIndex(items: OutlineItem[], cursorPos: number): number {
  let idx = -1;
  for (let i = 0; i < items.length; i++) {
    if (items[i].from <= cursorPos) idx = i;
    else break;
  }
  return idx;
}

export interface OutlinePanelProps {
  documentText: string;
  cursorPos: number;
  onJump: (pos: number) => void;
}

export function OutlinePanel({ cursorPos, documentText, onJump }: OutlinePanelProps): JSX.Element {
  const items = useMemo(() => parseOutline(documentText), [documentText]);
  const activeIdx = useMemo(() => activeOutlineIndex(items, cursorPos), [items, cursorPos]);

  return (
    <div className="outline-panel">
      {!documentText.trim() ? (
        <p className="outline-empty">見出しはありません。# / ## / ### で章を区切れます。</p>
      ) : items.length === 0 ? (
        <p className="outline-empty">見出し行がまだありません。行頭に # から始めてください。</p>
      ) : (
        <ul className="outline-list" role="list">
          {items.map((item, i) => (
            <li
              className={`outline-item level-${item.level}${i === activeIdx ? " is-active" : ""}`}
              key={`${item.from}-${i}-${item.title.slice(0, 24)}`}
            >
              <button
                className="outline-row"
                onClick={() => onJump(item.from)}
                type="button"
              >
                <span className="outline-title">{item.title}</span>
                <span className="outline-meta">{item.charCount.toLocaleString()} 字</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
