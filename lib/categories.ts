export const MAX_CATEGORY_LEVELS = 3;

export type CategoryHierarchyItem = {
  id: number;
  parentId: number | null;
  order: number;
};

export type CategoryTreeNode<T extends CategoryHierarchyItem> = T & {
  children: CategoryTreeNode<T>[];
};

export function buildCategoryTree<T extends CategoryHierarchyItem>(
  categories: readonly T[],
): CategoryTreeNode<T>[] {
  const nodes = new Map<number, CategoryTreeNode<T>>();

  for (const category of categories) {
    nodes.set(category.id, { ...category, children: [] });
  }

  const roots: CategoryTreeNode<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent && parent.id !== node.id) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (items: CategoryTreeNode<T>[]) => {
    items.sort((a, b) => a.order - b.order || a.id - b.id);
    for (const item of items) sortNodes(item.children);
  };
  sortNodes(roots);

  return roots;
}

export function flattenCategoryTree<T extends CategoryHierarchyItem>(
  roots: readonly CategoryTreeNode<T>[],
  depth = 0,
): Array<{ node: CategoryTreeNode<T>; depth: number }> {
  const result: Array<{ node: CategoryTreeNode<T>; depth: number }> = [];

  for (const node of roots) {
    result.push({ node, depth });
    result.push(...flattenCategoryTree(node.children, depth + 1));
  }

  return result;
}

export function getCategoryDescendantIds<T extends CategoryHierarchyItem>(
  category: CategoryTreeNode<T>,
): number[] {
  return category.children.flatMap((child) => [
    child.id,
    ...getCategoryDescendantIds(child),
  ]);
}

export function getCategoryHref(category: {
  slug: string;
  linkUrl?: string | null;
}) {
  return category.linkUrl?.trim() || `/categories/${category.slug}`;
}

export function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

export function categoryLinkTarget(href: string) {
  return isExternalHref(href)
    ? { target: "_blank" as const, rel: "noopener noreferrer" }
    : {};
}
