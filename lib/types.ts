export type LatLng = {
  lat: number;
  lng: number;
};

export type ScenarioConfig = {
  id: string;
  name: string;
  bounding_box: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  // In DB this is a PostGIS geography; we’ll fetch AO + navigable from `fleet.json` initially
};

export type PortRow = {
  id: string;
  name: string;
  // For now we fetch position via PostGIS as WKT/GeoJSON later; seeded is geography
};

export type ShipStateCurrentRow = {
  ship_id: string;
  ts: string;
  speed_knots: number;
  heading_deg: number;
  fuel_tons: number;
  status: string;
  // position is geography; we’ll fetch as WKT/GeoJSON later
};

