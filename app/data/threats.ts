export type ShipStatus =
  | "normal"
  | "rerouting"
  | "distressed"
  | "stopped"
  | "stranded"
  | "insufficient_fuel"
  | "arrived"
  | "out_of_fuel";

export type WeatherCondition =
  | "Clear"
  | "Overcast"
  | "Fog"
  | "HeavyRain"
  | "Thunderstorm"
  | "Gale"
  | "Sandstorm";

export type FleetThreatShip = {
  id: string;
  shipName: string;
  captainMessage: string;
  weatherCondition: WeatherCondition;
  nearRestrictedZone: boolean;
  fuelLevel: number; // %
  speed: number; // knots
  cargo: string;
  destination: string;
  status: ShipStatus;
};

// Exactly 15 ships (fixed)
export const fleetThreats: FleetThreatShip[] = [
  {
    id: "MV-1",
    shipName: "Atlas-1",
    captainMessage:
      "Heavy smoke detected near engine room. Two crew members injured. Requesting immediate guidance.",
    weatherCondition: "Thunderstorm",
    nearRestrictedZone: true,
    fuelLevel: 44,
    speed: 13.2,
    cargo: "Consumer electronics",
    destination: "Jebel Ali",
    status: "distressed",
  },
  {
    id: "MV-2",
    shipName: "Neptune-4",
    captainMessage:
      "Navigation systems malfunctioning during storm conditions. Autopilot intermittently dropping.",
    weatherCondition: "Gale",
    nearRestrictedZone: false,
    fuelLevel: 28,
    speed: 15.1,
    cargo: "Medical supplies",
    destination: "Dubai",
    status: "rerouting",
  },
  {
    id: "MV-3",
    shipName: "Horizon-9",
    captainMessage:
      "Hostile vessel detected nearby. Maintaining distance but being shadowed. Awaiting Command directive.",
    weatherCondition: "Overcast",
    nearRestrictedZone: true,
    fuelLevel: 61,
    speed: 16.8,
    cargo: "Automotive parts",
    destination: "Muscat",
    status: "distressed",
  },
  {
    id: "MV-4",
    shipName: "Triton-6",
    captainMessage:
      "Minor fuel leakage detected in lower cargo deck. Containment measures active; monitoring levels.",
    weatherCondition: "Fog",
    nearRestrictedZone: false,
    fuelLevel: 19,
    speed: 12.4,
    cargo: "Crude oil",
    destination: "Fujairah",
    status: "insufficient_fuel",
  },
  {
    id: "MV-5",
    shipName: "Orion-3",
    captainMessage:
      "Severe turbulence and unstable cargo containers. Need speed reduction approval to secure load.",
    weatherCondition: "HeavyRain",
    nearRestrictedZone: false,
    fuelLevel: 52,
    speed: 14.0,
    cargo: "Mixed containers",
    destination: "Doha",
    status: "normal",
  },
  {
    id: "MV-6",
    shipName: "Aegis-12",
    captainMessage:
      "Engine temperature rising above threshold. Cooling system under stress; no visible flames.",
    weatherCondition: "Overcast",
    nearRestrictedZone: true,
    fuelLevel: 36,
    speed: 13.7,
    cargo: "Industrial chemicals",
    destination: "Kuwait City",
    status: "rerouting",
  },
  {
    id: "MV-7",
    shipName: "Mariner-8",
    captainMessage:
      "Radar interference and intermittent comms. Suspect electronic jamming. Requesting comms protocol.",
    weatherCondition: "Clear",
    nearRestrictedZone: true,
    fuelLevel: 73,
    speed: 17.4,
    cargo: "Food & perishables",
    destination: "Manama",
    status: "distressed",
  },
  {
    id: "MV-8",
    shipName: "Leviathan-2",
    captainMessage:
      "Flooding reported in aft compartment. Pumps running but water level not stabilizing.",
    weatherCondition: "HeavyRain",
    nearRestrictedZone: false,
    fuelLevel: 47,
    speed: 11.9,
    cargo: "Steel coils",
    destination: "Basra",
    status: "distressed",
  },
  {
    id: "MV-9",
    shipName: "Calypso-5",
    captainMessage:
      "Crew reports suspicious drones overhead. No contact yet. Maintaining course per plan.",
    weatherCondition: "Clear",
    nearRestrictedZone: true,
    fuelLevel: 66,
    speed: 16.0,
    cargo: "Telecom equipment",
    destination: "Abu Dhabi",
    status: "normal",
  },
  {
    id: "MV-10",
    shipName: "Poseidon-7",
    captainMessage:
      "Steering response lag detected. Manual override engaged. Request diagnostic checklist from Command.",
    weatherCondition: "Fog",
    nearRestrictedZone: false,
    fuelLevel: 33,
    speed: 12.8,
    cargo: "Construction materials",
    destination: "Sharjah",
    status: "rerouting",
  },
  {
    id: "MV-11",
    shipName: "Vanguard-11",
    captainMessage:
      "Unidentified fast craft approaching. Maintaining safe distance. Security team on standby.",
    weatherCondition: "Overcast",
    nearRestrictedZone: true,
    fuelLevel: 58,
    speed: 18.2,
    cargo: "High-value electronics",
    destination: "Ras Al Khaimah",
    status: "distressed",
  },
  {
    id: "MV-12",
    shipName: "Sirocco-14",
    captainMessage:
      "Sandstorm reduced visibility to near-zero. Holding steady speed; requesting alternate waypoint.",
    weatherCondition: "Sandstorm",
    nearRestrictedZone: false,
    fuelLevel: 25,
    speed: 10.5,
    cargo: "Pharmaceuticals",
    destination: "Salalah",
    status: "rerouting",
  },
  {
    id: "MV-13",
    shipName: "Nereid-10",
    captainMessage:
      "Cargo bay sensor anomaly. Possible temperature spike; investigating. No smoke observed.",
    weatherCondition: "Overcast",
    nearRestrictedZone: false,
    fuelLevel: 41,
    speed: 14.6,
    cargo: "Refrigerated goods",
    destination: "Dammam",
    status: "normal",
  },
  {
    id: "MV-14",
    shipName: "Aurora-13",
    captainMessage:
      "Power fluctuations affecting navigation lights. Backup generator stable. Monitoring grid load.",
    weatherCondition: "Clear",
    nearRestrictedZone: false,
    fuelLevel: 82,
    speed: 17.0,
    cargo: "Textiles",
    destination: "Karachi",
    status: "normal",
  },
  {
    id: "MV-15",
    shipName: "Helios-15",
    captainMessage:
      "Fuel levels trending low due to headwinds. Can proceed but may require refuel contingency.",
    weatherCondition: "Gale",
    nearRestrictedZone: false,
    fuelLevel: 14,
    speed: 13.9,
    cargo: "Agriculture equipment",
    destination: "Port Qasim",
    status: "insufficient_fuel",
  },
];

