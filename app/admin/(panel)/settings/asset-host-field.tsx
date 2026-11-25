"use client";

import { useRef, useState, useTransition } from "react";
import { testAssetHost, type AssetHostTestResult } from "@/lib/actions/settings";

/** 站点设置「图片加速」：地址随设置表单一起保存；「测试」通过这个地址取一张本站图片看能不能用。 */
export default function AssetHostField({ initial }: { initial: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<AssetHostTestResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <label htmlFor="asset-host" className="mb-1.5 block text-sm font-medium text-ink-2">
        图片加速地址
        <span className="ml-2 text-xs font-normal text-ink-3">留空不加速</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          id="asset-host"
          name="assetHost"
          defaultValue={initial}
          placeholder="https://img.example.com"
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => setResult(await testAssetHost(input.current?.value ?? "")))}
          className="h-10 rounded-xl border border-line px-4 text-sm text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-50"
        >
          {pending ? "测试中…" : "测试"}
        </button>
      </div>
      {result && (
        <p role="status" className={`mt-2 text-sm ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
