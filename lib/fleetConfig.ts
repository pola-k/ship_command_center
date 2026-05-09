import fleet from "../fleet.json";

type FleetJson = {
  boundingBox: { north: number; south: number; east: number; west: number };
  navigableWater: number[][];
};

export const fleetConfig = fleet as unknown as FleetJson;

export const AO_BOUNDS: [[number, number], [number, number]] = [
  [fleetConfig.boundingBox.west, fleetConfig.boundingBox.south],
  [fleetConfig.boundingBox.east, fleetConfig.boundingBox.north],
];

export const NAVIGABLE_WATER_LATLNG: [number, number][] =
  fleetConfig.navigableWater as [number, number][];

