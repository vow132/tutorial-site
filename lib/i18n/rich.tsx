import { Fragment, type ReactNode } from "react";

/**
 * 文案里夹着链接、加粗等元素时用：把 {name} 换成对应的 React 节点（字符串、数字也行）。
 * 例：rich("确认链接 7 天内有效。可以{link}。", { link: <a href="/subscribe">重新订阅</a> })
 * 服务端、浏览器端都能用。
 */
export function rich(template: string, parts: Record<string, ReactNode>): ReactNode {
  const pieces = template.split(/(\{\w+\})/g);
  return pieces.map((piece, index) => {
    const match = /^\{(\w+)\}$/.exec(piece);
    const node = match && match[1] in parts ? parts[match[1]] : piece;
    return <Fragment key={index}>{node}</Fragment>;
  });
}
