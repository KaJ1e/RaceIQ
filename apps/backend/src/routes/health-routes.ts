import { Hono } from "hono";
import { onlineHealth } from "@raceiq/backend-core/runtime/network-health";

/**
 * Reachability of optional online sources (update check, community tunes, lap
 * times). The client uses this to say "online content unavailable, using local
 * data" instead of silently rendering stale content.
 */
export const healthRoutes = new Hono().get("/api/network-health", (c) => c.json(onlineHealth()));
