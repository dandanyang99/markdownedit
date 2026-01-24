import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import MarkdownIt from "markdown-it";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - markdown-it-footnote has no types in our setup.
import mdFootnote from "markdown-it-footnote";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - markdown-it-mark has no types in our setup.
import mdMark from "markdown-it-mark";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - markdown-it-task-lists has no types in our setup.
import mdTaskLists from "markdown-it-task-lists";
import DOMPurify from "dompurify";
import TurndownService from "turndown";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - turndown-plugin-gfm has no types in our setup.
import { highlightedCodeBlock, taskListItems } from "turndown-plugin-gfm";
import "./App.css";

type TreeNode = {
  name: string;
  path: string;
  kind: "file" | "folder";
  children?: TreeNode[];
};

type RecentFile = {
  path: string;
  name: string;
};

type EditorMode = "wysiwyg" | "markdown" | "split";
type ThemeMode = "light" | "dark";

const RECENTS_KEY = "markdownedit.recents.v1";
const THEME_KEY = "markdownedit.theme.v1";

function getFileName(p: string) {
  // Handle both Windows and POSIX paths.
  const parts = p.split(/[/\\\\]/);
  return parts[parts.length - 1] || p;
}

function loadRecents(): RecentFile[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentFile[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.path === "string")
      .slice(0, 20)
      .map((x) => ({ path: x.path, name: x.name || getFileName(x.path) }));
  } catch {
    return [];
  }
}

function saveRecents(list: RecentFile[]) {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 20)));
}

function loadTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    // ignore
  }
  return "light";
}

