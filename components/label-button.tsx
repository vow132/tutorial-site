import type { ComponentPropsWithRef } from "react";

/**
 * 由原生 checkbox 驱动的开关按钮（移动端抽屉）：外层 label 让点击在 hydration 前也能切换 checkbox，
 * 内层 span 承担按钮语义和焦点。label 元素不允许带 ARIA role，所以 role="button" 放在 span 上；
 * label 设为 display: contents，不产生盒子，布局样式全在 span 上。
 */
export default function LabelButton({
  htmlFor,
  ...props
}: ComponentPropsWithRef<"span"> & { htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="contents">
      <span role="button" {...props} />
    </label>
  );
}
