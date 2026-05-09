-- Move Jebel Ali slightly south onto the coast / port approach (was too far offshore).

update public.ports
set position = ST_SetSRID(ST_MakePoint(54.75, 25.50), 4326)::geography
where id = 'DXB-1';
