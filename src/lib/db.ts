import "server-only";
import {
  createPool,
  type Pool,
  type PoolConnection,
  type QueryResult,
  type RowDataPacket,
} from "mysql2/promise";
import type { ExecuteValues } from "mysql2";
import { randomBytes } from "crypto";
export { Category, Role, Status } from "./types";
export type { Category as CategoryType, Role as RoleType, Status as StatusType, VoteType } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var mysqlPool: Pool | undefined;
}

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to connect to MySQL");
  }
  globalThis.mysqlPool ??= createPool(process.env.DATABASE_URL);
  return globalThis.mysqlPool;
}

export async function query<T extends RowDataPacket[] = RowDataPacket[]>(
  sql: string,
  values: unknown[] = []
): Promise<T> {
  const [rows] = await getPool().execute<T>(sql, values as ExecuteValues);
  return rows;
}

export async function execute(sql: string, values: unknown[] = []) {
  const [result] = await getPool().execute<QueryResult>(sql, values as ExecuteValues);
  return result;
}

export async function transaction<T>(
  callback: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await getPool().getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const result = await callback(connection);
    await connection.commit();
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function newId() {
  return `c${randomBytes(12).toString("hex")}`;
}
