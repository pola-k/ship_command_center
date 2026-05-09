import fleet from "../fleet.json";

type FleetJson = {
  boundingBox: { north: number; south: number; east: number; west: number };
  navigableWater: number[][];
  operationalRules?: {
    captainLowFuelDistressTons?: number;
    captainLowFuelResetHysteresis?: number;
    captainDistressSeverity?: number;
    /** Tons consumed each map sim step: one client RAF tick while underway, or one server fleet tick. */
    fuelTonsPerSimStep?: number;
  };
};

export const fleetConfig = fleet as unknown as FleetJson;

export const AO_BOUNDS: [[number, number], [number, number]] = [
  [fleetConfig.boundingBox.west, fleetConfig.boundingBox.south],
  [fleetConfig.boundingBox.east, fleetConfig.boundingBox.north],
];

export const NAVIGABLE_WATER_LATLNG: [number, number][] =
  fleetConfig.navigableWater as [number, number][];

/** Below this remaining fuel (tons), captain bridge may auto-declare distress (see TacticalMap + RPC). */
export const CAPTAIN_LOW_FUEL_DISTRESS_TONS =
  fleetConfig.operationalRules?.captainLowFuelDistressTons ?? 2000;

/** Multiplier above threshold to clear auto low-fuel latch (avoid flapping). */
export const CAPTAIN_LOW_FUEL_RESET_HYSTERESIS =
  fleetConfig.operationalRules?.captainLowFuelResetHysteresis ?? 1.15;

/** Fixed tons consumed per sim step (each RAF frame while moving, or each fleet tick). Default 10. */
export const FUEL_TONS_PER_SIM_STEP =
  fleetConfig.operationalRules?.fuelTonsPerSimStep ?? 10;

