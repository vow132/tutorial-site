import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { getDatabaseUrl } from "@/lib/database-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * better-sqlite3 是同步驱动：每次写入的磁盘同步都会卡住整个 Node 进程。
 * - WAL：写入只追加到 -wal 日志，读写互不阻塞，备份时站点照常读写；
 *   该模式写在数据库文件里，设置一次后永久生效（不支持 NFS 等网络文件系统）。
 * - synchronous=NORMAL：WAL 下仍保证崩溃后数据库一致，只在整机断电时可能
 *   丢失最后几笔提交；比默认的 FULL 少一次 fsync。它只对当前连接生效，所以每次启动都设。
 */
async function configureSqlite(client: PrismaClient) {
  // 只在生产环境用 WAL：Prisma 迁移引擎会设 locking_mode=EXCLUSIVE，WAL 下只要还有
  // 别的进程连着数据库就会报 database is locked。开发时 `prisma migrate dev` 常在
  // `npm run dev` 运行期间执行，所以开发环境切回默认的回滚日志模式。
  // 生产部署的迁移都在停站后执行（deploy.sh、一键更新）。
  const production = process.env.NODE_ENV === "production";
  try {
    await client.$queryRawUnsafe(`PRAGMA journal_mode = ${production ? "WAL" : "DELETE"}`);
    await client.$executeRawUnsafe("PRAGMA synchronous = NORMAL");
    // SQLite 官方建议长连接在打开时执行：按需更新查询规划器的统计信息（有上限，很快）。
    await client.$queryRawUnsafe("PRAGMA optimize = 0x10002");
  } catch (error) {
    console.warn("[db] 设置 SQLite 日志模式失败，继续使用当前模式：", error);
  }
}

function createClient() {
  const url = getDatabaseUrl();
  const adapter = new PrismaBetterSqlite3({ url, timeout: 5000 });
  const client = new PrismaClient({ adapter });
  if (url.startsWith("file:") && !url.includes(":memory:")) void configureSqlite(client);
  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
