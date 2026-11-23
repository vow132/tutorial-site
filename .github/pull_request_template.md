## 改了什么

<!-- 一两句话说明这个 PR 做了什么；关联的 Issue 写成 Closes #123 -->

## 为什么

<!-- 要解决的问题或背景 -->

## 怎么验证的

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm test`
- [ ] `npm run build` 和 `npm run test:e2e`（改了页面、后台或接口时）

<!-- 手动验证的步骤，界面改动附截图（亮色 / 暗色 / 手机宽度） -->

## 注意事项

- [ ] 改了数据库：迁移只用 `ADD COLUMN`，并用 `prisma migrate diff` 确认过
- [ ] 加了依赖：版本发布满两周，lockfile 地址改成了 npmmirror
- [ ] 用户能感知的改动已写进 CHANGELOG.md 的「未发布」
