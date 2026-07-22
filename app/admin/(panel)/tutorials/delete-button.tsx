"use client";

export default function DeleteButton({
  id,
  action,
}: {
  id: number;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("确定删除这篇教程吗？此操作不可恢复。")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded-lg px-2.5 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-50"
      >
        删除
      </button>
    </form>
  );
}
