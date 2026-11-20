"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { DailyViews } from "@/lib/view-stats";

const HEIGHT = 200;
const PAD = { top: 18, right: 14, bottom: 26, left: 44 };
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/** 1/2/5×10ⁿ 的刻度间距，让纵轴有 3–5 条网格线。 */
function tickStep(max: number) {
  const raw = Math.max(max, 4) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}

function compact(value: number) {
  if (value < 10_000) return value.toLocaleString("zh-CN");
  const wan = value / 10_000;
  return `${Number.isInteger(wan) ? wan : wan.toFixed(1)}万`;
}

function shortDay(day: string) {
  const [, month, date] = day.split("-");
  return `${Number(month)}/${Number(date)}`;
}

function longDay(day: string) {
  const [, month, date] = day.split("-");
  const weekday = WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];
  return `${Number(month)}月${Number(date)}日 周${weekday}`;
}

/**
 * 最近 30 天每天的阅读量：单条折线 + 浅色面积，悬停或用方向键查看某一天，
 * 下方「查看每日数据」是同样数据的表格（不用鼠标、读屏软件也能拿到全部数值）。
 */
export default function ViewTrend({ data }: { data: DailyViews[] }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const max = Math.max(...data.map((point) => point.views));
  const step = tickStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step);
  const innerWidth = width - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const last = data.length - 1;
  const x = (index: number) => PAD.left + (last === 0 ? innerWidth / 2 : (index * innerWidth) / last);
  const y = (value: number) => PAD.top + innerHeight * (1 - value / top);
  const baseline = y(0);

  const line = data.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.views).toFixed(1)}`).join("");
  const area = `${line}L${x(last).toFixed(1)},${baseline}L${x(0).toFixed(1)},${baseline}Z`;
  // 横轴每隔 7 天标一次日期，从今天往前数，保证最右边是今天
  const labelled = data.map((_, index) => index).filter((index) => (last - index) % 7 === 0);

  const pick = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    setActive(Math.min(last, Math.max(0, Math.round(ratio * last))));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };
    if (!(event.key in moves)) return;
    event.preventDefault();
    setActive((current) => Math.min(last, Math.max(0, (current ?? last) + moves[event.key])));
  };

  const point = active === null ? null : data[active];
  const endLabelAbove = y(data[last].views) - PAD.top > 18;

  return (
    <div>
      <div
        ref={wrapper}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-2xl"
        tabIndex={0}
        role="group"
        aria-label={`最近 ${data.length} 天每日阅读量折线图，左右方向键逐日查看`}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((current) => current ?? last)}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={HEIGHT} className="block max-w-full" aria-hidden="true">
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--color-line)" strokeWidth="1" />
              <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[11px] tabular-nums">
                {compact(tick)}
              </text>
            </g>
          ))}
          {labelled.map((index) => (
            <text
              key={index}
              x={x(index)}
              y={HEIGHT - 8}
              textAnchor={index === last ? "end" : index === 0 ? "start" : "middle"}
              className="fill-ink-3 text-[11px] tabular-nums"
            >
              {index === last ? "今天" : shortDay(data[index].day)}
            </text>
          ))}
          <path d={area} fill="var(--chart-trend)" fillOpacity="0.1" />
          <path d={line} fill="none" stroke="var(--chart-trend)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {point === null && (
            <>
              <circle cx={x(last)} cy={y(data[last].views)} r="4" fill="var(--chart-trend)" stroke="var(--surface)" strokeWidth="2" />
              <text
                x={x(last)}
                y={y(data[last].views)}
                dy={endLabelAbove ? -12 : 20}
                textAnchor="end"
                className="fill-ink text-xs font-semibold tabular-nums"
              >
                {data[last].views.toLocaleString("zh-CN")}
              </text>
            </>
          )}
          {point !== null && active !== null && (
            <>
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={baseline} stroke="var(--color-ink-3)" strokeWidth="1" />
              <circle cx={x(active)} cy={y(point.views)} r="4" fill="var(--chart-trend)" stroke="var(--surface)" strokeWidth="2" />
            </>
          )}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
        {point !== null && active !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-capsule"
            style={{ left: Math.min(width - 70, Math.max(70, x(active))) }}
          >
            <p className="text-sm font-bold text-ink tabular-nums">{point.views.toLocaleString("zh-CN")} 次阅读</p>
            <p className="mt-0.5 text-ink-3">{longDay(point.day)}</p>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {point ? `${longDay(point.day)}，${point.views} 次阅读` : ""}
        </p>
      </div>
      <details className="mt-2 text-xs text-ink-3">
        <summary className="cursor-pointer select-none hover:text-ink-2">查看每日数据</summary>
        <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-line">
          <table className="w-full text-left tabular-nums">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-ink-2">
                <th scope="col" className="px-3 py-1.5 font-medium">日期</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">阅读量</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...data].reverse().map((row) => (
                <tr key={row.day}>
                  <td className="px-3 py-1.5">{longDay(row.day)}</td>
                  <td className="px-3 py-1.5 text-right text-ink">{row.views.toLocaleString("zh-CN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
