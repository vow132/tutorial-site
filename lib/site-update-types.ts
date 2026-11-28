export const SITE_REPOSITORY = "vow132/tutorial-site";
export const SITE_REPOSITORY_URL = `https://github.com/${SITE_REPOSITORY}`;

export type UpdateJob = {
  jobId: string;
  state: "running" | "success" | "error";
  phase: string;
  message: string;
  targetRevision: string;
  startedAt: string;
  updatedAt: string;
  pid?: number;
};

/** 状态说明的键（文字按后台语言：m.admin.update.messages），message 是中文原文（日志、旧客户端用） */
export type UpdateMessageCode =
  | "checking"
  | "docker"
  | "notProduction"
  | "disabled"
  | "readStatus"
  | "githubLimited"
  | "githubNotFound"
  | "githubDown"
  | "unknownRevision"
  | "invalidGithub"
  | "available"
  | "availableHint"
  | "current"
  | "diverged"
  | "checkFailed"
  | "completed"
  | "interrupted"
  | "busy"
  | "lockFailed"
  | "wrongOrigin"
  | "preparing"
  | "launchFailed"
  | "checkFailed";

export type SiteUpdateStatus = {
  state: "current" | "available" | "updating" | "error" | "unavailable";
  message: string;
  code?: UpdateMessageCode;
  /** 文字里的变量；hint 是另一个 code（「有新版本」后面跟的说明） */
  vars?: { rev?: string; hint?: UpdateMessageCode };
  canUpdate: boolean;
  currentRevision: string | null;
  latestRevision: string | null;
  checkedAt: string | null;
  job?: UpdateJob;
};
