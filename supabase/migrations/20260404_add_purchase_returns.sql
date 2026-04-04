CREATE TABLE IF NOT EXISTS purchase_returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_number VARCHAR(50) UNIQUE NOT NULL,
  po_id UUID REFERENCES purchase_orders(id),
  return_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id UUID REFERENCES purchase_returns(id) ON DELETE CASCADE,
  goods_id UUID REFERENCES goods(id),
  quantity_returned NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS purchase_returns_po_id_idx ON purchase_returns(po_id);
CREATE INDEX IF NOT EXISTS purchase_return_items_return_id_idx ON purchase_return_items(return_id);
CREATE INDEX IF NOT EXISTS purchase_return_items_goods_id_idx ON purchase_return_items(goods_id);
