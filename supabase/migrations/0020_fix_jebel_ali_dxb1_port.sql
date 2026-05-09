-- Jebel Ali (DXB-1): align with fleet.json / map — WGS84 lng 54.75, lat 25.50
-- Safe to re-run; fixes bad values from older migrations (e.g. typo lng 65.08).

update public.ports
set position = ST_SetSRID(ST_MakePoint(54.75, 25.50), 4326)::geography
where id = 'DXB-1';
