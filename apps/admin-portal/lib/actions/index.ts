/**
 * Server Actions 导出入口
 * Server Actions export entry point
 */

export {
  serverActionTemplate,
  createSecureAction,
  getAuthContext,
  normalizePagination,
  normalizeSort,
  ActionError,
} from "./base";

export type {
  ActionResult,
  AuthContext,
  PaginationInput,
  SortInput,
} from "./base";
