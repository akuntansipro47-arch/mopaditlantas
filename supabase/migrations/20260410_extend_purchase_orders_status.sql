-- Extend purchase_orders.status allowed values to include CANCELLED and RETURNED_FULL.

ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (
    status IS NULL OR status IN (
      'DRAFT',
      'ISSUED',
      'RECEIVED_PART',
      'RECEIVED_FULL',
      'CANCELLED',
      'RETURNED_FULL'
    )
  );

