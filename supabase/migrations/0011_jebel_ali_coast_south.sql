-- Move Jebel Ali onto fleet.json coordinates (historical migration; 0020 is authoritative).

update public.ports
set position = ST_SetSRID(ST_MakePoint(54.75, 25.50), 4326)::geography
where id = 'DXB-1';
