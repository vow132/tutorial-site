/**
 * 小幽灵吉祥物：常驻漂浮 + 眨眼。
 *
 * The decorative element stays server-rendered so a failed client chunk can
 * never hide the page and no global mousemove loop runs on every route.
 */
export default function Mascot({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none select-none ${className}`} aria-hidden>
      <div className="mascot-float">
        <svg width="34" height="38" viewBox="0 0 34 38" fill="none">
          <path
            d="M17 2C9.82 2 4 7.82 4 15v17.2c0 1.9 2.24 2.87 3.54 1.5l1.72-1.8a2.2 2.2 0 0 1 3.15.05l1.94 2a2.2 2.2 0 0 0 3.12.02l2.06-2.04a2.2 2.2 0 0 1 3.13-.02l1.8 1.79c1.32 1.3 3.54.35 3.54-1.57V15C30 7.82 24.18 2 17 2Z"
            fill="#fff"
            stroke="#dfe3ea"
            strokeWidth="1.6"
          />
          <g className="mascot-eyes">
            <circle cx="12.4" cy="14.6" r="1.9" fill="#17181c" />
            <circle cx="21.6" cy="14.6" r="1.9" fill="#17181c" />
          </g>
          <circle cx="9.6" cy="19.4" r="1.6" fill="#ffd9e0" opacity="0.9" />
          <circle cx="24.4" cy="19.4" r="1.6" fill="#ffd9e0" opacity="0.9" />
        </svg>
      </div>
    </div>
  );
}