-- Align navigable-water polygon with fleet.json (Strait of Hormuz channel fix) and move Jebel Ali / Sohar to the coast.

update public.scenarios
set navigable_water = ST_GeogFromText(
  'POLYGON((' ||
    '48.60 29.80,' ||
    '50.00 29.50,' ||
    '50.80 28.80,' ||
    '52.00 27.80,' ||
    '53.50 26.70,' ||
    '55.00 26.30,' ||
    '56.10 26.65,' ||
    '56.40 26.50,' ||
    '56.80 26.00,' ||
    '57.50 25.50,' ||
    '58.50 25.50,' ||
    '60.00 25.00,' ||
    '60.00 22.00,' ||
    '58.80 23.80,' ||
    '57.20 24.50,' ||
    '57.00 25.30,' ||
    '56.70 26.10,' ||
    '56.30 26.30,' ||
    '56.00 26.40,' ||
    '55.60 26.10,' ||
    '55.50 25.50,' ||
    '54.50 25.30,' ||
    '53.00 24.80,' ||
    '52.00 25.30,' ||
    '51.50 26.40,' ||
    '50.30 26.50,' ||
    '49.80 27.50,' ||
    '49.00 28.50,' ||
    '48.30 29.50,' ||
    '48.60 29.80' ||
  '))'
)
where id = '00000000-0000-0000-0000-000000000001';

update public.ports
set position = ST_SetSRID(ST_MakePoint(55.12, 25.015), 4326)::geography
where id = 'DXB-1';

update public.ports
set position = ST_SetSRID(ST_MakePoint(56.73, 24.34), 4326)::geography
where id = 'SOH-1';
