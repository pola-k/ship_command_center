-- Move Jebel Ali slightly south onto the coast / port approach (was too far offshore).

update public.ports
set position = ST_SetSRID(ST_MakePoint(65.08, 44.88), 4326)::geography
where id = 'DXB-1';
