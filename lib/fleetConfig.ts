import fleet from "../fleet.json";

type FleetJson = {
  boundingBox: { north: number; south: number; east: number; west: number };
  navigableWater: number[][];
  operationalRules?: {
    captainLowFuelDistressTons?: number;
    captainLowFuelResetHysteresis?: number;
    captainDistressSeverity?: number;
    /** Fuel burn rate in tons per second of sim time (client multiplies by frame `dt`; API tick uses 1s steps). */
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

/** Tons per second while underway (`FUEL_TONS_PER_SIM_STEP * dt` per animation frame). Default tuned for visible transit without instant empty tanks. */
export const FUEL_TONS_PER_SIM_STEP =
  fleetConfig.operationalRules?.fuelTonsPerSimStep ?? 0.35;

