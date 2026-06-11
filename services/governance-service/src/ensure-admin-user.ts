import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';

const adminUsername = process.env.RASID_BOOTSTRAP_ADMIN_USERNAME || 'MRUHAILY';
const adminEmail = process.env.RASID_BOOTSTRAP_ADMIN_EMAIL || 'prog.muhammed@gmail.com';
const adminName = process.env.RASID_BOOTSTRAP_ADMIN_NAME || 'Mohammed ALRuhaily';
const adminPassword = process.env.RASID_BOOTSTRAP_ADMIN_PASSWORD;
const saltRounds = 12;

type ColumnInfo = {
  Field: string;
  Type: string;
  Null: 'YES' | 'NO';
  Key: string;
  Default: string | null;
  Extra: string;
};

function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL;
}

function columnExists(columns: Map<string, ColumnInfo>, name: string): boolean {
  return columns.has(name);
}

function enumAllows(column: ColumnInfo | undefined, value: string): boolean {
  return !column || !column.Type.toLowerCase().startsWith('enum(') || column.Type.includes(`'${value}'`);
}

function enumValue(column: ColumnInfo | undefined, preferred: string, fallback: string): string {
  if (enumAllows(column, preferred)) return preferred;
  if (enumAllows(column, fallback)) return fallback;
  const match = column?.Type.match(/enum\((.*)\)/i);
  return match?.[1]?.split(',')?.[0]?.trim()?.replace(/^'|'$/g, '') || preferred;
}

async function main(): Promise<void> {
  if (!adminPassword) {
    console.log('[ensure-admin-user] Skipped: RASID_BOOTSTRAP_ADMIN_PASSWORD is not set.');
    return;
  }

  const url = databaseUrl();
  if (!url) {
    console.log('[ensure-admin-user] Skipped: no MySQL URL is configured.');
    return;
  }

  const connection = await mysql.createConnection(url);
  try {
    const [tables] = await connection.query("SHOW TABLES LIKE 'users'");
    if (!Array.isArray(tables) || tables.length === 0) {
      console.log('[ensure-admin-user] Skipped: users table does not exist.');
      return;
    }

    const [columnRows] = await connection.query<ColumnInfo[]>('SHOW COLUMNS FROM users');
    const columns = new Map(columnRows.map((column) => [column.Field, column]));
    const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

    const idColumn = columnExists(columns, 'id') ? 'id' : columnRows[0].Field;
    const predicates: string[] = [];
    const predicateValues: string[] = [];

    if (columnExists(columns, 'email')) {
      predicates.push('email = ?');
      predicateValues.push(adminEmail);
    }
    if (columnExists(columns, 'username')) {
      predicates.push('username = ?');
      predicateValues.push(adminUsername);
    }
    if (columnExists(columns, 'openId')) {
      predicates.push('openId = ?');
      predicateValues.push(`local:${adminEmail}`);
    }

    const [existingRows] = predicates.length > 0
      ? await connection.execute<Record<string, unknown>[] & mysql.RowDataPacket[]>(
          `SELECT \`${idColumn}\` FROM users WHERE ${predicates.join(' OR ')} LIMIT 1`,
          predicateValues
        )
      : [[] as unknown as Record<string, unknown>[] & mysql.RowDataPacket[]];

    const values: Record<string, unknown> = {
      openId: `local:${adminEmail}`,
      email: adminEmail,
      username: adminUsername,
      name: adminName,
      displayName: adminName,
      loginMethod: 'password',
      passwordHash,
      password_hash: passwordHash,
      role: enumValue(columns.get('role'), 'superadmin', 'admin'),
      rasidRole: enumValue(columns.get('rasidRole'), 'root', 'admin'),
      isActive: 1,
      status: 'ACTIVE',
      failedLoginAttempts: 0,
      lockedUntil: null,
      emailNotifications: 1,
      preferences: JSON.stringify({}),
    };

    if (existingRows[0]) {
      const updateEntries = Object.entries(values).filter(([name]) => columnExists(columns, name));
      const sql = updateEntries.map(([name]) => `\`${name}\` = ?`).join(', ');
      await connection.execute(
        `UPDATE users SET ${sql} WHERE \`${idColumn}\` = ?`,
        [...updateEntries.map(([, value]) => value), existingRows[0][idColumn]]
      );
      console.log(`[ensure-admin-user] Updated admin user ${adminUsername}.`);
      return;
    }

    const insertEntries = Object.entries(values).filter(([name]) => columnExists(columns, name));
    const insertColumns = insertEntries.map(([name]) => `\`${name}\``).join(', ');
    const placeholders = insertEntries.map(() => '?').join(', ');
    await connection.execute(
      `INSERT INTO users (${insertColumns}) VALUES (${placeholders})`,
      insertEntries.map(([, value]) => value)
    );
    console.log(`[ensure-admin-user] Created admin user ${adminUsername}.`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn('[ensure-admin-user] Failed. Service startup will continue.', { message });
});
