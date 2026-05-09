import type { FleetThreatShip } from "../data/threats";

export type ThreatSeverity = "SAFE" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ThreatAnalysis = {
  extractedIssue: string;
  severity: ThreatSeverity;
  severityScore: number; // 0-100
  weatherRisk: number; // 0-30
  redZoneRisk: number; // 0-30
  fuelRisk: number; // 0-30
  overallThreatLevel: string;
  recommendation: string;
  signals: string[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function includesAny(haystack: string, needles: string[]) {
  const s = haystack.toLowerCase();
  return needles.some((n) => s.includes(n));
}

function weatherRiskScore(condition: FleetThreatShip["weatherCondition"]) {
  switch (condition) {
    case "Thunderstorm":
      return { score: 26, label: "Thunderstorm" };
    case "Gale":
      return { score: 20, label: "Gale-force winds" };
    case "Sandstorm":
      return { score: 22, label: "Sandstorm (low visibility)" };
    case "HeavyRain":
      return { score: 16, label: "Heavy rain" };
    case "Fog":
      return { score: 14, label: "Fog (reduced visibility)" };
    case "Overcast":
      return { score: 6, label: "Overcast" };
    case "Clear":
      return { score: 2, label: "Clear" };
  }
}

function fuelRiskScore(fuelLevel: number) {
  if (fuelLevel <= 10) return { score: 26, label: "Critical fuel" };
  if (fuelLevel < 20) return { score: 20, label: "Low fuel" };
  if (fuelLevel < 35) return { score: 11, label: "Fuel trending low" };
  return { score: 3, label: "Fuel OK" };
}

function issueFromMessage(message: string): {
  issue: string;
  score: number;
  signals: string[];
} {
  const s = message.toLowerCase();
  const signals: string[] = [];
  let issue = "Operational anomaly";
  let score = 10;

  const critical = ["fire", "smoke", "explosion", "mayday", "engine room"];
  const high = [
    "injured",
    "flood",
    "flooding",
    "leak",
    "breach",
    "hostile",
    "jamming",
    "drone",
  ];
  const medium = [
    "navigation",
    "autopilot",
    "steering",
    "radar",
    "comms",
    "interference",
    "power fluctuation",
  ];

  if (includesAny(s, critical)) {
    issue = "Fire / smoke incident";
    score = 44;
    signals.push("Thermal/smoke indicators");
  }
  if (includesAny(s, ["explosion"])) {
    issue = "Explosion risk";
    score = Math.max(score, 55);
    signals.push("Blast hazard");
  }
  if (includesAny(s, ["injured", "crew member", "crew"])) {
    issue = issue.includes("Fire") ? "Fire with crew injury" : "Crew injury reported";
    score = Math.max(score, 34);
    signals.push("Medical emergency");
  }
  if (includesAny(s, ["flood", "flooding"])) {
    issue = "Flooding / hull integrity";
    score = Math.max(score, 40);
    signals.push("Water ingress");
  }
  if (includesAny(s, ["leak", "leakage"])) {
    issue = "Leak detected (fuel/chemical)";
    score = Math.max(score, 32);
    signals.push("Hazmat containment");
  }
  if (includesAny(s, ["hostile", "shadowed", "fast craft", "unidentified"])) {
    issue = "Security threat (contact proximity)";
    score = Math.max(score, 38);
    signals.push("Security escalation");
  }
  if (includesAny(s, ["jamming", "interference"])) {
    issue = "Electronic interference / comms disruption";
    score = Math.max(score, 26);
    signals.push("Comms degradation");
  }
  if (includesAny(s, ["navigation", "autopilot", "steering"])) {
    issue = "Navigation / steering instability";
    score = Math.max(score, 22);
    signals.push("Control surface risk");
  }
  if (includesAny(s, ["temperature", "overheat", "cooling"])) {
    issue = "Engine thermal risk";
    score = Math.max(score, 28);
    signals.push("Propulsion stress");
  }

  // If message contains medium indicators only, bump slightly
  if (score <= 12 && includesAny(s, medium)) {
    issue = "Systems anomaly (navigation/comms)";
    score = 18;
    signals.push("Systems diagnostics");
  }
  // If message contains high indicators only, bump appropriately
  if (score <= 18 && includesAny(s, high)) {
    issue = "Operational hazard (reported)";
    score = 28;
    signals.push("Hazard escalation");
  }

  return { issue, score, signals };
}

function severityFromScore(score: number): ThreatSeverity {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 35) return "MEDIUM";
  return "SAFE";
}

function recommendationFor(
  ship: FleetThreatShip,
  analysis: { severity: ThreatSeverity; issue: string }
) {
  const rec: string[] = [];

  if (analysis.severity === "CRITICAL") {
    rec.push("Activate emergency response protocol.");
    rec.push("Prepare immediate reroute to nearest safe port.");
  } else if (analysis.severity === "HIGH") {
    rec.push("Issue safety advisory and controlled speed reduction.");
    rec.push("Evaluate reroute to avoid highest-risk corridor.");
  } else if (analysis.severity === "MEDIUM") {
    rec.push("Increase monitoring cadence and run diagnostics.");
  } else {
    rec.push("Maintain course; continue telemetry monitoring.");
  }

  if (ship.nearRestrictedZone)
    rec.push("Increase standoff distance from restricted zones.");
  if (ship.fuelLevel < 20) rec.push("Initiate fuel contingency plan (divert/refuel).");

  if (ship.weatherCondition === "Thunderstorm" || ship.weatherCondition === "Gale") {
    rec.push("Adjust route for weather avoidance and reduce deck load exposure.");
  }

  if (analysis.issue.includes("Leak"))
    rec.push("Verify containment seals and isolate affected compartment.");
  if (analysis.issue.includes("Fire"))
    rec.push("Deploy onboard suppression; isolate ventilation and power feeds.");
  if (analysis.issue.includes("Security"))
    rec.push("Maintain separation, enable secure comms, and request escort if available.");

  return rec.join(" ");
}

export function analyzeThreat(ship: FleetThreatShip): ThreatAnalysis {
  const issue = issueFromMessage(ship.captainMessage ?? "");
  const weather = weatherRiskScore(ship.weatherCondition);
  const fuel = fuelRiskScore(ship.fuelLevel);
  const redZoneRisk = ship.nearRestrictedZone ? 22 : 3;

  const scoreRaw =
    issue.score +
    weather.score * 0.8 +
    fuel.score * 0.9 +
    redZoneRisk * 0.9 +
    (ship.status === "distressed" ? 12 : 0) +
    (ship.status === "stranded" || ship.status === "out_of_fuel" ? 18 : 0);

  const severityScore = clamp(Math.round(scoreRaw), 0, 100);
  const severity = severityFromScore(severityScore);

  const signals = [
    ...issue.signals,
    ship.nearRestrictedZone ? "Restricted-zone proximity" : null,
    weather.score >= 16 ? "Adverse weather conditions" : null,
    ship.fuelLevel < 20 ? "Fuel below safety threshold" : null,
  ].filter(Boolean) as string[];

  const overallThreatLevel =
    severity === "CRITICAL"
      ? "Fleet-critical incident"
      : severity === "HIGH"
        ? "High-risk operational threat"
        : severity === "MEDIUM"
          ? "Elevated risk"
          : "Stable";

  return {
    extractedIssue: issue.issue,
    severity,
    severityScore,
    weatherRisk: clamp(weather.score, 0, 30),
    redZoneRisk: clamp(redZoneRisk, 0, 30),
    fuelRisk: clamp(fuel.score, 0, 30),
    overallThreatLevel,
    recommendation: recommendationFor(ship, { severity, issue: issue.issue }),
    signals,
  };
}

