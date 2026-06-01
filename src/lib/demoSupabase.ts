type DemoResult<T> = { data: T; error: any; count?: number | null };

function safeJsonParse(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getPath(obj: any, path: string) {
  if (!obj) return undefined;
  if (!path) return undefined;
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function normalizeText(v: any) {
  return String(v ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function likeToContains(pattern: string) {
  const p = String(pattern || '').trim();
  const stripped = p.replace(/%/g, '').replace(/_/g, '');
  return normalizeText(stripped);
}

function splitTopLevelComma(input: string) {
  const out: string[] = [];
  let cur = '';
  let depth = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      const t = cur.trim();
      if (t) out.push(t);
      cur = '';
      continue;
    }
    cur += ch;
  }
  const last = cur.trim();
  if (last) out.push(last);
  return out;
}

type ParsedCond = { col: string; op: string; value: string };

function parseCond(expr: string): ParsedCond | null {
  const s = String(expr || '').trim();
  if (!s) return null;
  const ops = ['ilike', 'like', 'gte', 'lte', 'gt', 'lt', 'neq', 'eq', 'is', 'in'];
  for (const op of ops) {
    const token = `.${op}.`;
    const idx = s.indexOf(token);
    if (idx > 0) {
      return {
        col: s.slice(0, idx).trim(),
        op,
        value: s.slice(idx + token.length).trim(),
      };
    }
  }
  return null;
}

function parseInList(raw: string) {
  const s = String(raw || '').trim();
  const inner = s.startsWith('(') && s.endsWith(')') ? s.slice(1, -1) : s;
  return inner
    .split(',')
    .map((v) => String(v).trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

function normalizeBoolish(value: string) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return value;
}

function evalCond(row: any, cond: ParsedCond) {
  const val = getPath(row, cond.col);
  const op = cond.op;
  const rhsRaw = cond.value;
  const rhs = normalizeBoolish(rhsRaw);

  if (op === 'is') {
    if (String(rhsRaw).trim().toLowerCase() === 'null') return val == null;
    return String(val) === String(rhs);
  }

  if (op === 'in') {
    const list = parseInList(rhsRaw);
    const set = new Set(list.map((x) => String(x)));
    return set.has(String(val));
  }

  if (op === 'ilike' || op === 'like') {
    const needle = likeToContains(rhsRaw);
    return normalizeText(val).includes(needle);
  }

  if (op === 'eq') return String(val) === String(rhs);
  if (op === 'neq') return String(val) !== String(rhs);

  if (op === 'gte' || op === 'lte' || op === 'gt' || op === 'lt') {
    if (val == null) return false;
    const an = Number(val);
    const bn = Number(rhs);
    const a = Number.isFinite(an) ? an : String(val);
    const b = Number.isFinite(bn) ? bn : String(rhs);
    if (op === 'gte') return (a as any) >= (b as any);
    if (op === 'lte') return (a as any) <= (b as any);
    if (op === 'gt') return (a as any) > (b as any);
    if (op === 'lt') return (a as any) < (b as any);
  }

  return true;
}

function demoKeyForTable(table: string) {
  return `demo_table_${String(table || '').trim()}`;
}

function readTable(table: string): any[] {
  const raw = localStorage.getItem(demoKeyForTable(table));
  const parsed = safeJsonParse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function writeTable(table: string, rows: any[]) {
  localStorage.setItem(demoKeyForTable(table), JSON.stringify(Array.isArray(rows) ? rows : []));
}

function ensureId(row: any) {
  if (row && row.id) return row;
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? (crypto as any).randomUUID() : `demo_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return { ...row, id };
}

const relationMap: Record<string, { table: string; outKeys: string[] }> = {
  supplier_id: { table: 'suppliers', outKeys: ['supplier', 'suppliers'] },
  goods_id: { table: 'goods', outKeys: ['goods'] },
  work_order_id: { table: 'work_orders', outKeys: ['work_order', 'work_orders'] },
  vehicle_entry_id: { table: 'vehicle_entries', outKeys: ['vehicle_entry', 'vehicle_entries'] },
  po_id: { table: 'purchase_orders', outKeys: ['purchase_order', 'purchase_orders', 'po'] },
  job_type_id: { table: 'job_types', outKeys: ['job_type', 'job_types'] },
  coa_id: { table: 'chart_of_accounts', outKeys: ['coa', 'chart_of_accounts'] },
  goods_receipt_id: { table: 'goods_receipts', outKeys: ['goods_receipt', 'goods_receipts'] },
  invoice_id: { table: 'purchase_invoices', outKeys: ['purchase_invoice', 'purchase_invoices'] },
};

function attachRelations(row: any) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const [key, cfg] of Object.entries(relationMap)) {
    const relId = (out as any)[key];
    if (!relId) continue;
    const relRows = readTable(cfg.table);
    const found = relRows.find((r: any) => String(r?.id) === String(relId));
    if (!found) continue;
    for (const outKey of cfg.outKeys) {
      if ((out as any)[outKey] == null) (out as any)[outKey] = found;
    }
  }
  return out;
}

type FilterFn = (row: any) => boolean;

class DemoQueryBuilder {
  private table: string;
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: any = null;
  private filters: FilterFn[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private rangeValue: { from: number; to: number } | null = null;
  private wantSingle = false;
  private wantMaybeSingle = false;
  private wantCount: 'exact' | null = null;
  private headOnly = false;

  constructor(table: string) {
    this.table = table;
  }

  select(_columns?: any, options?: any) {
    this.op = 'select';
    if (options?.count === 'exact') this.wantCount = 'exact';
    if (options?.head === true) this.headOnly = true;
    return this;
  }

  insert(values: any, _options?: any) {
    this.op = 'insert';
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  upsert(values: any, _options?: any) {
    this.op = 'upsert';
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  update(values: any, _options?: any) {
    this.op = 'update';
    this.payload = values || {};
    return this;
  }

  delete(_options?: any) {
    this.op = 'delete';
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push((row) => String(getPath(row, column)) === String(value));
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push((row) => String(getPath(row, column)) !== String(value));
    return this;
  }

  in(column: string, values: any[]) {
    const set = new Set((values || []).map((v) => String(v)));
    this.filters.push((row) => set.has(String(getPath(row, column))));
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push((row) => {
      const a = getPath(row, column);
      if (a == null) return false;
      const an = Number(a);
      const bn = Number(value);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an >= bn;
      return String(a) >= String(value);
    });
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push((row) => {
      const a = getPath(row, column);
      if (a == null) return false;
      const an = Number(a);
      const bn = Number(value);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an <= bn;
      return String(a) <= String(value);
    });
    return this;
  }

  ilike(column: string, pattern: string) {
    const needle = likeToContains(pattern);
    this.filters.push((row) => normalizeText(getPath(row, column)).includes(needle));
    return this;
  }

  gt(column: string, value: any) {
    this.filters.push((row) => {
      const a = getPath(row, column);
      if (a == null) return false;
      const an = Number(a);
      const bn = Number(value);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an > bn;
      return String(a) > String(value);
    });
    return this;
  }

  lt(column: string, value: any) {
    this.filters.push((row) => {
      const a = getPath(row, column);
      if (a == null) return false;
      const an = Number(a);
      const bn = Number(value);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an < bn;
      return String(a) < String(value);
    });
    return this;
  }

  is(column: string, value: any) {
    if (value === null) {
      this.filters.push((row) => getPath(row, column) == null);
      return this;
    }
    this.filters.push((row) => String(getPath(row, column)) === String(value));
    return this;
  }

  not(column: string, operator: string, value: any) {
    const op = String(operator || '').trim().toLowerCase();
    if (op === 'is' && value == null) {
      this.filters.push((row) => getPath(row, column) != null);
      return this;
    }
    if (op === 'in') {
      const list = parseInList(String(value || ''));
      const set = new Set(list.map((x) => String(x)));
      this.filters.push((row) => !set.has(String(getPath(row, column))));
      return this;
    }
    this.filters.push((row) => String(getPath(row, column)) !== String(value));
    return this;
  }

  match(query: Record<string, any>) {
    const q = query || {};
    Object.keys(q).forEach((k) => {
      this.filters.push((row) => String(getPath(row, k)) === String(q[k]));
    });
    return this;
  }

  or(expression: string, _options?: any) {
    const expr = String(expression || '').trim();
    if (!expr) return this;
    const parts = splitTopLevelComma(expr);
    this.filters.push((row) => {
      return parts.some((p) => {
        const s = String(p || '').trim();
        if (!s) return false;
        if (s.startsWith('and(') && s.endsWith(')')) {
          const inner = s.slice(4, -1);
          const andParts = splitTopLevelComma(inner);
          return andParts.every((ap) => {
            const c = parseCond(ap);
            if (!c) return true;
            return evalCond(row, c);
          });
        }
        const c = parseCond(s);
        if (!c) return true;
        return evalCond(row, c);
      });
    });
    return this;
  }

  order(column: string, options?: any) {
    const asc = options?.ascending !== false;
    this.orders.push({ col: column, asc });
    return this;
  }

  range(from: number, to: number) {
    this.rangeValue = { from: Math.max(0, toNumber(from)), to: Math.max(0, toNumber(to)) };
    return this;
  }

  limit(count: number) {
    const c = Math.max(0, toNumber(count));
    this.rangeValue = { from: 0, to: Math.max(0, c - 1) };
    return this;
  }

  single() {
    this.wantSingle = true;
    this.wantMaybeSingle = false;
    return this;
  }

  maybeSingle() {
    this.wantMaybeSingle = true;
    this.wantSingle = false;
    return this;
  }

  private applyFilters(rows: any[]) {
    if (this.filters.length === 0) return rows;
    return rows.filter((r) => this.filters.every((fn) => fn(r)));
  }

  private applyOrder(rows: any[]) {
    if (this.orders.length === 0) return rows;
    const ordered = [...rows];
    ordered.sort((a, b) => {
      for (const o of this.orders) {
        const av = getPath(a, o.col);
        const bv = getPath(b, o.col);
        if (av === bv) continue;
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true, sensitivity: 'base' });
        return o.asc ? cmp : -cmp;
      }
      return 0;
    });
    return ordered;
  }

  private applyRange(rows: any[]) {
    if (!this.rangeValue) return rows;
    const { from, to } = this.rangeValue;
    return rows.slice(from, to + 1);
  }

  private finalizeSingle<T>(rows: T[]): DemoResult<any> {
    if (this.wantSingle) {
      if (rows.length !== 1) return { data: null, error: { message: 'Row not found' } };
      return { data: rows[0], error: null };
    }
    if (this.wantMaybeSingle) {
      return { data: rows.length > 0 ? rows[0] : null, error: null };
    }
    return { data: rows as any, error: null };
  }

  private nowIso() {
    return new Date().toISOString();
  }

  private async exec(): Promise<DemoResult<any>> {
    const tableName = String(this.table || '').trim();
    const current = readTable(tableName);
    const filtered = this.applyFilters(current);
    const count = this.wantCount === 'exact' ? filtered.length : null;

    if (this.op === 'select') {
      if (this.headOnly) return { data: null, error: null, count };
      const ordered = this.applyOrder(filtered);
      const ranged = this.applyRange(ordered);
      const data = ranged.map((r) => attachRelations(r));
      const result = this.finalizeSingle(data);
      if (this.wantCount === 'exact') (result as any).count = count;
      return result;
    }

    if (this.op === 'insert') {
      const rows = (this.payload || []).map((r: any) => ensureId({ ...r, created_at: r?.created_at ?? this.nowIso() }));
      const next = [...current, ...rows];
      writeTable(tableName, next);
      return this.finalizeSingle(rows.map((r: any) => attachRelations(r)));
    }

    if (this.op === 'upsert') {
      const incoming = (this.payload || []).map((r: any) => ensureId({ ...r, updated_at: r?.updated_at ?? this.nowIso() }));
      const byId = new Map<string, any>();
      current.forEach((r: any) => byId.set(String(r?.id), r));
      incoming.forEach((r: any) => {
        byId.set(String(r?.id), { ...(byId.get(String(r?.id)) || {}), ...r });
      });
      const next = Array.from(byId.values());
      writeTable(tableName, next);
      return this.finalizeSingle(incoming.map((r: any) => attachRelations(r)));
    }

    if (this.op === 'update') {
      const patch = this.payload || {};
      const updated: any[] = [];
      const next = current.map((r: any) => {
        if (!this.filters.every((fn) => fn(r))) return r;
        const merged = { ...r, ...patch, updated_at: patch?.updated_at ?? this.nowIso() };
        updated.push(merged);
        return merged;
      });
      writeTable(tableName, next);
      return this.finalizeSingle(updated.map((r: any) => attachRelations(r)));
    }

    if (this.op === 'delete') {
      const deleted: any[] = [];
      const next = current.filter((r: any) => {
        const ok = this.filters.every((fn) => fn(r));
        if (ok) deleted.push(r);
        return !ok;
      });
      writeTable(tableName, next);
      return this.finalizeSingle(deleted.map((r: any) => attachRelations(r)));
    }

    return { data: null, error: { message: 'Unsupported operation' } };
  }

  then(resolve: any, reject: any) {
    return this.exec().then(resolve, reject);
  }

  catch(reject: any) {
    return this.exec().catch(reject);
  }

  finally(onFinally: any) {
    return this.exec().finally(onFinally);
  }
}

export function isDemoMode() {
  const flag = localStorage.getItem('demo_mode');
  if (flag === '1') return true;
  const userRaw = localStorage.getItem('app_user');
  const parsed = safeJsonParse(userRaw);
  return String(parsed?.role || '').toUpperCase() === 'DEMO';
}

export function createDemoSupabase() {
  const storageNoop = {
    upload: async () => ({ data: null, error: null }),
    download: async () => ({ data: null, error: null }),
    remove: async () => ({ data: null, error: null }),
    list: async () => ({ data: [], error: null }),
    getPublicUrl: () => ({ data: { publicUrl: '' } }),
  };

  const channelNoop = (name: string) => {
    const ch: any = {
      topic: name,
      on: () => ch,
      subscribe: () => ch,
      unsubscribe: async () => ({ data: null, error: null }),
    };
    return ch;
  };

  return {
    from: (table: string) => new DemoQueryBuilder(table),
    rpc: async (_fn: string, _args?: any) => ({ data: [], error: null }),
    channel: (name: string) => channelNoop(name),
    removeChannel: async (_ch: any) => ({ data: null, error: null }),
    storage: {
      from: (_bucket: string) => storageNoop,
    },
  } as any;
}
