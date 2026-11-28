/**
 * 运维脚本（npm run backup / backup:restore / uploads:clean / admin:reset、迁移、一键更新进程）的文字。
 * 网站的字典在 lib/i18n/messages（TypeScript），Docker 镜像里的 .mjs 脚本引用不到，所以这里另放一份：
 * - 命令行输出用 cliText()：简体中文站点输出中文，其余语言的站点输出英文
 *   （服务器运维通常看英文，俄语、日语的命令行输出不单独翻译）；还没有站点设置的新库（第一次启动、
 *   还没安装）不知道语言，中英文各输出一行；
 * - 会出现在后台页面或告警渠道里的文字（备份失败告警、一键更新的进度、失败原因和结果推送）用 scriptText()，
 *   和网站其他告警一样按网站语言，四种语言都有（lib/script-i18n.test.mjs 检查四种语言的键和占位符一致）。
 * 纯 JS，只用 Node 内置模块（.mjs 运维脚本的限制）；网站语言从调用方打开的数据库里读。
 */

export const SCRIPT_LOCALES = ["zh-CN", "en", "ru", "ja"];

/** toLocaleString 用的地区 */
export const SCRIPT_INTL = { "zh-CN": "zh-CN", en: "en-US", ru: "ru-RU", ja: "ja-JP" };

/** 站点设置（Setting 表 key=site 的 JSON 文本）里的语言；没有这一行时返回 null，没写语言按简体中文。 */
export function localeFromSiteSetting(value) {
  if (typeof value !== "string") return null;
  try {
    const locale = JSON.parse(value).locale;
    return SCRIPT_LOCALES.includes(locale) ? locale : "zh-CN";
  } catch {
    return "zh-CN";
  }
}

/**
 * 从已打开的 better-sqlite3 数据库读网站语言。有站点设置但没写语言（1.5.0 之前的站点）按简体中文；
 * 还没有站点设置、表还没建（新库）或读不了时返回 null（不知道）。
 */
export function siteLocaleFrom(db) {
  try {
    const row = db.prepare('SELECT "value" FROM "Setting" WHERE "key" = ?').get("site");
    return localeFromSiteSetting(row?.value);
  } catch {
    return null;
  }
}

