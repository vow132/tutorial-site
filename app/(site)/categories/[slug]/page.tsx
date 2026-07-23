import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  buildCategoryTree,
  categoryLinkTarget,
  flattenCategoryTree,
  getCategoryDescendantIds,
  getCategoryHref,
} from "@/lib/categories";
import TutorialCard from "@/components/tutorial-card";
import Pagination from "@/components/pagination";
import Reveal from "@/components/reveal";

const PAGE_SIZE = 9;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const category = await prisma.category.findUnique({ where: { slug } });
  return { title: category ? `${category.name}教程` : "分类" };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, Number(pageStr) || 1);

  const allCategories = await prisma.category.findMany({
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      icon: true,
      color: true,
      order: true,
      linkUrl: true,
      parentId: true,
      _count: {
        select: { tutorials: { where: { published: true } } },
      },
    },
  });
  const category = allCategories.find((item) => item.slug === slug);
  if (!category) notFound();

  const tree = buildCategoryTree(allCategories);
  const flattened = flattenCategoryTree(tree);
  const categoryNode = flattened.find(({ node }) => node.id === category.id)?.node;
  if (!categoryNode) notFound();

  const categoryById = new Map(allCategories.map((item) => [item.id, item]));
  const ancestors = [];
  let parentId = category.parentId;
  while (parentId) {
    const parent = categoryById.get(parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    parentId = parent.parentId;
  }

  const categoryIds = [category.id, ...getCategoryDescendantIds(categoryNode)];
  const [total, tutorials] = await Promise.all([
    prisma.tutorial.count({
      where: { published: true, categoryId: { in: categoryIds } },
    }),
    prisma.tutorial.findMany({
      where: { published: true, categoryId: { in: categoryIds } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        views: true,
        createdAt: true,
        category: { select: { name: true, color: true } },
      },
    }),
  ]);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const countTutorials = (node: typeof categoryNode): number =>
    node._count.tutorials +
    node.children.reduce((sum, child) => sum + countTutorials(child), 0);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-14">
      <Reveal>
        <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-ink-3">
          <Link href="/" className="transition-colors hover:text-accent">
            首页
          </Link>
          {ancestors.map((ancestor) => (
            <span key={ancestor.id} className="contents">
              <span>/</span>
              <Link
                href={getCategoryHref(ancestor)}
                {...categoryLinkTarget(getCategoryHref(ancestor))}
                className="transition-colors hover:text-accent"
              >
                {ancestor.name}
              </Link>
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
                <Link
                  href={getCategoryHref(child)}
                  {...categoryLinkTarget(getCategoryHref(child))}
                  className="flex h-full items-center gap-3 rounded-2xl border border-line bg-white p-4 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-accent"
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
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {tutorials.length === 0 ? (
        <div className="mt-12 rounded-3xl border border-dashed border-line bg-white/60 py-20 text-center text-ink-3">
          该分类及子分类下暂无教程
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
        page={page}
        totalPages={totalPages}
        basePath={`/categories/${slug}`}
      />
    </div>
  );
}
