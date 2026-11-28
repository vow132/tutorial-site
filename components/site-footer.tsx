import IntentLink from "./intent-link";
import SiteLogo from "./site-logo";
import { getSettings } from "@/lib/settings";
import { getPublicCategories } from "@/lib/public-data";
import { getSubscriptionEnabled } from "@/lib/mail";
import { getSiteI18n } from "@/lib/i18n/server";
import {
  buildCategoryTree,
  categoryLinkTarget,
  flattenCategoryTree,
  getCategoryHref,
} from "@/lib/categories";

export default async function SiteFooter() {
  const [categories, settings, subscribeEnabled, { m }] = await Promise.all([
    getPublicCategories(),
    getSettings(),
    getSubscriptionEnabled(),
    getSiteI18n(),
  ]);
  const categoryLinks = flattenCategoryTree(buildCategoryTree(categories)).map(
    ({ node, depth }) => ({
      label: `${depth ? `${"— ".repeat(depth)}` : ""}${node.name}`,
      href: getCategoryHref(node),
    }),
  );

  return (
    <footer className="print-hide mt-24 border-t border-line bg-surface/60">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <SiteLogo settings={settings} className="h-7 w-7 text-sm" />
              <span className="font-bold">{settings.siteName}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">
              {settings.footerTagline}
            </p>
            {subscribeEnabled && (
              <IntentLink href="/subscribe" className="mt-3 inline-block text-sm font-medium text-accent-ink hover:underline">
                {m.site.nav.subscribeLink}
              </IntentLink>
            )}
          </div>

          <div className="grid grid-cols-2 gap-12 sm:grid-cols-3">
            {settings.footerColumns.map((col, i) => {
              const links = col.autoCategories
                ? categoryLinks
                : col.links;
              return (
                <div key={i}>
                  <h2 className="text-sm font-semibold text-ink">{col.title}</h2>
                  <ul className="mt-3 space-y-2">
                    {links.map((link, j) => {
                      return (
                        <li key={j}>
                          <IntentLink
                            href={link.href}
                            {...categoryLinkTarget(link.href)}
                            className="text-sm text-ink-2 transition-colors hover:text-accent"
                          >
                            {link.label}
                          </IntentLink>
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
          {settings.footerStatus && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-live" />
              {settings.footerStatus}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}
