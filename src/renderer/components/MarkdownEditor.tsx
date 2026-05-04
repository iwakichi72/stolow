import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Compartment, EditorSelection } from "@codemirror/state";
import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import type { EditorSelectionSnapshot } from "../../shared/types";

export interface MarkdownEditorHandle {
  applyChange: (spec: { from: number; to: number; insert: string; selection: EditorSelectionSnapshot }) => void;
}

interface MarkdownEditorProps {
  editable: boolean;
  onChange: (value: string) => void;
  onSelectionChange: (selection: EditorSelectionSnapshot) => void;
  selection: EditorSelectionSnapshot;
  value: string;
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(
  { editable, onChange, onSelectionChange, selection, value }: MarkdownEditorProps,
  ref
): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const editableCompartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const editableRef = useRef(editable);

  useImperativeHandle(
    ref,
    () => ({
      applyChange: ({ from, to, insert, selection: nextSelection }): void => {
        const view = viewRef.current;
        if (!view) return;
        const docLen = view.state.doc.length;
        const clamp = (pos: number): number => Math.max(0, Math.min(pos, docLen));
        const safeFrom = clamp(from);
        const safeTo = clamp(to);
        const head = clamp(nextSelection.head);
        const anchor = clamp(nextSelection.from);
        view.dispatch({
          changes: { from: safeFrom, to: safeTo, insert },
          selection: EditorSelection.range(anchor, head),
          scrollIntoView: true,
          userEvent: "stolow.ai.apply"
        });
        view.focus();
      }
    }),
    []
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    editableRef.current = editable;
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editableCompartmentRef.current.reconfigure(EditorView.editable.of(editable))
    });
  }, [editable]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }

      if (update.selectionSet || update.docChanged) {
        const range = update.state.selection.main;
        const from = Math.min(range.from, range.to);
        const to = Math.max(range.from, range.to);
        onSelectionChangeRef.current({
          from,
          to,
          head: range.head,
          selectedText: update.state.sliceDoc(from, to)
        });
      }
    });

    const view = new EditorView({
      doc: value,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        editableCompartmentRef.current.of(EditorView.editable.of(editableRef.current)),
        updateListener
      ],
      parent: host
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const current = view.state.doc.toString();
    if (current === value) return;

    const len = value.length;
    const clamp = (pos: number): number => Math.max(0, Math.min(pos, len));

    const from = clamp(selection.from);
    const to = clamp(selection.to);
    const head = clamp(selection.head);

    const nextSelection =
      from === to
        ? EditorSelection.cursor(head)
        : head === to
          ? EditorSelection.create([EditorSelection.range(from, head)])
          : head === from
            ? EditorSelection.create([EditorSelection.range(to, head)])
            : EditorSelection.create([EditorSelection.range(from, to)]);

    view.dispatch({
      changes: {
        from: 0,
        to: current.length,
        insert: value
      },
      selection: nextSelection,
      scrollIntoView: true,
      userEvent: "stolow.remote"
    });
    view.focus();
  }, [value, selection]);

  return <div className="editor-host" ref={hostRef} />;
});
