/**
 * Lightweight keyword / pattern scoring for command directive text.
 * Used to derive operational severity hints and merge into fleet threat analysis.
 */

export type CommandNlpDistress = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type CommandNlpResult = {
  level: CommandNlpDistress;
  risk: number;
  keywords: string[];
  summary: string;
};

type Pattern = { re: RegExp; weight: number; tag: string };

const ESCALATION: Pattern[] = [
  { re: /\bmayday\b/i, weight: 55, tag: "mayday" },
  { re: /\bpan[\s-]*pan\b/i, weight: 48, tag: "pan-pan" },
  { re: /\babandon\s+ship\b/i, weight: 55, tag: "abandon-ship" },
  { re: /\bsink(?:ing)?\b/i, weight: 50, tag: "sinking" },
  { re: /\bcapsiz/i, weight: 50, tag: "capsize" },
  { re: /\b(?:mass\s+)?casualt/i, weight: 42, tag: "casualties" },
  { re: /\bman\s+overboard\b/i, weight: 45, tag: "MOB" },
  { re: /\b(?:on\s*board\s*)?(?:fire|smoke)\b/i, weight: 48, tag: "fire/smoke" },
  { re: /\bexplosion\b/i, weight: 48, tag: "explosion" },
  { re: /\bflood(?:ing)?\b/i, weight: 38, tag: "flooding" },
  { re: /\btaking\s+water\b/i, weight: 40, tag: "taking-water" },
  { re: /\bloss\s+of\s+(?:steer|propulsion|power)\b/i, weight: 40, tag: "propulsion-loss" },
  { re: /\ball\s+engines?\s+(?:down|failed|lost)\b/i, weight: 42, tag: "engines-down" },
  { re: /\bmedical\s+emergency\b/i, weight: 36, tag: "medical-emergency" },
  { re: /\bevac(?:uation)?\b/i, weight: 28, tag: "evacuation" },
  { re: /\bcollision\b/i, weight: 38, tag: "collision" },
  { re: /\bimminent\b/i, weight: 18, tag: "imminent" },
  { re: /\bhostile\b/i, weight: 40, tag: "hostile" },
  { re: /\bpiracy\b|\bboarding\b/i, weight: 42, tag: "security" },
  { re: /\bweapons?\s+(?:free|hot|tight)\b/i, weight: 35, tag: "weapons" },
  { re: /\bmissile\b|\btorpedo\b/i, weight: 50, tag: "incoming" },
  { re: /\ball\s+stop\b|\bhove\s+to\b/i, weight: 22, tag: "full-stop" },
  { re: /\bdivert\s+immediately\b/i, weight: 32, tag: "divert-now" },
  { re: /\bprepare\s+to\s+abandon\b/i, weight: 45, tag: "prep-abandon" },
  { re: /\b(?:life)?rafts?\b/i, weight: 25, tag: "liferafts" },
  { re: /\b(?:critical|grave)\s+(?:danger|situation)\b/i, weight: 35, tag: "critical-situation" },
  { re: /\b(?:red\s+alert|battle\s+stations)\b/i, weight: 38, tag: "battle-posture" },
];

const MODERATE: Pattern[] = [
  { re: /\bhold\s+position\b/i, weight: 14, tag: "hold-position" },
  { re: /\balter\s+course\b/i, weight: 12, tag: "alter-course" },
  { re: /\bincrease\s+vigilance\b/i, weight: 14, tag: "vigilance" },
  { re: /\binspection\b|\bboarding\s+team\b/i, weight: 12, tag: "inspection" },
  { re: /\bconvoy\b|\bescort\b/i, weight: 12, tag: "escort" },
  { re: /\breport\s+every\b/i, weight: 10, tag: "tight-reporting" },
  { re: /\bsevere\s+weather\b|\bstorm\s+avoid/i, weight: 18, tag: "weather-ops" },
  { re: /\breduce\s+speed\b/i, weight: 10, tag: "reduce-speed" },
];

const DE_ESCALATE: Pattern[] = [
  { re: /\bstand\s+down\b/i, weight: -30, tag: "stand-down" },
  { re: /\ball\s+clear\b/i, weight: -28, tag: "all-clear" },
  { re: /\bcancel\s+(?:the\s+)?(?:alert|directive)\b/i, weight: -25, tag: "cancel-alert" },
  { re: /\broutine\b|\bno\s+immediate\b/i, weight: -15, tag: "routine" },
  { re: /\bresume\s+normal\b/i, weight: -20, tag: "resume-normal" },
];

function levelFromScore(score: number): CommandNlpDistress {
  if (score >= 44) return "CRITICAL";
  if (score >= 28) return "HIGH";
  if (score >= 12) return "MEDIUM";
  return "LOW";
}

/**
 * Score title + instruction for command-side keywords (English, case-insensitive).
 */
export function analyzeCommandDirectiveText(
  title: string,
  instruction: string
): CommandNlpResult {
  const text = `${title}\n${instruction}`.trim();
  if (!text) {
    return {
      level: "LOW",
      risk: 0,
      keywords: [],
      summary: "No directive text",
    };
  }

  const keywords: string[] = [];
  let score = 0;

  const apply = (patterns: Pattern[]) => {
    for (const { re, weight, tag } of patterns) {
      if (re.test(text)) {
        score += weight;
        keywords.push(tag);
      }
    }
  };

  apply(ESCALATION);
  apply(MODERATE);
  apply(DE_ESCALATE);

  score = Math.max(0, Math.min(60, score));
  const level = levelFromScore(score);
  const unique = [...new Set(keywords)];

  const summary =
    unique.length === 0
      ? "No strong command keywords — treated as routine directive"
      : `Command language: ${unique.slice(0, 6).join(", ")}${unique.length > 6 ? "…" : ""}`;

  return {
    level,
    risk: Math.min(50, Math.round(score * 0.85)),
    keywords: unique,
    summary,
  };
}

export function distressRank(a: CommandNlpDistress): number {
  switch (a) {
    case "LOW":
      return 0;
    case "MEDIUM":
      return 1;
    case "HIGH":
      return 2;
    case "CRITICAL":
      return 3;
    default:
      return 0;
  }
}

export function maxDistress(
  a: CommandNlpDistress,
  b: CommandNlpDistress
): CommandNlpDistress {
  return distressRank(a) >= distressRank(b) ? a : b;
}
