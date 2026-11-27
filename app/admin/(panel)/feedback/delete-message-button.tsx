"use client";

export default function DeleteMessageButton({
  id,
  action,
  label,
  confirmText,
}: {
  id: number;
  action: (formData: FormData) => Promise<void>;
  label: string;
  confirmText: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm(confirmText)) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="rounded-lg px-2.5 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-500/10">
        {label}
      </button>
    </form>
  );
}
