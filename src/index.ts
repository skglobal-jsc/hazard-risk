/**
 * Hazard Risk Analysis Library
 * A simple TypeScript library for testing publish, build, and test
 */

/**
 * Calculate simple risk score
 * @param probability - Probability of hazard (0-1)
 * @param severity - Severity level (1-10)
 * @returns Risk score and level
 */
export function calculateRisk(
  probability: number,
  severity: number
): {
  score: number;
  level: string;
} {
  const riskScore = probability * severity;

  let level: string;
  if (riskScore <= 2) {
    level = 'LOW';
  } else if (riskScore <= 5) {
    level = 'MEDIUM';
  } else if (riskScore <= 8) {
    level = 'HIGH';
  } else {
    level = 'CRITICAL';
  }

  return {
    score: riskScore,
    level,
  };
}

/**
 * Simple greeting function for testing
 * @param name - Name to greet
 * @returns Greeting message
 */
export function greet(name: string): string {
  return `Hello ${name} from hazard-risk!`;
}
