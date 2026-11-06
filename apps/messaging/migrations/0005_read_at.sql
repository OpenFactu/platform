-- Cuándo avanzó cada uno su "leído hasta aquí": la web lo enseña en el detalle
-- del mensaje ("Leído el 30 oct, 14:02").
ALTER TABLE participant ADD COLUMN last_read_at timestamptz;
UPDATE participant SET last_read_at = joined_at WHERE last_read_message_id IS NOT NULL;
