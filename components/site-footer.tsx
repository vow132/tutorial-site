import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { getPublicCategories } from "@/lib/public-data";
import {
  buildCategoryTree,
  categoryLinkTarget,
  flattenCategoryTree,
  getCategoryHref,
} from "@/lib/categories";

export default async function SiteFooter() {
  const [categories, settings] = await Promise.all([
    getPublicCategories(),
    getSettings(),
  ]);
  const categoryLinks = flattenCategoryTree(buildCategoryTree(categories)).map(
    ({ node, depth }) => ({
      label: `${depth ? `${"— ".repeat(depth)}` : ""}${node.name}`,
      href: getCategoryHref(node),
    }),
  );

  return (
    <footer className="mt-24 border-t border-line bg-white/60">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
                {settings.logoText}
              </span>
              <span className="font-bold">{settings.siteName}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">
              {settings.footerTagline}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-12 sm:grid-cols-3">
            {settings.footerColumns.map((col, i) => {
              const links = col.autoCategories
                ? categoryLinks
                : col.links;
              return (
                <div key={i}>
                  <h4 className="text-sm font-semibold text-ink">{col.title}</h4>
                  <ul className="mt-3 space-y-2">
                    {links.map((link, j) => {
                      return (
                        <li key={j}>
                          <Link
                            href={link.href}
                            {...categoryLinkTarget(link.href)}
                            className="text-sm text-ink-2 transition-colors hover:text-accent"
                          >
                            {link.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-xs text-ink-3 sm:flex-row">
          <span>
            © {new Date().getFullYear()} {settings.copyright}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            持续更新中
          </span>
        </div>
      </div>
    </footer>
  );
}
