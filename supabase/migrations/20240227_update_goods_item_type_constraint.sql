-- Drop the existing constraint
ALTER TABLE goods DROP CONSTRAINT IF EXISTS goods_item_type_check;

-- Add the new constraint with expanded allowed values
ALTER TABLE goods ADD CONSTRAINT goods_item_type_check CHECK (
  item_type IN (
    'PERSEDIAAN',
    'NON_PERSEDIAAN',
    'ASET_AKTIVA_TETAP',
    'PERALATAN_WORKSHOP',
    'INVENTARIS_KANTOR',
    'FURNITURE',
    'PERLENGKAPAN'
  )
);
