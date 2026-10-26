/**
 * A stand-in for the Supabase client in tests: records every query and answers
 * it from a script. It covers only the query chain the app uses, and knows
 * nothing about the database; the script decides what each query returns.
 */

export interface FakeQuery {
  table: string;
  action: "select" | "insert" | "update" | "delete";
  /** The columns asked for, from `select()`. */
  columns?: string;
  /** The row(s) sent by `insert()` or `update()`. */
  payload?: unknown;
  /** `["eq", "id", value]`, `["in", "session_id", ids]`, `["gt", "started_at", value]`. */
  filters: [string, string, unknown][];
  /** `order:seq`, `limit:6`, `range:0-5`, in call order. */
  modifiers: string[];
  single: "single" | "maybeSingle" | null;
}

export interface FakeResult {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number | null;
}

export interface FakeCall {
  name: string;
  args: unknown;
}

export function fakeSupabase(
  answer: (query: FakeQuery) => FakeResult = () => ({}),
  rpc: (call: FakeCall) => FakeResult = () => ({}),
) {
  const queries: FakeQuery[] = [];
  const calls: FakeCall[] = [];
  const settle = (r: FakeResult) => ({ data: r.data ?? null, error: r.error ?? null, count: r.count ?? null });

  const from = (table: string) => {
    const query: FakeQuery = { table, action: "select", filters: [], modifiers: [], single: null };
    const chain = {
      select(columns?: string) {
        query.columns = columns;
        return chain;
      },
      insert(payload: unknown) {
        query.action = "insert";
        query.payload = payload;
        return chain;
      },
      update(payload: unknown) {
        query.action = "update";
        query.payload = payload;
        return chain;
      },
      delete() {
        query.action = "delete";
        return chain;
      },
      eq(column: string, value: unknown) {
        query.filters.push(["eq", column, value]);
        return chain;
      },
      in(column: string, values: unknown) {
        query.filters.push(["in", column, values]);
        return chain;
      },
      gt(column: string, value: unknown) {
        query.filters.push(["gt", column, value]);
        return chain;
      },
      order(column: string) {
        query.modifiers.push(`order:${column}`);
        return chain;
      },
      limit(n: number) {
        query.modifiers.push(`limit:${n}`);
        return chain;
      },
      range(from: number, to: number) {
        query.modifiers.push(`range:${from}-${to}`);
        return chain;
      },
      single() {
        query.single = "single";
        return chain;
      },
      maybeSingle() {
        query.single = "maybeSingle";
        return chain;
      },
      // Awaiting the chain runs the query.
      then<T>(resolve: (value: ReturnType<typeof settle>) => T, reject?: (reason: unknown) => T) {
        queries.push(query);
        return Promise.resolve(settle(answer(query))).then(resolve, reject);
      },
    };
    return chain;
  };

  const client = {
    from,
    rpc(name: string, args: unknown) {
      const call = { name, args };
      calls.push(call);
      return Promise.resolve(settle(rpc(call)));
    },
  };

  return { client, queries, calls };
}

/** The value of an `eq` filter on a recorded query. */
export function filterValue(query: FakeQuery, column: string): unknown {
  return query.filters.find(([op, col]) => op === "eq" && col === column)?.[2];
}
