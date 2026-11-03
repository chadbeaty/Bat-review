// Connector interface. A connector turns a configured monitored source into discovered items. Add a new data
// source by implementing this interface and registering it in connectors/index.ts — nothing else changes.

export type FetchedItem = {
  externalId: string;
  url: string | null;
  title: string | null;
  author: string | null;
  publishedAt: string | null;
  contentText: string | null;
  metadata?: Record<string, unknown>;
};

export type ConnectorContext = {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  /** Names of tracked people, for connectors that filter by person (e.g. disclosures). */
  trackedNames: string[];
  now: Date;
};

export type ConnectorResult = { status: "ok"; items: FetchedItem[] } | { status: "skipped"; reason: string } | { status: "error"; message: string };

export type SourceConnector = {
  id: string;
  label: string;
  description: string;
  /** Environment variables required; when missing, the connector reports "skipped" instead of failing. */
  requiresEnv: string[];
  /** Example configuration shown in the newsroom. */
  exampleConfig: Record<string, unknown>;
  terms: string;
  fetchItems(config: Record<string, unknown>, ctx: ConnectorContext): Promise<ConnectorResult>;
};
