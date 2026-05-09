-- Seed initial scenario + ports + ships + initial ship_state_current from fleet.json

-- Scenario
insert into public.scenarios (id, name, description, coordinate_format, units, bounding_box, navigable_water)
values (
  '00000000-0000-0000-0000-000000000001',
  'Strait of Hormuz Crisis',
  'Major shipping chokepoint flagged as a High-Risk Red Zone after sudden geopolitical instability and naval blockades. Fifteen commercial cargo ships are in transit through the Persian Gulf, Strait of Hormuz, and Gulf of Oman.',
  '[lat, lng]',
  jsonb_build_object(
    'speed', 'knots',
    'fuel', 'tons',
    'heading', 'degrees from true north (0-360)'
  ),
  jsonb_build_object(
    'north', 30.5,
    'south', 22.0,
    'east', 60.0,
    'west', 47.5
  ),
  -- fleet.json uses [lat, lng]; WKT uses (lng lat)
  ST_GeogFromText(
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
      '60.00 22.50,' ||
      '58.80 23.80,' ||
      '57.20 24.50,' ||
      '56.50 25.20,' ||
      '56.45 26.45,' ||
      '55.90 26.30,' ||
      '55.50 26.00,' ||
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
)
on conflict (id) do nothing;

-- Ports
insert into public.ports (id, name, position)
values
  ('KWT-1', 'Kuwait City',  ST_SetSRID(ST_MakePoint(48.34, 29.48), 4326)::geography),
  ('BUS-1', 'Bushehr',      ST_SetSRID(ST_MakePoint(50.73, 28.83), 4326)::geography),
  ('DMM-1', 'Dammam',       ST_SetSRID(ST_MakePoint(50.30, 26.56), 4326)::geography),
  ('BAH-1', 'Manama',       ST_SetSRID(ST_MakePoint(50.55, 26.50), 4326)::geography),
  ('DOH-1', 'Doha',         ST_SetSRID(ST_MakePoint(51.95, 25.46), 4326)::geography),
  ('AUH-1', 'Abu Dhabi',    ST_SetSRID(ST_MakePoint(54.18, 25.22), 4326)::geography),
  ('DXB-1', 'Jebel Ali',    ST_SetSRID(ST_MakePoint(54.75, 25.50), 4326)::geography),
  ('BND-1', 'Bandar Abbas', ST_SetSRID(ST_MakePoint(56.11, 26.62), 4326)::geography),
  ('SOH-1', 'Sohar',        ST_SetSRID(ST_MakePoint(57.02, 24.72), 4326)::geography),
  ('MCT-1', 'Muscat',       ST_SetSRID(ST_MakePoint(58.58, 23.92), 4326)::geography)
on conflict (id) do nothing;

-- Ships
insert into public.ships (id, name, destination_port_id, cargo_type)
values
  ('MV-1',  'Aurora',   'MCT-1', 'crude oil'),
  ('MV-2',  'Borealis', 'DXB-1', 'containers'),
  ('MV-3',  'Cygnus',   'MCT-1', 'LNG'),
  ('MV-4',  'Dragon',   'SOH-1', 'bulk grain'),
  ('MV-5',  'Emerald',  'DOH-1', 'crude oil'),
  ('MV-6',  'Falcon',   'DOH-1', 'containers'),
  ('MV-7',  'Gharial',  'KWT-1', 'crude oil'),
  ('MV-8',  'Halcyon',  'DMM-1', 'automobiles'),
  ('MV-9',  'Iris',     'BAH-1', 'crude oil'),
  ('MV-10', 'Jade',     'BND-1', 'containers'),
  ('MV-11', 'Kite',     'MCT-1', 'LNG'),
  ('MV-12', 'Lotus',    'SOH-1', 'crude oil'),
  ('MV-13', 'Mirage',   'BAH-1', 'containers'),
  ('MV-14', 'Nova',     'DOH-1', 'bulk cement'),
  ('MV-15', 'Orca',     'MCT-1', 'crude oil')
on conflict (id) do nothing;

-- Initial ship live state (ts set to now; your simulator will take over)
insert into public.ship_state_current (ship_id, ts, position, speed_knots, heading_deg, fuel_tons, status, extra)
values
  ('MV-1',  now(), ST_SetSRID(ST_MakePoint(56.20, 26.55), 4326)::geography, 14, 105, 6800, 'normal', '{}'::jsonb),
  ('MV-2',  now(), ST_SetSRID(ST_MakePoint(57.20, 25.50), 4326)::geography, 19, 270, 5400, 'normal', '{}'::jsonb),
  ('MV-3',  now(), ST_SetSRID(ST_MakePoint(53.00, 25.70), 4326)::geography, 16,  95, 7200, 'normal', '{}'::jsonb),
  ('MV-4',  now(), ST_SetSRID(ST_MakePoint(56.00, 26.40), 4326)::geography, 13, 110, 5800, 'normal', '{}'::jsonb),
  ('MV-5',  now(), ST_SetSRID(ST_MakePoint(51.20, 27.50), 4326)::geography, 12, 165, 8200, 'normal', '{}'::jsonb),
  ('MV-6',  now(), ST_SetSRID(ST_MakePoint(54.53, 25.40), 4326)::geography, 22, 280, 4100, 'normal', '{}'::jsonb),
  ('MV-7',  now(), ST_SetSRID(ST_MakePoint(53.50, 26.50), 4326)::geography, 14, 270,  750, 'normal', '{}'::jsonb),
  ('MV-8',  now(), ST_SetSRID(ST_MakePoint(56.94, 24.93), 4326)::geography, 19, 250, 5200, 'normal', '{}'::jsonb),
  ('MV-9',  now(), ST_SetSRID(ST_MakePoint(50.30, 28.20), 4326)::geography, 13, 175, 7800, 'normal', '{}'::jsonb),
  ('MV-10', now(), ST_SetSRID(ST_MakePoint(57.96, 25.02), 4326)::geography, 20, 285, 6300, 'normal', '{}'::jsonb),
  ('MV-11', now(), ST_SetSRID(ST_MakePoint(52.18, 25.64), 4326)::geography, 18,  95, 7600, 'normal', '{}'::jsonb),
  ('MV-12', now(), ST_SetSRID(ST_MakePoint(48.80, 29.10), 4326)::geography, 12, 145, 8500, 'normal', '{}'::jsonb),
  ('MV-13', now(), ST_SetSRID(ST_MakePoint(57.30, 24.60), 4326)::geography, 21, 320, 5900, 'normal', '{}'::jsonb),
  ('MV-14', now(), ST_SetSRID(ST_MakePoint(58.43, 24.12), 4326)::geography, 11, 290, 4600, 'normal', '{}'::jsonb),
  ('MV-15', now(), ST_SetSRID(ST_MakePoint(55.91, 26.34), 4326)::geography, 13, 215, 7100, 'normal', '{}'::jsonb)
on conflict (ship_id) do update
set
  ts = excluded.ts,
  position = excluded.position,
  speed_knots = excluded.speed_knots,
  heading_deg = excluded.heading_deg,
  fuel_tons = excluded.fuel_tons,
  status = excluded.status,
  extra = excluded.extra;

