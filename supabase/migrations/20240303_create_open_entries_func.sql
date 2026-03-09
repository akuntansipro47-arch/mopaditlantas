-- Function to safely fetch open vehicle entries
-- This bypasses potential RLS confusion by running as a secure definer function if needed
-- But for now we just make a clear standard function

CREATE OR REPLACE FUNCTION get_open_vehicle_entries()
RETURNS TABLE (
  id uuid,
  entry_date date,
  entry_number text,
  license_plate text,
  status text,
  vehicle_brand text,
  vehicle_type text
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ve.id,
    ve.entry_date,
    ve.entry_number,
    v.license_plate,
    ve.status,
    v.brand_type as vehicle_brand,
    v.vehicle_type as vehicle_type
  FROM vehicle_entries ve
  LEFT JOIN vehicles v ON ve.vehicle_id = v.id
  WHERE 
    ve.status = 'OPEN' 
    OR ve.status IS NULL 
    OR ve.status = 'open'
  ORDER BY ve.entry_date DESC
  LIMIT 50;
END;
$$;