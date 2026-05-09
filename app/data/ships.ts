export type ShipWeatherCondition = "clear" | "storm" | "rain" | "fog";

export type ShipIntel = {
  id: string;
  shipName: string;
  captainMessage: string;
  weatherCondition: ShipWeatherCondition;
  nearRedZone: boolean;
  fuelLevel: number;
  cargo: string;
  status: string;
};

/** Mock fleet intelligence feed for the Threats panel (independent of live map DB). */
export const fleetShipsIntel: ShipIntel[] = [
  {
    id: "MV-1",
    shipName: "MV Aurora",
    captainMessage:
      "Smoke reported from engine compartment. Investigating possible fire source. Crew standing by.",
    weatherCondition: "storm",
    nearRedZone: true,
    fuelLevel: 18,
    cargo: "Crude oil",
    status: "distressed",
  },
  {
    id: "MV-2",
    shipName: "MV Borealis",
    captainMessage:
      "Two crew injured during heavy roll. Medical bay active. No structural damage reported.",
    weatherCondition: "storm",
    nearRedZone: false,
    fuelLevel: 42,
    cargo: "Containers",
    status: "active",
  },
  {
    id: "MV-3",
    shipName: "MV Cygnus",
    captainMessage:
      "Minor delay in convoy slot; ETA revised +4h. All systems nominal.",
    weatherCondition: "clear",
    nearRedZone: false,
    fuelLevel: 78,
    cargo: "LNG",
    status: "active",
  },
  {
    id: "MV-4",
    shipName: "MV Dragon",
    captainMessage:
      "Flooding in void space forward of frame 40. Pumps running. Requesting routing advice.",
    weatherCondition: "rain",
    nearRedZone: true,
    fuelLevel: 33,
    cargo: "Bulk grain",
    status: "distressed",
  },
  {
    id: "MV-5",
    shipName: "MV Emerald",
    captainMessage:
      "Fuel leak detected in manifold. Containment in progress. Reduced speed 8 knots.",
    weatherCondition: "fog",
    nearRedZone: false,
    fuelLevel: 55,
    cargo: "Chemicals",
    status: "restricted",
  },
  {
    id: "MV-6",
    shipName: "MV Falcon",
    captainMessage:
      "Engine vibration above normal. Chief engineer assessing. Holding course 095.",
    weatherCondition: "clear",
    nearRedZone: false,
    fuelLevel: 61,
    cargo: "Automotive",
    status: "active",
  },
  {
    id: "MV-7",
    shipName: "MV Gharial",
    captainMessage:
      "Explosion sound reported port quarter — likely weather-related. Visual sweep negative.",
    weatherCondition: "storm",
    nearRedZone: true,
    fuelLevel: 12,
    cargo: "Crude oil",
    status: "distressed",
  },
  {
    id: "MV-8",
    shipName: "MV Halcyon",
    captainMessage:
      "Navigation issue — GPS intermittent in jamming corridor. Using INS backup.",
    weatherCondition: "fog",
    nearRedZone: true,
    fuelLevel: 48,
    cargo: "Machinery",
    status: "rerouting",
  },
  {
    id: "MV-9",
    shipName: "MV Iris",
    captainMessage:
      "Routine sitrep: convoy position nominal. Minor issue with fresh water maker offline.",
    weatherCondition: "rain",
    nearRedZone: false,
    fuelLevel: 88,
    cargo: "General cargo",
    status: "active",
  },
  {
    id: "MV-10",
    shipName: "MV Jade",
    captainMessage:
      "All clear. Requesting permission to transit nearest lane for fuel optimization.",
    weatherCondition: "clear",
    nearRedZone: false,
    fuelLevel: 22,
    cargo: "Containers",
    status: "active",
  },
];
