import { startTransition, type FormEvent } from "react";

/**
 * React 19 会在 `<form action={…}>` 的 action 结束后重置表单：不受控输入回到
 * defaultValue。服务端校验失败时，用户已填写但没保存的内容就全没了。
 * 改用 onSubmit 手动提交可以避免重置——适合成功后跳转、或成功后就该保留当前值的表单。
 */
export function submitKeepingValues(action: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => action(formData));
  };
}