/** 打开数据库文件（只读）读网站语言；Database 是调用方 require 到的 better-sqlite3。文件不存在等任何错误都返回 null。 */
export function siteLocaleOfFile(Database, file) {
  try {
    const db = new Database(file, { readonly: true, fileMustExist: true, timeout: 5000 });
    try {
      return siteLocaleFrom(db);
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/** 命令行文字：t("中文", "English")。简体中文站点用第一个，其余语言用第二个，不知道语言（null）时两行都输出。 */
export function cliText(locale) {
  return (zh, en) => (locale === "zh-CN" ? zh : locale ? en : `${zh}\n${en}`);
}

export const SCRIPT_TEXT = {
  "zh-CN": {
    defaultSite: "教程网",
    time: "时间：{time}",
    backupFailed: "数据库备份失败",
    backupReason: "原因：{reason}",
    backupDatabase: "数据库：{path}",
    backupDirectory: "备份目录：{path}",
    updated: "网站已更新到新版本",
    newRevision: "新版本：{rev}",
    oldRevision: "原版本：{rev}",
    updateFailed: "网站更新失败",
    updateFailedUnrecovered: "网站更新失败，自动恢复未完成，请尽快处理",
    targetRevision: "目标版本：{rev}",
    failedPhase: "失败阶段：{phase}",
    "phase.preflight": "部署检查",
    "phase.fetch": "获取更新",
    "phase.install": "安装依赖",
    "phase.build": "构建",
    "phase.activate": "切换版本",
    "phase.health": "健康检查",
    "phase.rollback": "恢复原版本",
    "progress.preflight": "正在检查部署环境…",
    "progress.fetch": "正在获取仓库更新…",
    "progress.install": "正在安装新版本依赖…",
    "progress.build": "正在使用数据库副本构建新版本，站点继续运行…",
    "progress.activate": "构建成功，正在备份数据库并切换版本…",
    "progress.health": "正在验证新版本运行状态…",
    "progress.complete": "更新成功，站点已运行最新版本。",
    "progress.rollback": "新版本切换失败，正在恢复原版本…",
    "error.badJob": "更新任务参数无效。",
    "error.badLock": "更新任务锁无效。",
    "error.notEnabled": "自动更新需要启用更新功能的 Linux + PM2 生产部署。",
    "error.badOrigin": "本地 Git 仓库来源与教程网仓库不一致。",
    "error.dirty": "服务器存在未提交的本地修改，请先处理后再更新。",
    "error.noProcess": "自动更新需要一个正在运行的 PM2 fork 模式站点进程。",
    "error.foreignCwd": "PM2 进程目录不属于当前站点。",
    "error.foreignScript": "PM2 启动入口不是当前站点的 Next.js。",
    "error.unknownRevision": "无法确认当前部署版本。",
    "error.revisionMismatch": "当前运行版本与 Git 工作目录不一致，请先重新部署。",
    "error.badDatabase": "站点数据库文件无效。",
    "error.databaseInRelease": "数据库必须位于共享持久化目录中。",
    "error.badPort": "站点端口配置无效。",
    "error.revisionChanged": "仓库版本已变化，请重新检查更新。",
    "error.notAncestor": "仓库更新与当前版本历史不兼容，已停止更新。",
    "error.alreadyLatest": "当前已经是最新版本。",
    "error.unsigned": "目标版本缺少可信签名，已停止更新。",
    "error.uploadsInRelease": "新版本包含上传目录，无法安全共享现有文件。",
    "error.changedDuringBuild": "构建期间检测到服务器本地修改，更新已取消。",
    "error.notOnline": "新版本 PM2 进程未正常运行。",
    "error.cantStop": "无法停止进程，不能安全恢复数据库。",
    "error.noBackup": "回滚数据库备份缺失。",
    "error.notRestored": "原版本 PM2 进程未正常恢复。",
    "error.checkFailed": "部署检查失败。",
    "failed.unrecovered": "更新失败且自动恢复未完成，请检查服务器 .updates/worker.log；数据库备份已保留。",
    "failed.restored": "更新失败，已恢复原版本。详细原因见服务器 .updates/worker.log。",
    "failed.check": "部署检查失败，请检查服务器 .updates/worker.log。",
    "failed.build": "新版本构建失败，原站点继续运行。详细原因见服务器 .updates/worker.log。",
  },
  en: {
    defaultSite: "Tutorials",
    time: "Time: {time}",
    backupFailed: "Database backup failed",
    backupReason: "Reason: {reason}",
    backupDatabase: "Database: {path}",
    backupDirectory: "Backup folder: {path}",
    updated: "The site was updated to a new version",
    newRevision: "New version: {rev}",
    oldRevision: "Previous version: {rev}",
    updateFailed: "Site update failed",
    updateFailedUnrecovered: "Site update failed and automatic recovery did not finish — please act soon",
    targetRevision: "Target version: {rev}",
    failedPhase: "Failed at: {phase}",
    "phase.preflight": "deployment check",
    "phase.fetch": "fetching the update",
    "phase.install": "installing dependencies",
    "phase.build": "build",
    "phase.activate": "switching versions",
    "phase.health": "health check",
    "phase.rollback": "restoring the previous version",
    "progress.preflight": "Checking the deployment environment…",
    "progress.fetch": "Fetching repository updates…",
    "progress.install": "Installing dependencies for the new version…",
    "progress.build": "Building the new version with a database copy; the site keeps running…",
    "progress.activate": "Build succeeded; backing up the database and switching versions…",
    "progress.health": "Checking the new version is healthy…",
    "progress.complete": "Update succeeded; the site is running the latest version.",
    "progress.rollback": "Switching to the new version failed; restoring the previous version…",
    "error.badJob": "Invalid update job parameters.",
    "error.badLock": "Invalid update job lock.",
    "error.notEnabled": "One-click update needs a Linux + PM2 production deployment with updates enabled.",
    "error.badOrigin": "The local Git repository's origin is not this project's repository.",
    "error.dirty": "The server has uncommitted local changes; deal with them before updating.",
    "error.noProcess": "One-click update needs one running PM2 site process in fork mode.",
    "error.foreignCwd": "The PM2 process directory doesn't belong to this site.",
    "error.foreignScript": "The PM2 entry point isn't this site's Next.js.",
    "error.unknownRevision": "Can't determine the deployed version.",
    "error.revisionMismatch": "The running version doesn't match the Git working directory; redeploy first.",
    "error.badDatabase": "The site's database file is invalid.",
    "error.databaseInRelease": "The database must be in the shared persistent directory.",
    "error.badPort": "Invalid site port setting.",
    "error.revisionChanged": "The repository has changed; check for updates again.",
    "error.notAncestor": "The update isn't compatible with the current version's history; update stopped.",
    "error.alreadyLatest": "Already on the latest version.",
    "error.unsigned": "The target version has no trusted signature; update stopped.",
    "error.uploadsInRelease": "The new version contains an uploads folder, so existing files can't be shared safely.",
    "error.changedDuringBuild": "Local changes appeared on the server during the build; update cancelled.",
    "error.notOnline": "The new version's PM2 process isn't running properly.",
    "error.cantStop": "Couldn't stop the process, so the database can't be restored safely.",
    "error.noBackup": "The rollback database backup is missing.",
    "error.notRestored": "The previous version's PM2 process didn't come back properly.",
    "error.checkFailed": "The deployment check failed.",
    "failed.unrecovered": "Update failed and automatic recovery didn't finish. Check .updates/worker.log on the server; the database backup was kept.",
    "failed.restored": "Update failed; the previous version was restored. See .updates/worker.log on the server for details.",
    "failed.check": "The deployment check failed; see .updates/worker.log on the server.",
    "failed.build": "Building the new version failed; the site keeps running the old one. See .updates/worker.log on the server for details.",
  },
  ru: {
    defaultSite: "Уроки",
    time: "Время: {time}",
    backupFailed: "Не удалось создать резервную копию базы",
    backupReason: "Причина: {reason}",
    backupDatabase: "База данных: {path}",
    backupDirectory: "Папка резервных копий: {path}",
    updated: "Сайт обновлён до новой версии",
    newRevision: "Новая версия: {rev}",
    oldRevision: "Прежняя версия: {rev}",
    updateFailed: "Обновление сайта не удалось",
    updateFailedUnrecovered: "Обновление не удалось, и автоматическое восстановление не завершилось — разберитесь как можно скорее",
    targetRevision: "Целевая версия: {rev}",
    failedPhase: "Этап сбоя: {phase}",
    "phase.preflight": "проверка окружения",
    "phase.fetch": "загрузка обновления",
    "phase.install": "установка зависимостей",
    "phase.build": "сборка",
    "phase.activate": "переключение версии",
    "phase.health": "проверка работы",
    "phase.rollback": "восстановление прежней версии",
    "progress.preflight": "Проверка окружения…",
    "progress.fetch": "Получение обновлений из репозитория…",
    "progress.install": "Установка зависимостей новой версии…",
    "progress.build": "Сборка новой версии на копии базы; сайт продолжает работать…",
    "progress.activate": "Сборка успешна; резервное копирование базы и переключение версии…",
    "progress.health": "Проверка работы новой версии…",
    "progress.complete": "Обновление успешно, сайт работает на последней версии.",
    "progress.rollback": "Переключение не удалось; восстанавливаем прежнюю версию…",
    "error.badJob": "Неверные параметры задачи обновления.",
    "error.badLock": "Неверная блокировка задачи обновления.",
    "error.notEnabled": "Обновлению в один клик нужно рабочее развёртывание Linux + PM2 с включёнными обновлениями.",
    "error.badOrigin": "Источник (origin) локального Git-репозитория — не репозиторий этого проекта.",
    "error.dirty": "На сервере есть незафиксированные локальные изменения; разберитесь с ними перед обновлением.",
    "error.noProcess": "Обновлению в один клик нужен один работающий процесс сайта PM2 в режиме fork.",
    "error.foreignCwd": "Каталог процесса PM2 не принадлежит этому сайту.",
    "error.foreignScript": "Точка входа PM2 — не Next.js этого сайта.",
    "error.unknownRevision": "Не удалось определить развёрнутую версию.",
    "error.revisionMismatch": "Работающая версия не совпадает с рабочим каталогом Git; сначала разверните сайт заново.",
    "error.badDatabase": "Файл базы данных сайта недействителен.",
    "error.databaseInRelease": "База данных должна находиться в общем постоянном каталоге.",
    "error.badPort": "Неверно задан порт сайта.",
    "error.revisionChanged": "Репозиторий изменился; проверьте обновления ещё раз.",
    "error.notAncestor": "Обновление несовместимо с историей текущей версии; обновление остановлено.",
    "error.alreadyLatest": "Уже установлена последняя версия.",
    "error.unsigned": "У целевой версии нет доверенной подписи; обновление остановлено.",
    "error.uploadsInRelease": "Новая версия содержит папку загрузок, поэтому существующие файлы нельзя безопасно подключить.",
    "error.changedDuringBuild": "Во время сборки на сервере появились локальные изменения; обновление отменено.",
    "error.notOnline": "Процесс PM2 новой версии работает неправильно.",
    "error.cantStop": "Не удалось остановить процесс, поэтому базу нельзя безопасно восстановить.",
    "error.noBackup": "Резервная копия базы для отката отсутствует.",
    "error.notRestored": "Процесс PM2 прежней версии не восстановился.",
    "error.checkFailed": "Проверка окружения не пройдена.",
    "failed.unrecovered": "Обновление не удалось, и автоматическое восстановление не завершилось. Проверьте .updates/worker.log на сервере; резервная копия базы сохранена.",
    "failed.restored": "Обновление не удалось; прежняя версия восстановлена. Подробности — в .updates/worker.log на сервере.",
    "failed.check": "Проверка окружения не пройдена; см. .updates/worker.log на сервере.",
    "failed.build": "Сборка новой версии не удалась; сайт продолжает работать на прежней. Подробности — в .updates/worker.log на сервере.",
  },
  ja: {
    defaultSite: "チュートリアル",
    time: "日時：{time}",
    backupFailed: "データベースのバックアップに失敗しました",
    backupReason: "原因：{reason}",
    backupDatabase: "データベース：{path}",
    backupDirectory: "バックアップ先：{path}",
    updated: "サイトを新しいバージョンに更新しました",
    newRevision: "新しいバージョン：{rev}",
    oldRevision: "以前のバージョン：{rev}",
    updateFailed: "サイトの更新に失敗しました",
    updateFailedUnrecovered: "サイトの更新に失敗し、自動復旧も完了していません。早急に対応してください",
    targetRevision: "更新先のバージョン：{rev}",
    failedPhase: "失敗した段階：{phase}",
    "phase.preflight": "デプロイ環境の確認",
    "phase.fetch": "更新の取得",
    "phase.install": "依存関係のインストール",
    "phase.build": "ビルド",
    "phase.activate": "バージョンの切り替え",
    "phase.health": "動作確認",
    "phase.rollback": "元のバージョンへの復元",
    "progress.preflight": "デプロイ環境を確認しています…",
    "progress.fetch": "リポジトリの更新を取得しています…",
    "progress.install": "新しいバージョンの依存関係をインストールしています…",
    "progress.build": "データベースのコピーで新しいバージョンをビルドしています（サイトは稼働中）…",
    "progress.activate": "ビルドに成功しました。データベースをバックアップしてバージョンを切り替えています…",
    "progress.health": "新しいバージョンの動作を確認しています…",
    "progress.complete": "更新に成功しました。サイトは最新バージョンで稼働しています。",
    "progress.rollback": "新しいバージョンへの切り替えに失敗しました。元のバージョンに戻しています…",
    "error.badJob": "更新タスクのパラメータが不正です。",
    "error.badLock": "更新タスクのロックが不正です。",
    "error.notEnabled": "ワンクリック更新には、更新機能を有効にした Linux + PM2 の本番デプロイが必要です。",
    "error.badOrigin": "ローカル Git リポジトリの origin が本プロジェクトのリポジトリではありません。",
    "error.dirty": "サーバーにコミットされていないローカルの変更があります。先に対処してから更新してください。",
    "error.noProcess": "ワンクリック更新には、fork モードで実行中の PM2 サイトプロセスが 1 つ必要です。",
    "error.foreignCwd": "PM2 プロセスのディレクトリがこのサイトのものではありません。",
    "error.foreignScript": "PM2 の起動エントリがこのサイトの Next.js ではありません。",
    "error.unknownRevision": "現在デプロイされているバージョンを確認できません。",
    "error.revisionMismatch": "実行中のバージョンが Git の作業ディレクトリと一致しません。先に再デプロイしてください。",
    "error.badDatabase": "サイトのデータベースファイルが不正です。",
    "error.databaseInRelease": "データベースは共有の永続ディレクトリに置く必要があります。",
    "error.badPort": "サイトのポート設定が不正です。",
    "error.revisionChanged": "リポジトリが変わりました。もう一度更新を確認してください。",
    "error.notAncestor": "更新が現在のバージョンの履歴と両立しないため、更新を中止しました。",
    "error.alreadyLatest": "すでに最新バージョンです。",
    "error.unsigned": "更新先のバージョンに信頼できる署名がないため、更新を中止しました。",
    "error.uploadsInRelease": "新しいバージョンにアップロードフォルダが含まれているため、既存のファイルを安全に共有できません。",
    "error.changedDuringBuild": "ビルド中にサーバーでローカルの変更が検出されたため、更新を取り消しました。",
    "error.notOnline": "新しいバージョンの PM2 プロセスが正常に動作していません。",
    "error.cantStop": "プロセスを停止できないため、データベースを安全に復元できません。",
    "error.noBackup": "ロールバック用のデータベースのバックアップがありません。",
    "error.notRestored": "元のバージョンの PM2 プロセスが正常に復旧しませんでした。",
    "error.checkFailed": "デプロイ環境の確認に失敗しました。",
    "failed.unrecovered": "更新に失敗し、自動復旧も完了していません。サーバーの .updates/worker.log を確認してください。データベースのバックアップは残してあります。",
    "failed.restored": "更新に失敗したため、元のバージョンに戻しました。詳しい原因はサーバーの .updates/worker.log を見てください。",
    "failed.check": "デプロイ環境の確認に失敗しました。サーバーの .updates/worker.log を確認してください。",
    "failed.build": "新しいバージョンのビルドに失敗しました。サイトは元のバージョンで稼働し続けています。詳しい原因はサーバーの .updates/worker.log を見てください。",
  },
};

/** 按网站语言取文字并替换 {占位符}：const t = scriptText(locale); t("newRevision", { rev })。不知道语言（null）时用简体中文。 */
export function scriptText(locale) {
  const table = SCRIPT_TEXT[locale] ?? SCRIPT_TEXT["zh-CN"];
  return (key, vars = {}) =>
    (table[key] ?? SCRIPT_TEXT["zh-CN"][key] ?? key).replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}
