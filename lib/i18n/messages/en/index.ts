import { admin } from "./admin";
import { common } from "./common";
import { defaults } from "./defaults";
import { email } from "./email";
import { reader } from "./reader";
import { site } from "./site";
import type { Messages } from "../types";

export const en: Messages = { common, site, reader, admin, email, defaults };
