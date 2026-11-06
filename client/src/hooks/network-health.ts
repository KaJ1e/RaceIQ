import { useQuery } from "@tanstack/react-query";
import { client } from "../lib/rpc";

type OnlineHealth = {
  reachable: boolean;
  known: boolean;
  sources: Array<{ source: string; ok: boolean; at: number; detail?: string }>;
};

/**
 * Reachability of the optional online sources. Polls slowly; the banner it feeds
 * only appears once a source has actually failed, so an offline start stays quiet.
 */
export function useOnlineHealth() {
  const { data } = useQuery({
    queryKey: ["network-health"],
    queryFn: async () => {
      const res = await client.api["network-health"].$get();
      if (!res.ok) throw new Error(res.statusText);
      return (await res.json()) as OnlineHealth;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return data;
}
