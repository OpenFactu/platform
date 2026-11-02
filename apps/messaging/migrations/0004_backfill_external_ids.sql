-- Los mensajes que llegaron de un canal antes de guardar su id en el proveedor
-- lo llevan en client_msg_id ("telegram:123"). Hace falta para casar las
-- reacciones con su mensaje.
UPDATE message m
   SET external_id = split_part(m.client_msg_id, ':', 2)
  FROM participant p
 WHERE p.id = m.author_participant_id
   AND p.kind = 'contact'
   AND m.external_id IS NULL
   AND m.client_msg_id LIKE '%:%';
