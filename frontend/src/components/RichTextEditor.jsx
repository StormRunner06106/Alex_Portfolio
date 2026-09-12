import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";

const extensions = [
  StarterKit.configure({ heading: { levels: [2, 3] } }),
  TextStyleKit.configure({
    backgroundColor: false,
    color: false,
    fontFamily: false,
    lineHeight: false,
  }),
  Placeholder.configure({
    placeholder: "Start with the idea you want the reader to keep…",
  }),
];

function ToolbarButton({ active = false, children, label, onClick }) {
  return (
    <button
      aria-label={label}
      className={active ? "is-active" : ""}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({ onChange }) {
  const editor = useEditor({
    extensions,
    content: "",
    editorProps: { attributes: { "aria-label": "Article body" } },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getJSON(), currentEditor.getText().trim());
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive("bold") ?? false,
      italic: currentEditor?.isActive("italic") ?? false,
      underline: currentEditor?.isActive("underline") ?? false,
      heading2: currentEditor?.isActive("heading", { level: 2 }) ?? false,
      heading3: currentEditor?.isActive("heading", { level: 3 }) ?? false,
      bulletList: currentEditor?.isActive("bulletList") ?? false,
      orderedList: currentEditor?.isActive("orderedList") ?? false,
      fontSize: currentEditor?.getAttributes("textStyle").fontSize ?? "",
    }),
  });

  if (!editor) return <div className="editor-loading">Preparing editor…</div>;

  return (
    <div className="rich-editor">
      <div className="rich-editor__toolbar" aria-label="Text formatting">
        <div className="editor-tool-group">
          <ToolbarButton active={state?.bold} label="Bold" onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></ToolbarButton>
          <ToolbarButton active={state?.italic} label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></ToolbarButton>
          <ToolbarButton active={state?.underline} label="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolbarButton>
        </div>
        <div className="editor-tool-group">
          <ToolbarButton active={state?.heading2} label="Heading" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
          <ToolbarButton active={state?.heading3} label="Subheading" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarButton>
        </div>
        <div className="editor-tool-group">
          <ToolbarButton active={state?.bulletList} label="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</ToolbarButton>
          <ToolbarButton active={state?.orderedList} label="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</ToolbarButton>
        </div>
        <label className="editor-size">
          <span className="sr-only">Font size</span>
          <select
            aria-label="Font size"
            onChange={(event) => {
              const size = event.target.value;
              const chain = editor.chain().focus();
              if (size) chain.setFontSize(size).run();
              else chain.unsetFontSize().run();
            }}
            value={state?.fontSize ?? ""}
          >
            <option value="">Normal</option>
            <option value="14px">Small</option>
            <option value="18px">Medium</option>
            <option value="22px">Large</option>
            <option value="28px">Extra large</option>
          </select>
        </label>
        <div className="editor-tool-group editor-tool-group--history">
          <ToolbarButton label="Undo" onClick={() => editor.chain().focus().undo().run()}>↶</ToolbarButton>
          <ToolbarButton label="Redo" onClick={() => editor.chain().focus().redo().run()}>↷</ToolbarButton>
        </div>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export function RichTextArticle({ content }) {
  const editor = useEditor({
    extensions,
    content,
    editable: false,
  });

  useEffect(() => {
    if (editor) editor.commands.setContent(content);
  }, [content, editor]);

  if (!editor) return null;
  return <EditorContent className="rich-article" editor={editor} />;
}
