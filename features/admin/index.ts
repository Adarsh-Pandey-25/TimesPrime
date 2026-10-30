// Public surface of the admin feature. Client- and server-safe; admin has no
// server code of its own, so there is no server.ts.
export { default as ActivityLog } from "./components/ActivityLog";
export { default as ArticlesTable } from "./components/ArticlesTable";
export { default as BreakingNewsBanner } from "./components/BreakingNewsBanner";
export { default as BreakingNewsManager } from "./components/BreakingNewsManager";
export { default as CategoryStatsCard } from "./components/CategoryStatsCard";
export { default as SyncDashboard } from "./components/SyncDashboard";
