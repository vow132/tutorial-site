import type { Messages } from "../types";

export const email: Messages["email"] = {
  confirmSubject: "「{site}」の新着通知の登録を確認してください",
  confirmText:
    "こんにちは。\n\nこのメールアドレスで「{site}」の新着チュートリアル通知が登録されました。下のリンクを開いて登録を確定してください。\n\n{url}\n\nお心当たりがない場合は、このメールを無視してください。今後メールが届くことはありません。",
  confirmHeading: "新着通知の登録を確認",
  confirmBody: "このメールアドレスで「{site}」の新着チュートリアル通知が登録されました。下のボタンを押すと登録が完了し、新しいチュートリアルが公開されるたびにお知らせします。",
  confirmButton: "登録を確定する",
  confirmFooter: "お心当たりがない場合は、このメールを無視してください。今後メールが届くことはありません。",
  newSubject: "新着チュートリアル：{title}",
  newIntro: "「{site}」に新しいチュートリアルが公開されました：",
  newReadMore: "続きを読む：{url}",
  newUnsubscribe: "配信停止はこちら：{url}",
  newLabel: "新着",
  newButton: "続きを読む",
  newFooter: "「{site}」の新着通知に登録されているため、このメールをお送りしています。{link}",
  unsubscribeLink: "配信停止",
  invalidEmail: "メールアドレスの形式が正しくありません",
  subscribeDisabled: "メール配信はまだ有効になっていません",
  tooFrequent: "操作が多すぎます。しばらくしてからお試しください",
  sendFailed: "確認メールを送信できませんでした。しばらくしてからお試しください",
  humanCheckFailed: "人間であることの確認に失敗しました。もう一度確認してから送信してください",
  unsubscribed: "配信を停止しました",
  invalidLink: "無効なリンクです",
};
