import { CreateTableCommand, DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { Client as Elastic } from "@elastic/elasticsearch";
import { config } from "../config.js";
import type { FoodItem, MealCalendar } from "./types.js";

/** Primary store for food items and plans (DynamoDB in production). */
export interface FoodStore {
  putItem(item: FoodItem): Promise<void>;
  getItem(id: string): Promise<FoodItem | undefined>;
  allItems(): Promise<FoodItem[]>;
  getCalendar(userId: string): Promise<MealCalendar | undefined>;
  putCalendar(cal: MealCalendar): Promise<void>;
}

/** Full-text search over food items (Elasticsearch in production). */
export interface FoodSearch {
  index(item: FoodItem): Promise<void>;
  search(q: { text?: string; maxPrice?: number; tags?: string[]; size?: number }): Promise<FoodItem[]>;
}

export class MemoryFoodStore implements FoodStore {
  private items = new Map<string, FoodItem>();
  private calendars = new Map<string, MealCalendar>();
  async putItem(item: FoodItem) {
    this.items.set(item.id, structuredClone(item));
  }
  async getItem(id: string) {
    const i = this.items.get(id);
    return i && structuredClone(i);
  }
  async allItems() {
    return [...this.items.values()].map((i) => structuredClone(i));
  }
  async getCalendar(userId: string) {
    const c = this.calendars.get(userId);
    return c && structuredClone(c);
  }
  async putCalendar(cal: MealCalendar) {
    this.calendars.set(cal.userId, structuredClone(cal));
  }
}

export class MemoryFoodSearch implements FoodSearch {
  private items = new Map<string, FoodItem>();
  async index(item: FoodItem) {
    this.items.set(item.id, item);
  }
  async search({ text, maxPrice, tags, size = 40 }: Parameters<FoodSearch["search"]>[0]) {
    const words = (text ?? "").toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    return [...this.items.values()]
      .filter((i) => maxPrice === undefined || i.price <= maxPrice)
      .filter((i) => !tags?.length || tags.every((t) => i.tags.includes(t)))
      .map((i) => {
        const hay = `${i.name} ${i.category} ${i.tags.join(" ")}`.toLowerCase();
        return { i, score: words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0) };
      })
      .sort((a, b) => b.score - a.score || a.i.price - b.i.price)
      .slice(0, size)
      .map(({ i }) => i);
  }
}

/**
 * Single-table DynamoDB layout:
 *   PK=ITEM#<id>  SK=META            food item
 *   PK=USER#<id>  SK=CALENDAR        meal calendar (days keyed by date)
 * Reads use ConsistentRead so a plan you just saved is the plan you read back.
 */
export class DynamoFoodStore implements FoodStore {
  private constructor(private doc: DynamoDBDocumentClient, private table: string) {}

  static async connect() {
    const { endpoint, region, table } = config.dynamo;
    const raw = new DynamoDBClient({ region, endpoint });
    try {
      await raw.send(new DescribeTableCommand({ TableName: table }));
    } catch {
      await raw.send(
        new CreateTableCommand({
          TableName: table,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "PK", AttributeType: "S" },
            { AttributeName: "SK", AttributeType: "S" },
          ],
          KeySchema: [
            { AttributeName: "PK", KeyType: "HASH" },
            { AttributeName: "SK", KeyType: "RANGE" },
          ],
        })
      );
    }
    return new DynamoFoodStore(DynamoDBDocumentClient.from(raw), table);
  }

  async putItem(item: FoodItem) {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: { PK: `ITEM#${item.id}`, SK: "META", ...item } }));
  }
  async getItem(id: string) {
    const r = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: { PK: `ITEM#${id}`, SK: "META" }, ConsistentRead: true })
    );
    return r.Item as FoodItem | undefined;
  }
  async allItems() {
    const out: FoodItem[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const r = await this.doc.send(
        new ScanCommand({
          TableName: this.table,
          FilterExpression: "SK = :meta",
          ExpressionAttributeValues: { ":meta": "META" },
          ExclusiveStartKey: start,
          ConsistentRead: true,
        })
      );
      out.push(...((r.Items ?? []) as FoodItem[]));
      start = r.LastEvaluatedKey;
    } while (start);
    return out;
  }
  async getCalendar(userId: string) {
    const r = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: { PK: `USER#${userId}`, SK: "CALENDAR" }, ConsistentRead: true })
    );
    if (!r.Item) return undefined;
    const { PK: _pk, SK: _sk, ...cal } = r.Item;
    return cal as MealCalendar;
  }
  async putCalendar(cal: MealCalendar) {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: { PK: `USER#${cal.userId}`, SK: "CALENDAR", ...cal } }));
  }
}

export class ElasticFoodSearch implements FoodSearch {
  private static INDEX = "recura-food";
  private constructor(private es: Elastic) {}

  static async connect() {
    const es = new Elastic({ node: config.elasticsearchUrl });
    if (!(await es.indices.exists({ index: ElasticFoodSearch.INDEX }))) {
      await es.indices.create({
        index: ElasticFoodSearch.INDEX,
        mappings: {
          properties: {
            name: { type: "text" },
            category: { type: "text" },
            tags: { type: "keyword" },
            price: { type: "float" },
            market: { type: "keyword" },
          },
        },
      });
    }
    return new ElasticFoodSearch(es);
  }

  async index(item: FoodItem) {
    // refresh: wait_for makes the update visible to the next search (consistency over speed).
    await this.es.index({ index: ElasticFoodSearch.INDEX, id: item.id, document: item, refresh: "wait_for" });
  }

  async search({ text, maxPrice, tags, size = 40 }: Parameters<FoodSearch["search"]>[0]) {
    const filter: object[] = [];
    if (maxPrice !== undefined) filter.push({ range: { price: { lte: maxPrice } } });
    for (const t of tags ?? []) filter.push({ term: { tags: t } });
    const r = await this.es.search<FoodItem>({
      index: ElasticFoodSearch.INDEX,
      size,
      query: {
        bool: {
          filter,
          should: text ? [{ multi_match: { query: text, fields: ["name^3", "category", "tags^2"], fuzziness: "AUTO" } }] : [],
        },
      },
      sort: text ? ["_score", { price: "asc" }] : [{ price: "asc" }],
    });
    return r.hits.hits.map((h) => h._source!).filter(Boolean);
  }
}
