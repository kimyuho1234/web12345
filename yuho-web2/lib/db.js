import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri) {
  throw new Error("MONGODB_URI가 없습니다.");
}

if (!dbName) {
  throw new Error("MONGODB_DB가 없습니다.");
}

let cachedClient = global._mongoClient;
let cachedDb = global._mongoDb;

export async function getDb() {
  if (cachedDb) return cachedDb;

  const client = cachedClient || new MongoClient(uri);
  if (!cachedClient) {
    await client.connect();
    global._mongoClient = client;
  }

  const db = client.db(dbName);
  global._mongoDb = db;
  cachedDb = db;

  return db;
}