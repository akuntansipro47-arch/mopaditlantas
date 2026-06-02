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
  vehicle_id: { table: 'vehicles', outKeys: ['vehicle', 'vehicles'] },
  po_id: { table: 'purchase_orders', outKeys: ['purchase_order', 'purchase_orders', 'po'] },
  job_type_id: { table: 'job_types', outKeys: ['job_type', 'job_types'] },
  coa_id: { table: 'chart_of_accounts', outKeys: ['coa', 'chart_of_accounts'] },
  goods_receipt_id: { table: 'goods_receipts', outKeys: ['goods_receipt', 'goods_receipts'] },
  invoice_id: { table: 'purchase_invoices', outKeys: ['purchase_invoice', 'purchase_invoices'] },
};

function ensureDemoSeed() {
  if (!isDemoMode()) return;
  const seeded = localStorage.getItem('demo_seed_v1');
  if (seeded === '1') return;

  const existingGoods = readTable('goods');
  const existingVehicles = readTable('vehicles');
  const existingEntries = readTable('vehicle_entries');
  const existingWos = readTable('work_orders');

  if (existingGoods.length > 0 || existingVehicles.length > 0 || existingEntries.length > 0 || existingWos.length > 0) {
    localStorage.setItem('demo_seed_v1', '1');
    return;
  }

  const now = new Date();
  const d = (daysAgo: number) => {
    const x = new Date(now);
    x.setDate(x.getDate() - daysAgo);
    x.setHours(10, 0, 0, 0);
    return x;
  };
  const dateOnly = (dt: Date) => dt.toISOString().split('T')[0];
  const ts = (dt: Date) => dt.toISOString();

  const v1 = ensureId({
    vehicle_type: 'R4',
    license_plate: 'B 1234 DEMO',
    brand_type: 'Avanza',
    owner_name: 'PT Demo',
    created_at: ts(d(120)),
    updated_at: ts(d(60)),
  });
  const v2 = ensureId({
    vehicle_type: 'R2',
    license_plate: 'D 5678 DEMO',
    brand_type: 'Vario',
    owner_name: 'Bpk Demo',
    created_at: ts(d(90)),
    updated_at: ts(d(30)),
  });
  writeTable('vehicles', [v1, v2]);

  const jt1 = ensureId({ job_name: 'Service Ringan', job_group: 'SERVICE_RINGAN', hpp: 70000, selling_price: 150000, created_at: ts(d(200)) });
  const jt2 = ensureId({ job_name: 'Perbaikan Rem', job_group: 'PERBAIKAN', hpp: 120000, selling_price: 250000, created_at: ts(d(200)) });
  writeTable('job_types', [jt1, jt2]);

  const g1 = ensureId({ item_code: 'BRG-DEMO-001', name: 'Oli Mesin', unit: 'BOTOL', item_type: 'PERSEDIAAN', current_stock: 1, selling_price: 65000, created_at: ts(d(200)) });
  const g2 = ensureId({ item_code: 'BRG-DEMO-002', name: 'Kampas Rem', unit: 'SET', item_type: 'PERSEDIAAN', current_stock: 0, selling_price: 90000, created_at: ts(d(200)) });
  const g3 = ensureId({ item_code: 'BRG-DEMO-003', name: 'Baut Roda', unit: 'PCS', item_type: 'PERSEDIAAN', current_stock: 12, selling_price: 5000, created_at: ts(d(200)) });
  writeTable('goods', [g1, g2, g3]);

  const e1 = ensureId({
    entry_number: 'ENT-DEMO-0001',
    vehicle_id: v1.id,
    entry_date: dateOnly(d(8)),
    estimated_finish_date: dateOnly(d(5)),
    service_group: 'SERVICE_RINGAN',
    status: 'OPEN',
    created_at: ts(d(8)),
  });
  const e2 = ensureId({
    entry_number: 'ENT-DEMO-0002',
    vehicle_id: v2.id,
    entry_date: dateOnly(d(18)),
    estimated_finish_date: dateOnly(d(14)),
    service_group: 'PERBAIKAN',
    status: 'CLOSED',
    created_at: ts(d(18)),
  });
  writeTable('vehicle_entries', [e1, e2]);

  const wo1 = ensureId({
    wo_number: 'WO-DEMO-0001',
    vehicle_entry_id: e1.id,
    work_date: dateOnly(d(8)),
    status: 'IN_PROGRESS',
    created_at: ts(d(8)),
  });
  const wo2 = ensureId({
    wo_number: 'WO-DEMO-0002',
    vehicle_entry_id: e2.id,
    work_date: dateOnly(d(13)),
    completed_at: ts(d(12)),
    status: 'CLOSED',
    created_at: ts(d(18)),
  });
  writeTable('work_orders', [wo1, wo2]);

  const bills = [
    ensureId({
      work_order_id: wo2.id,
      item_type: 'JOB',
      job_type_id: jt2.id,
      goods_id: null,
      item_name: jt2.job_name,
      qty: 1,
      unit_price: 250000,
      total_price: 250000,
      job_group: jt2.job_group,
      created_at: ts(d(13)),
    }),
    ensureId({
      work_order_id: wo2.id,
      item_type: 'PART',
      goods_id: g2.id,
      job_type_id: null,
      item_name: g2.name,
      qty: 1,
      unit_price: 90000,
      total_price: 90000,
      created_at: ts(d(13)),
    }),
  ];
  writeTable('work_order_billings', bills);

  const po1 = ensureId({
    po_number: 'PO-DEMO-0001',
    supplier_id: null,
    work_order_id: wo2.id,
    status: 'RECEIVED_FULL',
    total_amount: 70000,
    created_at: ts(d(20)),
  });
  writeTable('purchase_orders', [po1]);

  const poItems = [
    ensureId({
      po_id: po1.id,
      goods_id: g2.id,
      quantity: 1,
      unit_price: 70000,
      total_price: 70000,
      created_at: ts(d(20)),
    }),
  ];
  writeTable('purchase_order_items', poItems);

  const inv1 = ensureId({
    invoice_number: 'INV-DEMO-0001',
    work_order_id: wo2.id,
    customer_name: 'PT Demo',
    vehicle_id: v1.id,
    invoice_date: dateOnly(d(12)),
    due_date: dateOnly(d(2)),
    total_amount: 340000,
    paid_amount: 340000,
    status: 'PAID',
    created_at: ts(d(12)),
  });
  const invOld = ensureId({
    invoice_number: 'INV-DEMO-OLD',
    work_order_id: null,
    customer_name: 'PT Demo',
    vehicle_id: v1.id,
    invoice_date: dateOnly(d(60)),
    due_date: dateOnly(d(30)),
    total_amount: 150000,
    paid_amount: 150000,
    status: 'PAID',
    created_at: ts(d(60)),
  });
  const inv2 = ensureId({
    invoice_number: 'INV-DEMO-0002',
    work_order_id: null,
    customer_name: 'Bpk Demo',
    vehicle_id: v2.id,
    invoice_date: dateOnly(d(6)),
    due_date: dateOnly(d(1)),
    total_amount: 220000,
    paid_amount: 0,
    status: 'UNPAID',
    created_at: ts(d(6)),
  });
  writeTable('sales_invoices', [inv1, invOld, inv2]);

  const ap1 = ensureId({
    invoice_number: 'AP-DEMO-0001',
    po_id: po1.id,
    supplier_id: null,
    invoice_date: dateOnly(d(20)),
    due_date: dateOnly(d(5)),
    total_amount: 70000,
    paid_amount: 0,
    status: 'UNPAID',
    created_at: ts(d(20)),
  });
  writeTable('purchase_invoices', [ap1]);

  const issue1 = ensureId({
    issue_number: 'GI-DEMO-0001',
    work_order_id: wo2.id,
    issue_date: dateOnly(d(13)),
    created_at: ts(d(13)),
  });
  writeTable('goods_issues', [issue1]);
  const issueItems = [
    ensureId({ issue_id: issue1.id, goods_id: g2.id, quantity: 1, created_at: ts(d(13)) }),
    ensureId({ issue_id: issue1.id, goods_id: g1.id, quantity: 1, created_at: ts(d(13)) }),
  ];
  writeTable('goods_issue_items', issueItems);

  localStorage.setItem('demo_seed_v1', '1');
}

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
    from: (table: string) => {
      ensureDemoSeed();
      return new DemoQueryBuilder(table);
    },
    rpc: async (_fn: string, _args?: any) => ({ data: [], error: null }),
    channel: (name: string) => channelNoop(name),
    removeChannel: async (_ch: any) => ({ data: null, error: null }),
    storage: {
      from: (_bucket: string) => storageNoop,
    },
  } as any;
}
