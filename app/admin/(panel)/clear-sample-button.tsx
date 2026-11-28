"use client";

import { clearSampleData } from "@/lib/actions/sample-data";

export default function ClearSampleButton({ label, confirmText }: { label: string; confirmText: string }) {
  return (
    <form
      action={clearSampleData}
      onSubmit={(event) => {
        if (!confirm(confirmText)) event.preventDefault();
      }}
      className="mt-2"
    >
      <button type="submit" className="h-8 rounded-full border border-line px-3 text-xs text-ink-2 transition-colors hover:bg-paper hover:text-ink">
        {label}
      </button>
    </form>
  );
}
