# TileServer-GL (basemap) setup

This project renders the tactical HUD overlays (ships/ports/zones/routes) in the app, and uses a **label-free** basemap from **TileServer-GL** for coastline/landmass detail.

## Environment variables

Set these in `.env.local` (for dev) and in your deployment environment (prod):

- `NEXT_PUBLIC_TILE_STYLE_URL`
  - Example (TileServer-GL default styles): `http://localhost:8080/styles/dark-matter/style.json`
  - Recommended: point to your own style that removes all label layers.

## Local run (example)

Run TileServer-GL alongside Next.js.

If you already have an OpenMapTiles `.mbtiles` file:

### Option A (recommended): docker compose (one command)

1) Put your `.mbtiles` under `./tiles/` (example: `tiles/hormuz.mbtiles`)\n2) Start TileServer-GL:\n\n```bash\ndocker compose -f docker-compose.tileserver.yml up -d\n```\n\n3) Set your style URL:\n\n```bash\nNEXT_PUBLIC_TILE_STYLE_URL=http://localhost:8080/styles/basic/style.json\n```\n\n### Option B: docker run

```bash
docker run --rm -it ^
  -p 8080:80 ^
  -v \"%cd%/tiles:/data\" ^
  klokantech/tileserver-gl
```

Put your `.mbtiles` under `./tiles/` and restart the container. Then set:

```bash
NEXT_PUBLIC_TILE_STYLE_URL=http://localhost:8080/styles/basic/style.json
```

## Notes

- The UI is designed for **north-up, top-down**, with the operational AO bounds locked.
- Basemap labels are intentionally disabled/avoided; ports are rendered from Supabase data.

