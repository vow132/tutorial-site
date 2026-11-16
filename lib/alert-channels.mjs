/**
 * 告警渠道列表：浏览器端（后台设置表单）也要用，所以单独放在不依赖 Node 模块的文件里。
 * @typedef {"off" | "dingtalk" | "feishu" | "wecom" | "telegram" | "webhook"} AlertChannel
 */

/** @type {Array<{ value: AlertChannel, label: string }>} */
export const ALERT_CHANNELS = [
  { value: "off", label: "关闭" },
  { value: "dingtalk", label: "钉钉群机器人" },
  { value: "feishu", label: "飞书群机器人" },
  { value: "wecom", label: "企业微信群机器人" },
  { value: "telegram", label: "Telegram Bot" },
  { value: "webhook", label: "通用 Webhook（JSON）" },
];
