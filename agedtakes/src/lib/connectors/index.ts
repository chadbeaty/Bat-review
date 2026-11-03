import type { SourceConnector } from "./types";
import { rssConnector } from "./rss";
import { houseConnector, manualUrlConnector, secEdgarConnector, senateConnector, youtubeConnector } from "./official";
import { coingeckoConnector, fmpConnector } from "./prices";

/** Registered connectors. To add a data source, implement SourceConnector and add it here. */
export const CONNECTORS: Record<string, SourceConnector> = Object.fromEntries(
  [rssConnector, youtubeConnector, secEdgarConnector, houseConnector, senateConnector, manualUrlConnector, coingeckoConnector, fmpConnector].map((c) => [c.id, c])
);

export function connectorFor(id: string): SourceConnector | null {
  return CONNECTORS[id] ?? null;
}

export type { SourceConnector, FetchedItem, ConnectorContext, ConnectorResult } from "./types";
