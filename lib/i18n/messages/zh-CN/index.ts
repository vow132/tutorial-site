import { admin } from "./admin";
import { common } from "./common";
import { defaults } from "./defaults";
import { email } from "./email";
import { reader } from "./reader";
import { site } from "./site";

/** 简体中文：所有文案的原始版本，其他语言的字典必须和它的结构完全一致（类型检查保证）。 */
export const zhCN = { common, site, reader, admin, email, defaults };
