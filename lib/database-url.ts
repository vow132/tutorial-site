import path from "node:path";

/**
 * Keep the runtime adapter on the same SQLite file used by Prisma CLI.
 * Relative URLs are resolved from the project root in this project.
 */
export function getDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL?.trim() || "file:./prisma/dev.db";

  if (!configured.startsWith("file:")) return configured;

  const value = configured.slice("file:".length);
  const queryIndex = value.indexOf("?");
  const fileName = queryIndex === -1 ? value : value.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : value.slice(queryIndex);

  if (fileName === ":memory:") return configured;

  const absolutePath = path.isAbsolute(fileName)
    ? fileName
    : path.resolve(process.cwd(), fileName);

  return `file:${absolutePath}${query}`;
}
