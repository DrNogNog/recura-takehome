import "dotenv/config";

type Store = "memory" | "external";

function store(name: string): Store {
  return process.env[name] === "external" ? "external" : "memory";
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  instanceId: process.env.INSTANCE_ID ?? `api-${process.pid}`,
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",

  // Each workflow's storage runs in memory by default so the app works with no
  // databases installed. Set to "external" once the backing service is running.
  appointmentsStore: store("APPOINTMENTS_STORE"), // Cassandra
  suppliesStore: store("SUPPLIES_STORE"), // Postgres
  foodStore: store("FOOD_STORE"), // DynamoDB + Elasticsearch

  databaseUrl: process.env.DATABASE_URL,
  cassandra: {
    contactPoints: (process.env.CASSANDRA_CONTACT_POINTS ?? "localhost").split(","),
    localDataCenter: process.env.CASSANDRA_DC ?? "datacenter1",
    keyspace: process.env.CASSANDRA_KEYSPACE ?? "recura",
  },
  dynamo: {
    endpoint: process.env.DYNAMO_ENDPOINT, // e.g. http://localhost:8000 for DynamoDB Local
    region: process.env.AWS_REGION ?? "us-east-1",
    table: process.env.DYNAMO_FOOD_TABLE ?? "recura_food",
  },
  elasticsearchUrl: process.env.ELASTICSEARCH_URL ?? "http://localhost:9200",

  // Optional integrations; features degrade gracefully when unset.
  anthropicEnabled: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  googleApiKey: process.env.GOOGLE_API_KEY,
  googleCseId: process.env.GOOGLE_CSE_ID,
  foodMarketUrls: (process.env.FOOD_MARKET_URLS ?? "").split(",").filter(Boolean),
  cdnBaseUrl: process.env.CDN_BASE_URL ?? "",
};