function App() {
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [workspaceTree, setWorkspaceTree] = useState<TreeNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [content, setContent] = useState<string>(""); // canonical markdown text
  const [dirty, setDirty] = useState(false);

  const [mode, setMode] = useState<EditorMode>("markdown");
  const [splitLeftPct, setSplitLeftPct] = useState(60);
  const splitWrapRef = useRef<HTMLDivElement | null>(null);
  const splitDraggingRef = useRef(false);

  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  const [recents, setRecents] = useState<RecentFile[]>(() => loadRecents());
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const lastAppliedMdToWysiwygRef = useRef<string | null>(null);
  const wysiwygSyncTimerRef = useRef<number | null>(null);

  const md = useMemo(
    () => {
      // "Preview" renderer: enable GFM-ish extras (tables are already supported by markdown-it default),
      // plus task lists + footnotes + ==mark== highlight.
      const inst = new MarkdownIt({
        html: false,
        linkify: true,
        breaks: true,
      });
      inst.use(mdFootnote);
      inst.use(mdMark);
      inst.use(mdTaskLists, { enabled: true, label: true, labelAfter: false });
      return inst;
    },
    [],
  );

  const mdForWysiwyg = useMemo(() => {
    // "WYSIWYG importer": avoid task-list checkbox HTML that TipTap won't parse reliably yet;
    // keep task list syntax as plain text inside lists so it round-trips via markdown.
    const inst = new MarkdownIt({
      html: false,
      linkify: true,
      breaks: true,
    });
    inst.use(mdMark);
    return inst;
  }, []);

  const turndown = useMemo(() => {
    const svc = new TurndownService({
      codeBlockStyle: "fenced",
      emDelimiter: "*",
    });
    // Avoid turndown-plugin-gfm "tables" keep() behavior, because it keeps <table> as HTML when
    // it can't detect a heading row. We'll provide our own table conversion that always emits
    // markdown tables for TipTap-generated <table>.
    svc.use([highlightedCodeBlock, taskListItems]);

    // <del>/<s>/<strike> -> ~~text~~
    svc.addRule("strikethrough", {
      filter: ["del", "s", "strike"],
      replacement: (content: string) => `~~${content}~~`,
    });

    // Convert any HTML table to a markdown table (MVP: plain text cells, always emits header row).
    svc.addRule("tableAny", {
      filter: (node: Node) => (node as HTMLElement).nodeName === "TABLE",
      replacement: (_content: string, node: Node) => {
        const table = node as HTMLTableElement;
        const rows = Array.from(table.querySelectorAll("tr"));
        if (!rows.length) return "";

        const rowCells = rows.map((tr) =>
          Array.from(tr.querySelectorAll("th,td")).map((cell) => {
            // Convert inner HTML to markdown (keeps inline links/emphasis where possible),
            // then collapse whitespace to keep table on single lines.
            const mdCell = svc.turndown((cell as HTMLElement).innerHTML);
            const text = mdCell.replace(/\s+/g, " ").trim();
            return text.replace(/\|/g, "\\|");
          }),
        );

        const colCount = Math.max(...rowCells.map((c) => c.length), 1);
        const pad = (cells: string[]) => {
          const out = cells.slice(0, colCount);
          while (out.length < colCount) out.push("");
          return out;
        };

        const hasTh = rows[0].querySelectorAll("th").length > 0;
        const header = pad(rowCells[0]);
        const bodyRows = rowCells.slice(1);
        const sep = new Array(colCount).fill("---");

        const toLine = (cells: string[]) => `| ${cells.map((c) => c || "").join(" | ")} |`;
        const lines = [toLine(header), toLine(sep)];
        for (const r of bodyRows) lines.push(toLine(pad(r)));

        // If there was no explicit header row (<th>), we still emit the first row as header
        // to avoid falling back to raw HTML (<table>...</table>).
        // (TipTap insertTable creates header cells, so hasTh should usually be true.)
        void hasTh;

        return `\n\n${lines.join("\n")}\n\n`;
      },
    });

    // <mark> -> ==text==
    svc.addRule("mark", {
      filter: ["mark"],
      replacement: (content: string) => `==${content}==`,
    });

    return svc;
  }, []);

  const wysiwyg = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: {},
      }),
      Highlight,
      Link.configure({ openOnClick: false }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: "",
    editorProps: {
      attributes: { class: "tiptapEditor" },
    },
    onUpdate: ({ editor }) => {
      setDirty(true);
      // Keep markdown source-of-truth reasonably up-to-date while typing in WYSIWYG,
      // so that status bar + preview (split) stay correct.
      if (wysiwygSyncTimerRef.current) window.clearTimeout(wysiwygSyncTimerRef.current);
      wysiwygSyncTimerRef.current = window.setTimeout(() => {
        const markdown = turndown.turndown(editor.getHTML());
        setContent(markdown);
        lastAppliedMdToWysiwygRef.current = markdown;
      }, 300);
    },
  });

  const currentFileName = useMemo(() => {
    if (!currentFilePath) return "未命名.md";
    return getFileName(currentFilePath);
  }, [currentFilePath]);

  const updateRecents = useCallback((path: string) => {
    const entry: RecentFile = { path, name: getFileName(path) };
    setRecents((prev) => {
      const next = [entry, ...prev.filter((x) => x.path !== path)].slice(0, 20);
      saveRecents(next);
      return next;
    });
  }, []);

  const loadWorkspace = useCallback(async (root: string) => {
    const tree = (await invoke("scan_workspace", { root })) as TreeNode;
    setWorkspaceRoot(root);
    setWorkspaceTree(tree);
    setExpanded(new Set([tree.path])); // expand root by default
  }, []);

  const pickWorkspace = useCallback(async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (!selected) return;
      const root = Array.isArray(selected) ? selected[0] : selected;
      await loadWorkspace(root);
    } catch (e) {
      console.error(e);
      alert("打开工作区失败（请检查 Tauri capabilities 是否已开启 dialog 权限）");
    }
  }, [loadWorkspace]);

  const openFileByPath = useCallback(
    async (path: string) => {
      try {
        const text = (await invoke("read_text_file", { path })) as string;
        setCurrentFilePath(path);
        setContent(text);
        setDirty(false);
        updateRecents(path);
        // If currently in WYSIWYG, update it to show the opened file.
        if (mode === "wysiwyg" && wysiwyg) {
          const html = mdForWysiwyg.render(text);
          wysiwyg.commands.setContent(html, { emitUpdate: false });
          lastAppliedMdToWysiwygRef.current = text;
        }
        // Best-effort focus back to editor.
        queueMicrotask(() => {
          if (mode === "wysiwyg") wysiwyg?.commands.focus("start");
          else editorRef.current?.focus();
        });
      } catch (e) {
        console.error(e);
        alert(`打开失败：${path}`);
      }
    },
    [md, mode, updateRecents, wysiwyg],
  );

  const pickFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!selected) return;
      const path = Array.isArray(selected) ? selected[0] : selected;
      await openFileByPath(path);
    } catch (e) {
      console.error(e);
      alert("打开文件失败（请检查 Tauri capabilities 是否已开启 dialog 权限）");
    }
  }, [openFileByPath]);

  const saveFile = useCallback(async () => {
    try {
      let path = currentFilePath;
      if (!path) {
        const selected = await save({
          defaultPath: currentFileName,
          filters: [{ name: "Markdown", extensions: ["md"] }],
        });
        if (!selected) return;
        path = selected;
        setCurrentFilePath(path);
      }

      let markdownToSave = content;
      if (mode === "wysiwyg" && wysiwyg) {
        markdownToSave = turndown.turndown(wysiwyg.getHTML());
        setContent(markdownToSave);
        lastAppliedMdToWysiwygRef.current = markdownToSave;
      }

      await invoke("write_text_file", { path, content: markdownToSave });
      setDirty(false);
      updateRecents(path);
    } catch (e) {
      console.error(e);
      alert("保存失败");
    }
  }, [content, currentFileName, currentFilePath, mode, turndown, updateRecents, wysiwyg]);

  const saveAs = useCallback(async () => {
    try {
      const selected = await save({
        defaultPath: currentFileName,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!selected) return;

      let markdownToSave = content;
      if (mode === "wysiwyg" && wysiwyg) {
        markdownToSave = turndown.turndown(wysiwyg.getHTML());
        setContent(markdownToSave);
        lastAppliedMdToWysiwygRef.current = markdownToSave;
      }

      await invoke("write_text_file", { path: selected, content: markdownToSave });
      setCurrentFilePath(selected);
      setDirty(false);
      updateRecents(selected);
    } catch (e) {
      console.error(e);
      alert("另存为失败");
    }
  }, [content, currentFileName, mode, turndown, updateRecents, wysiwyg]);

  // Ctrl+O / Ctrl+S shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        void pickFile();
      }
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveFile();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pickFile, saveFile]);

  const toggleExpanded = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const switchMode = useCallback(
    (next: EditorMode) => {
      if (next === mode) return;

      // Leaving WYSIWYG: pull markdown from the rich editor to keep source-of-truth in sync.
      if (mode === "wysiwyg" && wysiwyg) {
        const markdown = turndown.turndown(wysiwyg.getHTML());
        setContent(markdown);
        lastAppliedMdToWysiwygRef.current = markdown;
      }

      setMode(next);

      // When leaving plain editor, keep focus behavior consistent.
      queueMicrotask(() => {
        if (next === "wysiwyg") wysiwyg?.commands.focus("start");
        else editorRef.current?.focus();
      });
    },
    [mode, turndown, wysiwyg],
  );

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ThemeMode = prev === "light" ? "dark" : "light";
      localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Close dropdowns on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-dropdown]")) return;
      setFileMenuOpen(false);
      setHeadingMenuOpen(false);
      setSettingsMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const newFile = useCallback(() => {
    if (mode === "wysiwyg" && wysiwyg) {
      wysiwyg.commands.clearContent(true);
      lastAppliedMdToWysiwygRef.current = "";
    }
    setCurrentFilePath(null);
    setContent("");
    setDirty(false);
  }, [mode, wysiwyg]);

  const insertIntoTextarea = useCallback((prefix: string, suffix = "", placeholder = "") => {
    const el = editorRef.current;
    if (!el) return;

    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selected = el.value.slice(start, end);
    const body = selected || placeholder;
    const next = el.value.slice(0, start) + prefix + body + suffix + el.value.slice(end);

    setContent(next);
    setDirty(true);

    queueMicrotask(() => {
      const posStart = start + prefix.length;
      const posEnd = posStart + body.length;
      el.focus();
      el.setSelectionRange(posStart, posEnd);
    });
  }, []);

  const prefixLinesInTextarea = useCallback((prefix: string) => {
    const el = editorRef.current;
    if (!el) return;

    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;

    const before = el.value.slice(0, start);
    const sel = el.value.slice(start, end);
    const after = el.value.slice(end);

    const lines = (sel || "").split("\n");
    const nextSel = lines.length ? lines.map((l) => (l ? prefix + l : l)).join("\n") : prefix;
    const next = before + nextSel + after;

    setContent(next);
    setDirty(true);
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(start, start + nextSel.length);
    });
  }, []);

  const onTool = useCallback(
    (tool: string) => {
      if (mode === "wysiwyg" && wysiwyg) {
        const chain = wysiwyg.chain().focus();
        switch (tool) {
          case "bold":
            chain.toggleBold().run();
            return;
          case "italic":
            chain.toggleItalic().run();
            return;
          case "strike":
            chain.toggleStrike().run();
            return;
          case "highlight":
            chain.toggleHighlight().run();
            return;
          case "h1":
            chain.toggleHeading({ level: 1 }).run();
            return;
          case "h2":
            chain.toggleHeading({ level: 2 }).run();
            return;
          case "h3":
            chain.toggleHeading({ level: 3 }).run();
            return;
          case "ul":
            chain.toggleBulletList().run();
            return;
          case "ol":
            chain.toggleOrderedList().run();
            return;
          case "quote":
            chain.toggleBlockquote().run();
            return;
          case "code":
            chain.toggleCode().run();
            return;
          case "codeblock":
            chain.toggleCodeBlock().run();
            return;
          case "link": {
            const href = window.prompt("输入链接 URL（留空移除链接）")?.trim() ?? "";
            if (!href) {
              wysiwyg.chain().focus().unsetLink().run();
              return;
            }
            wysiwyg.chain().focus().extendMarkRange("link").setLink({ href }).run();
            return;
          }
          case "image": {
            const src = window.prompt("输入图片 URL")?.trim();
            if (!src) return;
            (wysiwyg.chain().focus() as any).setImage({ src }).run();
            return;
          }
          case "table":
            (wysiwyg.chain().focus() as any).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
            return;
          case "formula":
            chain.insertContent("$$\n\n$$").run();
            return;
          default:
            return;
        }
      }

      // Markdown / Split: insert markdown syntax.
      switch (tool) {
        case "bold":
          insertIntoTextarea("**", "**", "加粗文本");
          return;
        case "italic":
          insertIntoTextarea("*", "*", "斜体文本");
          return;
        case "strike":
          insertIntoTextarea("~~", "~~", "删除线");
          return;
        case "highlight":
          insertIntoTextarea("==", "==", "高亮");
          return;
        case "h1":
          prefixLinesInTextarea("# ");
          return;
        case "h2":
          prefixLinesInTextarea("## ");
          return;
        case "h3":
          prefixLinesInTextarea("### ");
          return;
        case "ul":
          prefixLinesInTextarea("- ");
          return;
        case "ol":
          prefixLinesInTextarea("1. ");
          return;
        case "quote":
          prefixLinesInTextarea("> ");
          return;
        case "code":
          insertIntoTextarea("`", "`", "code");
          return;
        case "codeblock":
          insertIntoTextarea("```\n", "\n```", "code");
          return;
        case "link": {
          const url = window.prompt("输入链接 URL")?.trim();
          if (!url) return;
          insertIntoTextarea("[", `](${url})`, "链接文本");
          return;
        }
        case "image": {
          const url = window.prompt("输入图片 URL")?.trim();
          if (!url) return;
          insertIntoTextarea("![](", ")", url);
          return;
        }
        case "table":
          insertIntoTextarea("| 标题1 | 标题2 |\n| --- | --- |\n| 内容1 | 内容2 |\n");
          return;
        case "formula":
          insertIntoTextarea("$$\n", "\n$$");
          return;
        default:
          return;
      }
    },
    [insertIntoTextarea, mode, prefixLinesInTextarea, wysiwyg],
  );

  const modeTabs = (
    <div className="modeTabs" role="tablist" aria-label="编辑模式">
      <button
        type="button"
        role="tab"
        className={`modeTab ${mode === "wysiwyg" ? "active" : ""}`}
        aria-selected={mode === "wysiwyg"}
        onClick={() => switchMode("wysiwyg")}
      >
        所见即所得
      </button>
      <button
        type="button"
        role="tab"
        className={`modeTab ${mode === "markdown" ? "active" : ""}`}
        aria-selected={mode === "markdown"}
        onClick={() => switchMode("markdown")}
      >
        源码
      </button>
      <button
        type="button"
        role="tab"
        className={`modeTab ${mode === "split" ? "active" : ""}`}
        aria-selected={mode === "split"}
        onClick={() => switchMode("split")}
      >
        分栏
      </button>
    </div>
  );

  // Entering WYSIWYG: push markdown into the rich editor (best-effort).
  useEffect(() => {
    if (mode !== "wysiwyg") return;
    if (!wysiwyg) return;

    if (lastAppliedMdToWysiwygRef.current === content) return;
    const html = mdForWysiwyg.render(content);
    wysiwyg.commands.setContent(html, { emitUpdate: false });
    lastAppliedMdToWysiwygRef.current = content;
  }, [content, mdForWysiwyg, mode, wysiwyg]);

  // Split pane drag (basic).
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!splitDraggingRef.current) return;
      if (mode !== "split") return;
      const wrap = splitWrapRef.current;
      if (!wrap) return;

      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const minLeft = 180;
      const minRight = 200;
      const maxLeft = rect.width - minRight;
      const clamped = Math.max(minLeft, Math.min(maxLeft, x));
      setSplitLeftPct((clamped / rect.width) * 100);
    };

    const onMouseUp = () => {
      splitDraggingRef.current = false;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [mode]);

  const renderTreeNode = useCallback(
    (node: TreeNode) => {
      const isFolder = node.kind === "folder";
      const isExpanded = expanded.has(node.path);
      const isSelected = node.kind === "file" && node.path === currentFilePath;

      return (
        <div key={node.path} className="treeNode">
          <button
            type="button"
            className={`treeItem ${isSelected ? "selected" : ""}`}
            onClick={() => {
              if (isFolder) toggleExpanded(node.path);
              else void openFileByPath(node.path);
            }}
            title={node.path}
          >
            <span className={`treeIcon ${isFolder ? "folder" : "file"}`} />
            {isFolder ? (
              <span className={`treeCaret ${isExpanded ? "expanded" : ""}`} />
            ) : (
              <span className="treeCaretPlaceholder" />
            )}
            <span className="treeName">{node.name}</span>
          </button>

          {isFolder && isExpanded && node.children?.length ? (
            <div className="treeChildren">
              {node.children.map((c) => renderTreeNode(c))}
            </div>
          ) : null}
        </div>
      );
    },
    [currentFilePath, expanded, openFileByPath, toggleExpanded],
  );

  const charCount = useMemo(() => content.length, [content]);
  const wordCount = useMemo(() => {
    // "字数" (MVP): count CJK chars + count latin/number word tokens.
    const cjk = content.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
    const latinWords = content.match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g)?.length ?? 0;
    return cjk + latinWords;
  }, [content]);

  const previewHtml = useMemo(() => {
    const rendered = md.render(content);
    return DOMPurify.sanitize(rendered, {
      ADD_TAGS: ["section", "mark", "input", "label", "sup"],
      ADD_ATTR: ["id", "class", "for", "type", "checked", "disabled", "aria-label", "aria-describedby", "role"],
    });
  }, [content, md]);

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbarRow toolbarRowTop">
          <div className="toolbarLeft">
            <button
              type="button"
              className="logoBtn"
              title="返回默认工作区（MVP：清空当前工作区）"
              onClick={() => {
                setWorkspaceRoot(null);
                setWorkspaceTree(null);
                setExpanded(new Set());
              }}
            >
              <span className="logoMark">M</span>
            </button>

            <div className="dropdown" data-dropdown>
              <button
                type="button"
                className="menuBtn"
                onClick={() => setFileMenuOpen((v) => !v)}
                aria-expanded={fileMenuOpen}
              >
                文件 <span className="caret">▾</span>
              </button>
              {fileMenuOpen ? (
                <div className="menu" role="menu">
                  <button
                    type="button"
                    className="menuItem"
                    role="menuitem"
                    onClick={() => {
                      setFileMenuOpen(false);
                      newFile();
                    }}
                  >
                    新建
                  </button>
                  <button
                    type="button"
                    className="menuItem"
                    role="menuitem"
                    onClick={() => {
                      setFileMenuOpen(false);
                      void pickFile();
                    }}
                  >
                    打开文件 (Ctrl+O)
                  </button>
                  <button
                    type="button"
                    className="menuItem"
                    role="menuitem"
                    onClick={() => {
                      setFileMenuOpen(false);
                      void pickWorkspace();
                    }}
                  >
                    打开工作区
                  </button>
                  <div className="menuSep" />
                  <button
                    type="button"
                    className="menuItem"
                    role="menuitem"
                    onClick={() => {
                      setFileMenuOpen(false);
                      void saveFile();
                    }}
                  >
                    保存 (Ctrl+S)
                  </button>
                  <button
                    type="button"
                    className="menuItem"
                    role="menuitem"
                    onClick={() => {
                      setFileMenuOpen(false);
                      void saveAs();
                    }}
                  >
                    另存为...
                  </button>
                  <div className="menuSep" />
                  <button
                    type="button"
                    className="menuItem"
                    role="menuitem"
                    onClick={() => {
                      setFileMenuOpen(false);
                      alert("导出功能在后续里程碑实现（HTML/PDF/DOCX）。");
                    }}
                  >
                    导出...
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="toolbarRight">
            <button type="button" className="iconBtn" onClick={toggleTheme} title="主题切换（记忆偏好）">
              {theme === "dark" ? "☀" : "☾"}
            </button>

            <div className="dropdown" data-dropdown>
              <button
                type="button"
                className="menuBtn"
                onClick={() => setSettingsMenuOpen((v) => !v)}
                aria-expanded={settingsMenuOpen}
              >
                设置 <span className="caret">▾</span>
              </button>
              {settingsMenuOpen ? (
                <div className="menu alignRight" role="menu">
                  <button
                    type="button"
                    className="menuItem"
                    role="menuitem"
                    onClick={() => {
                      setSettingsMenuOpen(false);
                      alert("偏好设置：后续补齐");
                    }}
                  >
                    偏好设置
                  </button>
                  <button
                    type="button"
                    className="menuItem"
                    role="menuitem"
                    onClick={() => {
                      setSettingsMenuOpen(false);
                      alert("快捷键：后续补齐");
                    }}
                  >
                    快捷键
                  </button>
                  <button
                    type="button"
                    className="menuItem"
                    role="menuitem"
                    onClick={() => {
                      setSettingsMenuOpen(false);
                      alert("帮助：后续补齐");
                    }}
                  >
                    帮助
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="toolbarRow toolbarRowBottom">
          <div className="toolbarTools">
            <div className="toolGroup" aria-label="文本格式">
              <button
                type="button"
                className={`toolBtn ${mode === "wysiwyg" && wysiwyg?.isActive("bold") ? "active" : ""}`}
                onClick={() => onTool("bold")}
                title="加粗 (Ctrl+B)"
              >
                <span className="toolIcon">B</span>
                <span className="toolText">加粗</span>
              </button>
              <button
                type="button"
                className={`toolBtn ${mode === "wysiwyg" && wysiwyg?.isActive("italic") ? "active" : ""}`}
                onClick={() => onTool("italic")}
                title="斜体 (Ctrl+I)"
              >
                <span className="toolIcon">I</span>
                <span className="toolText">斜体</span>
              </button>
              <button
                type="button"
                className={`toolBtn ${mode === "wysiwyg" && wysiwyg?.isActive("strike") ? "active" : ""}`}
                onClick={() => onTool("strike")}
                title="删除线"
              >
                <span className="toolIcon">S</span>
                <span className="toolText">删除线</span>
              </button>
              <button
                type="button"
                className={`toolBtn ${mode === "wysiwyg" && wysiwyg?.isActive("highlight") ? "active" : ""}`}
                onClick={() => onTool("highlight")}
                title="高亮（==text==）"
              >
                <span className="toolIcon">==</span>
                <span className="toolText">高亮</span>
              </button>
            </div>

            <div className="toolGroup" aria-label="段落格式">
              <div className="dropdown" data-dropdown>
                <button
                  type="button"
                  className="toolBtn"
                  onClick={() => setHeadingMenuOpen((v) => !v)}
                  aria-expanded={headingMenuOpen}
                  title="标题"
                >
                  <span className="toolIcon">H</span>
                  <span className="toolText">标题</span>
                  <span className="caret">▾</span>
                </button>
                {headingMenuOpen ? (
                  <div className="menu" role="menu">
                    <button
                      type="button"
                      className="menuItem"
                      role="menuitem"
                      onClick={() => {
                        setHeadingMenuOpen(false);
                        onTool("h1");
                      }}
                    >
                      H1
                    </button>
                    <button
                      type="button"
                      className="menuItem"
                      role="menuitem"
                      onClick={() => {
                        setHeadingMenuOpen(false);
                        onTool("h2");
                      }}
                    >
                      H2
                    </button>
                    <button
                      type="button"
                      className="menuItem"
                      role="menuitem"
                      onClick={() => {
                        setHeadingMenuOpen(false);
                        onTool("h3");
                      }}
                    >
                      H3
                    </button>
                  </div>
                ) : null}
              </div>

              <button type="button" className="toolBtn" onClick={() => onTool("ul")} title="无序列表">
                <span className="toolIcon">•</span>
                <span className="toolText">列表</span>
              </button>
              <button type="button" className="toolBtn" onClick={() => onTool("ol")} title="有序列表">
                <span className="toolIcon">1.</span>
                <span className="toolText">有序</span>
              </button>
              <button type="button" className="toolBtn" onClick={() => onTool("quote")} title="引用">
                <span className="toolIcon">&gt;</span>
                <span className="toolText">引用</span>
              </button>
              <button type="button" className="toolBtn" onClick={() => onTool("code")} title="行内代码">
                <span className="toolIcon">{`</>`}</span>
                <span className="toolText">代码</span>
              </button>
              <button type="button" className="toolBtn" onClick={() => onTool("codeblock")} title="代码块">
                <span className="toolIcon">```</span>
                <span className="toolText">代码块</span>
              </button>
            </div>

            <div className="toolGroup" aria-label="插入">
              <button type="button" className="toolBtn" onClick={() => onTool("link")} title="插入链接">
                <span className="toolIcon">URL</span>
                <span className="toolText">链接</span>
              </button>
              <button type="button" className="toolBtn" onClick={() => onTool("image")} title="插入图片">
                <span className="toolIcon">IMG</span>
                <span className="toolText">图片</span>
              </button>
              <button type="button" className="toolBtn" onClick={() => onTool("table")} title="插入表格">
                <span className="toolIcon">▦</span>
                <span className="toolText">表格</span>
              </button>
              <button type="button" className="toolBtn" onClick={() => onTool("formula")} title="插入公式（占位）">
                <span className="toolIcon">∑</span>
                <span className="toolText">公式</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="main">
        <aside className="sidebar">
          <div className="sidebarHeader">
            <div className="sidebarTitle">工作区</div>
            <div className="sidebarSubTitle" title={workspaceRoot ?? ""}>
              {workspaceRoot ?? "未选择"}
            </div>
          </div>

          <div className="sidebarBody">
            {workspaceTree ? (
              <div className="tree">{renderTreeNode(workspaceTree)}</div>
            ) : (
              <div className="emptyHint">点击“选择工作区”开始。</div>
            )}

            <div className="recents">
              <div className="recentsHeader">最近打开</div>
              {recents.length ? (
                <div className="recentsList">
                  {recents.map((r) => (
                    <button
                      key={r.path}
                      type="button"
                      className="recentItem"
                      onClick={() => void openFileByPath(r.path)}
                      title={r.path}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="emptyHintSmall">暂无</div>
              )}
            </div>
          </div>
        </aside>

        <section className="content">
          {mode === "wysiwyg" ? (
            <div className="editorPane">
              <div className="editorHeader">
                <div className="editorHeaderLeft">
                  <div className="editorTitle" title={currentFilePath ?? ""}>
                    {currentFileName}
                  </div>
                  {dirty ? <div className="dirtyDot" title="未保存" /> : null}
                </div>
                <div className="editorHeaderRight">{modeTabs}</div>
              </div>
              <div className="wysiwygWrap">
                {wysiwyg ? <EditorContent editor={wysiwyg} /> : <div className="emptyHint">加载编辑器...</div>}
              </div>
            </div>
          ) : mode === "markdown" ? (
            <div className="editorPane">
              <div className="editorHeader">
                <div className="editorHeaderLeft">
                  <div className="editorTitle" title={currentFilePath ?? ""}>
                    {currentFileName}
                  </div>
                  {dirty ? <div className="dirtyDot" title="未保存" /> : null}
                </div>
                <div className="editorHeaderRight">{modeTabs}</div>
              </div>
              <textarea
                ref={editorRef}
                className="editor"
                value={content}
                onChange={(e) => {
                  setContent(e.currentTarget.value);
                  setDirty(true);
                }}
                placeholder="在这里输入 Markdown..."
                spellCheck={false}
              />
            </div>
          ) : (
            <div ref={splitWrapRef} className="splitWrap">
              <div className="splitLeft" style={{ width: `${splitLeftPct}%` }}>
                <div className="editorHeader">
                  <div className="editorHeaderLeft">
                    <div className="editorTitle" title={currentFilePath ?? ""}>
                      {currentFileName}
                    </div>
                    {dirty ? <div className="dirtyDot" title="未保存" /> : null}
                  </div>
                  <div className="editorHeaderRight">{modeTabs}</div>
                </div>
                <textarea
                  ref={editorRef}
                  className="editor"
                  value={content}
                  onChange={(e) => {
                    setContent(e.currentTarget.value);
                    setDirty(true);
                  }}
                  placeholder="在这里输入 Markdown..."
                  spellCheck={false}
                />
              </div>
              <div
                className="splitDivider"
                role="separator"
                aria-orientation="vertical"
                title="拖拽调整分栏比例"
                onMouseDown={() => {
                  splitDraggingRef.current = true;
                }}
              />
              <div className="splitRight">
                <div className="previewHeader">预览</div>
                <div className="previewBody previewContent" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </div>
          )}
        </section>
      </div>

      <footer className="statusBar">
        <div className="statusLeft">
          <span>字数：{wordCount}</span>
          <span>字符数：{charCount}</span>
          <span>保存：{dirty ? "未保存" : "已保存"}</span>
        </div>
        <div className="statusRight">
          <span>
            {mode === "wysiwyg" ? "所见即所得模式" : mode === "markdown" ? "源码模式" : "分栏预览模式"}
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
