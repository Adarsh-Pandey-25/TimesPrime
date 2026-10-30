// Public surface of the admin feature. Client- and server-safe; admin has no
// server code of its own, so there is no server.ts.
export { default as ActivityLog } from "./ActivityLog";
export { default as ArticlesTable } from "./ArticlesTable";
export { default as BreakingNewsManager } from "./BreakingNewsManager";
export { default as CategoryStatsCard } from "./CategoryStatsCard";
export { default as SyncDashboard } from "./SyncDashboard";
