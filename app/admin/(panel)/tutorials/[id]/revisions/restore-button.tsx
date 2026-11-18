"use client";

import { restoreRevision } from "@/lib/actions/tutorials";

export default function RestoreButton({ revisionId }: { revisionId: number }) {
  return (
    <form
      action={restoreRevision}
      onSubmit={(event) => {
        if (!confirm("恢复到这个版本吗？当前内容会先存成一个历史版本。")) event.preventDefault();
      }}
    >
      <input type="hidden" name="revisionId" value={revisionId} />
      <button type="submit" className="h-9 rounded-lg bg-btn px-4 text-xs font-semibold text-white">
        恢复此版本
      </button>
    </form>
  );
}
