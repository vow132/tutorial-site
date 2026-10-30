"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { SITE_REPOSITORY_URL, type SiteUpdateStatus } from "@/lib/site-update-types";

const ENDPOINT = "/api/admin/site-update";
type DisplayStatus = Omit<SiteUpdateStatus, "state"> & { state: SiteUpdateStatus["state"] | "checking" };
const initialStatus: DisplayStatus = {
  state: "checking", message: "正在检测仓库更新…", canUpdate: false,
  currentRevision: null, latestRevision: null, checkedAt: null,
};
const labels = {
  checking: "检测更新中", current: "已是最新版本", available: "有新版本",
  updating: "正在更新", error: "更新未完成", unavailable: "暂无法更新",
};
const colors = {
  checking: "bg-ink-3", current: "bg-live", available: "bg-yellow-400",
  updating: "bg-yellow-400 motion-safe:animate-pulse", error: "bg-red-500", unavailable: "bg-ink-3",
};

export default function GitHubUpdate() {
  const [status, setStatus] = useState<DisplayStatus>(initialStatus);
  const [expanded, setExpanded] = useState(false);
  // 部署前必须再次输入管理员密码；确认框打开时弹层保持展开。
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const descriptionId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const statusRef = useRef(status);
  const lastCheck = useRef(0);
  const inFlight = useRef(false);
  const posting = useRef(false);
  const jobId = useRef<string | null>(null);
  const restartStarted = useRef<number | null>(null);
  const alive = useRef(true);

  const acceptStatus = useCallback((next: DisplayStatus) => {
    statusRef.current = next;
    if (alive.current) setStatus(next);
  }, []);

  const check = useCallback(async () => {
    if (inFlight.current || posting.current) return;
    inFlight.current = true;
    lastCheck.current = Date.now();
    try {
      const response = await fetch(ENDPOINT, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "检测失败，请稍后重试。" );
      if (!alive.current) return;
      const next = result as SiteUpdateStatus;
      if (next.state === "updating") {
        jobId.current = next.job?.jobId ?? jobId.current;
      }
      if (jobId.current && next.job?.jobId === jobId.current && next.job.state === "success" && next.currentRevision === next.job.targetRevision) {
        // Reload after the new server proves it is serving the requested build.
        window.location.reload();
        return;
      }
      restartStarted.current = null;
      acceptStatus(next);
    } catch (error) {
      if (!alive.current) return;
      if (statusRef.current.state === "updating") {
        restartStarted.current ??= Date.now();
        if (Date.now() - restartStarted.current < 10 * 60_000) {
          acceptStatus({ ...statusRef.current, message: "服务正在切换版本，恢复连接后会自动刷新…" });
          return;
        }
      }
      acceptStatus({ ...statusRef.current, state: "error", canUpdate: false,
        message: error instanceof Error ? error.message : "无法连接服务器，请稍后重试。" });
    } finally { inFlight.current = false; }
  }, [acceptStatus]);

  useEffect(() => {
    alive.current = true;
    void check();
    const timer = window.setInterval(() => {
      if (statusRef.current.state === "updating" ||
        (document.visibilityState === "visible" && Date.now() - lastCheck.current >= 5 * 60_000)) void check();
    }, 3_000);
    const onFocus = () => { if (Date.now() - lastCheck.current >= 60_000) void check(); };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) {
        setExpanded(false);
        setConfirming(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setExpanded(false); setConfirming(false); }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [check]);

  const requestUpdate = () => {
    setExpanded(true);
    if (posting.current || !statusRef.current.canUpdate) return;
    setConfirming(true);
    setConfirmError(null);
  };

  const update = async (event: FormEvent) => {
    event.preventDefault();
    if (posting.current || !statusRef.current.canUpdate || !password) return;
    posting.current = true;
    const previous = statusRef.current;
    acceptStatus({ ...previous, state: "updating", canUpdate: false, message: "正在提交更新任务…" });
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(45_000),
      });
      const result = await response.json();
      if (response.status === 403) {
        // 密码错误或被限流：恢复原状态，留在确认框里重试。
        acceptStatus(previous);
        setConfirmError(result.error || "密码验证失败。");
        return;
      }
      setConfirming(false);
      setPassword("");
      if (!response.ok) throw new Error(result.error || "无法启动更新，请稍后重试。" );
      jobId.current = result.job?.jobId ?? null;
      acceptStatus(result as SiteUpdateStatus);
    } catch (error) {
      setConfirming(false);
      acceptStatus({ ...statusRef.current, state: "error", canUpdate: false,
        message: error instanceof Error ? error.message : "无法启动更新，请稍后重试。" });
    } finally {
      posting.current = false;
      // A lost POST response can still have launched the detached job.
      void check();
    }
  };

  const busy = status.state === "updating" || status.state === "checking";
  const open = expanded || confirming;
  const actionLabel = status.canUpdate ? "更新网站到仓库最新版本" : `查看更新状态：${labels[status.state]}`;

  return (
    <div
      ref={wrapper} className="relative h-10 w-10 shrink-0"
      onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false); }}
    >
      <a
        href={SITE_REPOSITORY_URL} target="_blank" rel="noopener noreferrer"
        aria-label="打开 GitHub 仓库 vow132/tutorial-site（新窗口）"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink-2 transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 .75a11.25 11.25 0 0 0-3.558 21.923c.563.105.77-.244.77-.542 0-.267-.01-.975-.016-1.912-3.13.68-3.79-1.508-3.79-1.508-.512-1.301-1.25-1.647-1.25-1.647-1.023-.7.078-.686.078-.686 1.13.08 1.725 1.16 1.725 1.16 1.005 1.724 2.637 1.226 3.28.937.102-.728.393-1.226.715-1.507-2.498-.284-5.124-1.249-5.124-5.56 0-1.229.44-2.234 1.16-3.021-.117-.284-.503-1.43.11-2.98 0 0 .945-.303 3.094 1.154A10.8 10.8 0 0 1 12 6.18c.956.005 1.919.129 2.817.379 2.148-1.457 3.091-1.154 3.091-1.154.615 1.55.229 2.696.113 2.98.722.787 1.158 1.792 1.158 3.021 0 4.323-2.63 5.274-5.135 5.553.404.35.765 1.04.765 2.096 0 1.513-.014 2.734-.014 3.106 0 .301.203.652.774.54A11.252 11.252 0 0 0 12 .75Z" />
        </svg>
      </a>
      <button
        type="button" onClick={requestUpdate} aria-label={actionLabel}
        aria-describedby={descriptionId} aria-expanded={open} aria-busy={busy}
        aria-disabled={busy} title={`${labels[status.state]}：${status.message}`}
        className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        <span className={`h-3 w-3 rounded-full ring-2 ring-surface ${colors[status.state]}`} aria-hidden="true" />
      </button>
      <div
        id={descriptionId}
        className={`absolute right-0 top-full z-30 w-[min(20rem,calc(100vw-2rem))] pt-3 ${open ? "visible" : "invisible"}`}
      >
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-capsule">
          <p className="text-sm font-semibold text-ink">{labels[status.state]}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-2" role="status" aria-live="polite">{status.message}</p>
          {status.currentRevision && (
            <p className="mt-2 text-xs text-ink-2">当前 {status.currentRevision.slice(0, 7)}{status.latestRevision && status.latestRevision !== status.currentRevision ? ` · 仓库 ${status.latestRevision.slice(0, 7)}` : ""}</p>
          )}
          {confirming && status.canUpdate && (
            <form onSubmit={(event) => void update(event)} className="mt-3 space-y-2">
              <label htmlFor={`${descriptionId}-password`} className="block text-xs font-medium text-ink-2">
                输入管理员密码确认部署
              </label>
              <input
                id={`${descriptionId}-password`} type="password" required autoFocus
                autoComplete="current-password" value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-9 w-full rounded-lg border border-line bg-paper px-3 text-sm outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-accent/60"
              />
              {confirmError && <p className="text-xs text-red-500 dark:text-red-400">{confirmError}</p>}
              <div className="flex gap-2">
                <button type="submit" className="rounded-lg bg-btn px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">确认更新</button>
                <button type="button" onClick={() => setConfirming(false)} className="rounded-lg px-3 py-1.5 text-xs text-ink-2 hover:bg-paper">取消</button>
              </div>
            </form>
          )}
          {status.state === "error" && (
            <button type="button" onClick={() => void check()} className="mt-3 rounded-lg px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">重新检测</button>
          )}
          {open && !confirming && (
            <button type="button" onClick={() => setExpanded(false)} className="mt-3 ml-2 rounded-lg px-2 py-1 text-xs text-ink-2 hover:bg-paper focus-visible:outline-2 focus-visible:outline-accent">收起</button>
          )}
        </div>
      </div>
    </div>
  );
}
