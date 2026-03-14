/**
 * RASID Local SQLite Database — sql.js (pure JS, no native bindings)
 * Completely independent — no Manus resources used.
 * Works on any platform (Railway, Manus, Docker, etc.)
 */
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "..", "data", "rasid.db");

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ==================== Types ====================

export interface Conversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

// ==================== Database Singleton ====================

let _db: SqlJsDatabase | null = null;
let _initPromise: Promise<SqlJsDatabase> | null = null;

async function initDb(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();

  let db: SqlJsDatabase;

  // Load existing database file if it exists
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'محادثة جديدة',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
  `);

  // Enable foreign keys
  db.run("PRAGMA foreign_keys = ON;");

  // Save to disk
  saveDb(db);

  return db;
}

function saveDb(db: SqlJsDatabase): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

export async function getDb(): Promise<SqlJsDatabase> {
  if (_db) return _db;
  if (!_initPromise) {
    _initPromise = initDb().then((db) => {
      _db = db;
      return db;
    });
  }
  return _initPromise;
}

// Helper to run a query and return all rows as objects
function queryAll(db: SqlJsDatabase, sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper to run a query and return the first row
function queryOne(db: SqlJsDatabase, sql: string, params: any[] = []): any | undefined {
  const rows = queryAll(db, sql, params);
  return rows.length > 0 ? rows[0] : undefined;
}

// ==================== Conversation Helpers ====================

export async function createConversation(title?: string): Promise<Conversation> {
  const db = await getDb();
  db.run("INSERT INTO conversations (title) VALUES (?)", [title || "محادثة جديدة"]);
  const lastId = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] as number;
  saveDb(db);
  const row = queryOne(db, "SELECT * FROM conversations WHERE id = ?", [lastId]);
  return row as Conversation;
}

export async function getConversations(): Promise<Conversation[]> {
  const db = await getDb();
  return queryAll(db, "SELECT * FROM conversations ORDER BY updated_at DESC") as Conversation[];
}

export async function getConversation(id: number): Promise<Conversation | undefined> {
  const db = await getDb();
  return queryOne(db, "SELECT * FROM conversations WHERE id = ?", [id]) as Conversation | undefined;
}

export async function updateConversationTitle(id: number, title: string): Promise<void> {
  const db = await getDb();
  db.run("UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?", [title, id]);
  saveDb(db);
}

export async function touchConversation(id: number): Promise<void> {
  const db = await getDb();
  db.run("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?", [id]);
  saveDb(db);
}

export async function deleteConversation(id: number): Promise<void> {
  const db = await getDb();
  db.run("DELETE FROM messages WHERE conversation_id = ?", [id]);
  db.run("DELETE FROM conversations WHERE id = ?", [id]);
  saveDb(db);
}

// ==================== Message Helpers ====================

export async function addMessage(
  conversationId: number,
  role: "user" | "assistant" | "system",
  content: string
): Promise<ChatMessage> {
  const db = await getDb();
  // Touch conversation
  db.run("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?", [conversationId]);
  // Insert message
  db.run("INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)", [conversationId, role, content]);
  const lastId = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] as number;
  saveDb(db);
  const row = queryOne(db, "SELECT * FROM messages WHERE id = ?", [lastId]);
  return row as ChatMessage;
}

export async function getMessages(conversationId: number): Promise<ChatMessage[]> {
  const db = await getDb();
  return queryAll(db, "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC", [conversationId]) as ChatMessage[];
}

// Export for direct DB access in tests
export async function execSql(sql: string): Promise<void> {
  const db = await getDb();
  db.run(sql);
  saveDb(db);
}
