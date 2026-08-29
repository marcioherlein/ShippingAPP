export type D1Value = string | number | null | boolean

export type D1RunResultLike = {
  success?: boolean
  meta?: { changes?: number }
}

export interface D1PreparedStatementLike {
  bind(...values: D1Value[]): D1PreparedStatementLike
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<D1RunResultLike>
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike
}
