"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 演示模式下放在后台布局里：在浏览器里先拦下所有写操作表单的提交，提示「演示站只能看」。
 * 真正的拦截在服务端（lib/admin-auth.ts 的 requireAuth / requireSession），这里只是让访客看到清楚的说明，
 * 而不是一个报错页面。放行的表单：筛选 / 搜索（role="search"，只是 GET 跳转）和标了 data-demo-allow 的（退出登录）。
 */
export default function DemoGuard({ message }: { message: string }) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const onSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.getAttribute("role") === "search" || form.closest("[data-demo-allow]")) return;
      // window 捕获阶段最先执行：阻止提交，事件也到不了 React 的处理函数
      event.preventDefault();
      event.stopPropagation();
      setVisible(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setVisible(false), 4000);
    };
    window.addEventListener("submit", onSubmit, true);
    return () => {
      window.removeEventListener("submit", onSubmit, true);
      clearTimeout(timer.current);
    };
  }, []);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[200] flex justify-center px-4">
      {visible && (
        <p className="max-w-md rounded-2xl bg-btn px-5 py-3 text-center text-sm font-medium text-white shadow-lifted">{message}</p>
      )}
    </div>
  );
}
