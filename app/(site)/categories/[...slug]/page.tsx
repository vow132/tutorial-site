import type { Metadata } from "next";
import IntentLink from "@/components/intent-link";
import { notFound, redirect } from "next/navigation";
import { getCategoriesWithCounts, getPublishedTutorialPage } from "@/lib/public-data";
import {
  buildCategoryTree,
  categoryLinkTarget,
  flattenCategoryTree,
  getCategoryHref,
} from "@/lib/categories";
import TutorialCard from "@/components/tutorial-card";
import Pagination from "@/components/pagination";
import Reveal from "@/components/reveal";
import { decodeSegment } from "@/lib/url";
import { getSettings } from "@/lib/settings";
import { breadcrumbJsonLd, pageMetadata, pageSuffix, withPage } from "@/lib/seo";
import JsonLd from "@/components/json-ld";

const PAGE_SIZE = 9;

/** 取路径最后一段作为分类 slug：兼容用户填写的 /categories/父/子 形式。 */
function resolveSlug(segments: string[]): string {
  const last = segments[segments.length - 1] ?? "";
  // 畸形编码返回空串，后续查不到分类即 404。
  return decodeSegment(last) ?? "";
}

const categoryPath = (slug: string) => `/categories/${encodeURIComponent(slug)}`;

/** 分类名本身以“教程”结尾时不再重复（避免“前端教程教程”）。 */
function categoryTitle(name: string) {
  return /教程$/.test(name) ? name : `${name}教程`;
}

type CategoryRow = Awaited<ReturnType<typeof getCategoriesWithCounts>>[number];

/** 从根到父的分类链，用于面包屑。 */
function ancestorsOf(category: CategoryRow, all: CategoryRow[]) {
  const byId = new Map(all.map((item) => [item.id, item]));
  const chain: CategoryRow[] = [];
  const seen = new Set([category.id]);
  let parentId = category.parentId;
  while (parentId && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) break;
    seen.add(parent.id);
    chain.unshift(parent);
    parentId = parent.parentId;
  }
  return chain;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const { slug: segments } = await params;
  const slug = resolveSlug(segments);
  const category = (await getCategoriesWithCounts()).find((item) => item.slug === slug);
  // metadata 阶段就触发 404，保证流式传输开始前拿到真实 404 状态码。
  if (!category) notFound();

  const { page: pageStr } = await searchParams;
  // 与页面相同的页码收敛规则（结果有缓存）：?page=999 的规范地址指向最后一页。
  const [{ page, total }, settings] = await Promise.all([
    getPublishedTutorialPage({
      categoryId: category.id,
      page: Number(pageStr) || 1,
      pageSize: PAGE_SIZE,
    }),
    getSettings(),
  ]);
  const name = categoryTitle(category.name);
  const description =
    category.description?.trim() ||
    `${settings.siteName}「${category.name}」分类下的图文教程，共 ${total} 篇，持续更新。`;

  return pageMetadata({
    title: `${name}${pageSuffix(page)}`,
    description: page > 1 ? `${description}（第 ${page} 页）` : description,
    path: withPage(categoryPath(category.slug), page),
  });
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug: segments } = await params;
  const slug = resolveSlug(segments);
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, Number(pageStr) || 1);

  // 用户可能把链接填成 /categories/父/子；统一收敛到规范的单段地址。
  if (segments.length > 1) {
    const query = pageStr ? `?page=${encodeURIComponent(pageStr)}` : "";
    redirect(`/categories/${encodeURIComponent(slug)}${query}`);
  }

  const allCategories = await getCategoriesWithCounts();
  const category = allCategories.find((item) => item.slug === slug);
  if (!category) notFound();

  const tree = buildCategoryTree(allCategories);
  const flattened = flattenCategoryTree(tree);
  const categoryNode = flattened.find(({ node }) => node.id === category.id)?.node;
  if (!categoryNode) notFound();

  const ancestors = ancestorsOf(category, allCategories);

  // 教程只在其所属分类展示，父分类不再聚合子分类下的教程。
  // 页码收敛到合法区间，避免 ?page=999 渲染出误导性的空状态；结果有缓存。
  const {
    total,
    totalPages,
    page: safePage,
    tutorials,
  } = await getPublishedTutorialPage({
    categoryId: category.id,
    page,
    pageSize: PAGE_SIZE,
  });

  // 子分类卡片只显示该分类自身的教程数，不再累加其后代。
  const countTutorials = (node: typeof categoryNode): number =>
    node._count.tutorials;

  const jsonLd = breadcrumbJsonLd([
    { name: "首页", path: "/" },
    ...ancestors.map((ancestor) => ({ name: ancestor.name, path: categoryPath(ancestor.slug) })),
    { name: category.name },
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-14">
      <JsonLd data={jsonLd} />
      <Reveal fade={false}>
        <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-ink-3">
          <IntentLink href="/" className="transition-colors hover:text-accent">
            首页
          </IntentLink>
          {ancestors.map((ancestor) => (
            <span key={ancestor.id} className="contents">
              <span>/</span>
              <IntentLink
                href={getCategoryHref(ancestor)}
                {...categoryLinkTarget(getCategoryHref(ancestor))}
                className="transition-colors hover:text-accent"
              >
                {ancestor.name}
              </IntentLink>
            </span>
          ))}
          <span>/</span>
          <span className="text-ink-2">{category.name}</span>
        </nav>

        <div className="flex items-center gap-4">
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl text-3xl"
            style={{ backgroundColor: `${category.color}14` }}
          >
            {category.icon ?? "📚"}
          </span>
          <div className="min-w-0">
            <h1 className="text-3xl font-extrabold text-ink md:text-4xl">
              {category.name}
            </h1>
            <p className="mt-1.5 text-sm text-ink-2">
              {category.description ?? "暂无描述"} · 共 {total} 篇
            </p>
          </div>
        </div>
      </Reveal>

      {categoryNode.children.length > 0 && (
        <section className="mt-10">
          <Reveal>
            <h2 className="text-lg font-bold text-ink">子分类</h2>
          </Reveal>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categoryNode.children.map((child, index) => (
              <Reveal key={child.id} delay={Math.min(index, 5) * 0.04}>
                <IntentLink
                  href={getCategoryHref(child)}
                  {...categoryLinkTarget(getCategoryHref(child))}
                  className="flex h-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-accent"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                    style={{ backgroundColor: `${child.color}14` }}
                  >
                    {child.icon ?? "📚"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {child.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-3">
                      {countTutorials(child)} 篇教程
                      {child.children.length > 0
                        ? ` · ${child.children.length} 个子分类`
                        : ""}
                    </span>
                  </span>
                  <span className="text-ink-3">→</span>
                </IntentLink>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {tutorials.length === 0 ? (
        <div className="mt-12 rounded-3xl border border-dashed border-line bg-surface/60 py-20 text-center text-ink-3">
          该分类下暂无教程
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tutorials.map((tutorial, index) => (
            <Reveal key={tutorial.id} delay={Math.min(index, 5) * 0.05}>
              <TutorialCard
                title={tutorial.title}
                slug={tutorial.slug}
                excerpt={tutorial.excerpt}
                categoryName={tutorial.category.name}
                categoryColor={tutorial.category.color}
                views={tutorial.views}
                createdAt={tutorial.createdAt}
              />
            </Reveal>
          ))}
        </div>
      )}

      <Pagination
        page={safePage}
        totalPages={totalPages}
        basePath={`/categories/${slug}`}
      />
    </div>
  );
}
