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

export type SiteUpdateStatus = {
  state: "current" | "available" | "updating" | "error" | "unavailable";
  message: string;
  canUpdate: boolean;
  currentRevision: string | null;
  latestRevision: string | null;
  checkedAt: string | null;
  job?: UpdateJob;
};
