import { Node, mergeAttributes } from "@tiptap/react";
import { CALLOUT_TYPES, type CalloutType } from "@/lib/callouts";

const isCalloutType = (value: unknown): value is CalloutType =>
  CALLOUT_TYPES.some((item) => item.value === value);

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      /** 把所选段落包进提示框；已是同类提示框时取消，不同类时切换类型。 */
      toggleCallout: (type: CalloutType) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

/**
 * 提示框：<div data-callout="tip|warning|danger">，里面可以放段落、列表、代码块等。
 * 标签文字和图标由 CSS 生成（globals.css），存库的 HTML 保持干净，白名单只需放行一个属性。
 */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      type: {
        default: "tip" as CalloutType,
        parseHTML: (element) => {
          const value = element.getAttribute("data-callout");
          return isCalloutType(value) ? value : "tip";
        },
        renderHTML: (attributes) => ({ "data-callout": attributes.type }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      toggleCallout:
        (type) =>
        ({ commands, editor }) => {
          if (editor.isActive(this.name, { type })) return commands.lift(this.name);
          if (editor.isActive(this.name)) return commands.updateAttributes(this.name, { type });
          return commands.wrapIn(this.name, { type });
        },
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});
