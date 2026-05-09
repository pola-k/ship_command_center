import type { ShipIntel } from "../data/ships";

export type DistressLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ShipThreatAnalysis = {
  extractedIssue: string;
  distressLevel: DistressLevel;
  severityScore: number;
  weatherRisk: number;
  redZoneRisk: number;
  fuelRisk: number;
  overallRisk: number;
  recommendation: string;
};

function clamp100(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function messageDistress(msg: string): {
  level: DistressLevel;
  extractedIssue: string;
  messageRisk: number;
} {
  const s = msg.toLowerCase();

  if (
    s.includes("fire") ||
    s.includes("smoke") ||
    s.includes("explosion")
  ) {
    return {
      level: "CRITICAL",
      extractedIssue: "Fire, smoke, or explosion signal in captain report",
      messageRisk: 40,
    };
  }
  if (s.includes("injured") || s.includes("flooding") || s.includes("leak")) {
    return {
      level: "HIGH",
      extractedIssue: "Casualty, flooding, or leak reported",
      messageRisk: 28,
    };
  }
  if (s.includes("engine") || s.includes("navigation issue")) {
    return {
      level: "MEDIUM",
      extractedIssue: "Engine or navigation degradation reported",
      messageRisk: 14,
    };
  }
  if (s.includes("delay") || s.includes("minor issue")) {
    return {
      level: "LOW",
      extractedIssue: "Delay or minor operational issue",
      messageRisk: 6,
    };
  }

  return {
    level: "LOW",
    extractedIssue: "No keyword match — routine / ambiguous report",
    messageRisk: 8,
  };
}

function weatherRiskPoints(condition: ShipIntel["weatherCondition"]): number {
  switch (condition) {
    case "storm":
      return 30;
    case "fog":
      return 15;
    case "rain":
      return 10;
    case "clear":
    default:
      return 0;
  }
}

function redZonePoints(near: boolean): number {
  return near ? 25 : 0;
}

function fuelRiskPoints(fuel: number): number {
  if (fuel < 20) return 30;
  if (fuel <= 50) return 15;
  return 0;
}

function recommendationFor(
  level: DistressLevel,
  nearRed: boolean,
  fuel: number
): string {
  if (level === "CRITICAL") {
    return "Declare full crisis posture: coordinate SAR, fire parties, and nearest coalition assets. Broadcast on distress guard.";
  }
  if (level === "HIGH") {
    return "Vector medical and damage-control support; reduce sea state exposure; prep helicopter evacuation if injuries worsen.";
  }
  if (level === "MEDIUM") {
    return "Hold escorted formation; log engineering defects; authorize reduced speed until fault cleared.";
  }
  if (nearRed || fuel < 25) {
    return "Monitor restricted-zone boundary and fuel closely; pre-approve alternate holding pattern.";
  }
  return "Continue scheduled reporting; no immediate command intervention required.";
}

/**
 * Rule-based “AI” threat scoring for one ship intelligence record.
 */
export function analyzeShipThreat(ship: ShipIntel): ShipThreatAnalysis {
  const { level, extractedIssue, messageRisk } = messageDistress(
    ship.captainMessage
  );
  const weatherRisk = weatherRiskPoints(ship.weatherCondition);
  const redZoneRisk = redZonePoints(ship.nearRedZone);
  const fuelRisk = fuelRiskPoints(ship.fuelLevel);

  const raw = messageRisk + weatherRisk + redZoneRisk + fuelRisk;
  const overallRisk = clamp100(raw);
  const severityScore = overallRisk;

  return {
    extractedIssue,
    distressLevel: level,
    severityScore,
    weatherRisk,
    redZoneRisk,
    fuelRisk,
    overallRisk,
    recommendation: recommendationFor(level, ship.nearRedZone, ship.fuelLevel),
  };
}
