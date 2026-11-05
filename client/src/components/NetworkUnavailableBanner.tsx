import { useState } from "react";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnlineHealth } from "@/hooks/network-health";
import { m } from "@/paraglide/messages";

/** Quiet banner: online content is stale or unreachable, local data is in use. */
export function NetworkUnavailableBanner() {
  const health = useOnlineHealth();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !health?.known || health.reachable) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-app-border bg-app-surface-alt/40 px-3 py-1.5 text-app-caption text-app-text-muted"
    >
      <WifiOff className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{m.network_unavailable_banner()}</span>
      <Button type="button" variant="app-ghost" size="app-sm" onClick={() => setDismissed(true)}>
        {m.opponent_recording_dismiss()}
      </Button>
    </div>
  );
}
