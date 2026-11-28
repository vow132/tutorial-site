"use client";

import { restoreRevision } from "@/lib/actions/tutorials";

export default function RestoreButton({ revisionId, label, confirmText }: { revisionId: number; label: string; confirmText: string }) {
  return (
    <form
      action={restoreRevision}
      onSubmit={(event) => {
        if (!confirm(confirmText)) event.preventDefault();
      }}
    >
      <input type="hidden" name="revisionId" value={revisionId} />
      <button type="submit" className="h-9 rounded-lg bg-btn px-4 text-xs font-semibold text-white">
        {label}
      </button>
    </form>
  );
}
