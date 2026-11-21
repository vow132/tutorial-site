"use client";

export default function DeleteMessageButton({ id, action }: { id: number; action: (formData: FormData) => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm("删除这条留言吗？")) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="rounded-lg px-2.5 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-500/10">
        删除
      </button>
    </form>
  );
}
