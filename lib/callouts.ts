/** 正文提示框的类型（编辑器、HTML 白名单、样式共用）。标签文字在 globals.css 里。 */
export const CALLOUT_TYPES = [
  { value: "tip", label: "提示", icon: "💡" },
  { value: "warning", label: "注意", icon: "⚠️" },
  { value: "danger", label: "警告", icon: "⛔" },
] as const;

export type CalloutType = (typeof CALLOUT_TYPES)[number]["value"];
