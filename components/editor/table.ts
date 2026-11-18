import { Extension, Node, mergeAttributes } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import {
  addColumnAfter,
  addRowAfter,
  deleteColumn,
  deleteRow,
  deleteTable,
  goToNextCell,
  isInTable,
  tableEditing,
} from "@tiptap/pm/tables";

/**
 * 正文表格：基于 ProseMirror 官方表格模块（@tiptap/pm/tables，已随编辑器安装），
 * 只做文章需要的部分——插入表格、加/删行列、Tab 切换单元格、表头行。
 * 输出的 HTML 只用 table/tbody/tr/th/td + colspan/rowspan，正好在 lib/sanitize.ts 的白名单里。
 */
declare module "@tiptap/core" {
  interface NodeConfig {
    /** prosemirror-tables 靠节点的 tableRole 识别表格结构 */
    tableRole?: "table" | "row" | "cell" | "header_cell";
  }
  interface Commands<ReturnType> {
    articleTable: {
      insertTable: (options?: { rows?: number; cols?: number }) => ReturnType;
      addRowAfter: () => ReturnType;
      addColumnAfter: () => ReturnType;
      deleteRow: () => ReturnType;
      deleteColumn: () => ReturnType;
      deleteTable: () => ReturnType;
    };
  }
}

const spanAttributes = {
  colspan: {
    default: 1,
    parseHTML: (element: HTMLElement) => Number(element.getAttribute("colspan") || 1),
    renderHTML: (attributes: Record<string, number>) => (attributes.colspan > 1 ? { colspan: attributes.colspan } : {}),
  },
  rowspan: {
    default: 1,
    parseHTML: (element: HTMLElement) => Number(element.getAttribute("rowspan") || 1),
    renderHTML: (attributes: Record<string, number>) => (attributes.rowspan > 1 ? { rowspan: attributes.rowspan } : {}),
  },
  // prosemirror-tables 的列宽属性；文章里不保存列宽
  colwidth: { default: null, rendered: false },
};

const Table = Node.create({
  name: "table",
  tableRole: "table",
  group: "block",
  content: "tableRow+",
  isolating: true,
  parseHTML: () => [{ tag: "table" }],
  renderHTML: ({ HTMLAttributes }) => ["table", mergeAttributes(HTMLAttributes), ["tbody", 0]],
});

const TableRow = Node.create({
  name: "tableRow",
  tableRole: "row",
  content: "(tableCell | tableHeader)*",
  parseHTML: () => [{ tag: "tr" }],
  renderHTML: ({ HTMLAttributes }) => ["tr", mergeAttributes(HTMLAttributes), 0],
});

const TableCell = Node.create({
  name: "tableCell",
  tableRole: "cell",
  content: "block+",
  isolating: true,
  addAttributes: () => spanAttributes,
  parseHTML: () => [{ tag: "td" }],
  renderHTML: ({ HTMLAttributes }) => ["td", mergeAttributes(HTMLAttributes), 0],
});

const TableHeader = Node.create({
  name: "tableHeader",
  tableRole: "header_cell",
  content: "block+",
  isolating: true,
  addAttributes: () => spanAttributes,
  parseHTML: () => [{ tag: "th" }],
  renderHTML: ({ HTMLAttributes }) => ["th", mergeAttributes(HTMLAttributes), 0],
});

export const ArticleTable = Extension.create({
  name: "articleTable",

  addExtensions: () => [Table, TableRow, TableCell, TableHeader],

  // 把每个节点配置里的 tableRole 写进 ProseMirror schema
  extendNodeSchema: (extension) => ({ tableRole: extension.config.tableRole }),

  addProseMirrorPlugins: () => [tableEditing()],

  addKeyboardShortcuts() {
    return {
      Tab: () => isInTable(this.editor.state) && goToNextCell(1)(this.editor.state, this.editor.view.dispatch),
      "Shift-Tab": () => isInTable(this.editor.state) && goToNextCell(-1)(this.editor.state, this.editor.view.dispatch),
    };
  },

  addCommands() {
    return {
      insertTable:
        ({ rows = 3, cols = 3 } = {}) =>
        ({ tr, dispatch, editor }) => {
          const table = editor.schema.nodeFromJSON({
            type: "table",
            content: Array.from({ length: rows }, (_, row) => ({
              type: "tableRow",
              content: Array.from({ length: cols }, () => ({
                type: row === 0 ? "tableHeader" : "tableCell",
                content: [{ type: "paragraph" }],
              })),
            })),
          });
          if (dispatch) {
            // 插入后把光标放进第一个单元格，直接就能输入表头
            const offset = tr.selection.from + 1;
            tr.replaceSelectionWith(table).scrollIntoView();
            tr.setSelection(TextSelection.near(tr.doc.resolve(offset)));
          }
          return true;
        },
      addRowAfter: () => ({ state, dispatch }) => addRowAfter(state, dispatch),
      addColumnAfter: () => ({ state, dispatch }) => addColumnAfter(state, dispatch),
      deleteRow: () => ({ state, dispatch }) => deleteRow(state, dispatch),
      deleteColumn: () => ({ state, dispatch }) => deleteColumn(state, dispatch),
      deleteTable: () => ({ state, dispatch }) => deleteTable(state, dispatch),
    };
  },
});
