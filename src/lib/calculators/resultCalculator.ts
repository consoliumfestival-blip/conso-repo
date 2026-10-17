import { PointsConfig } from '../../types';

export interface MarkEntry {
  judgeId: string;
  criteriaScores: Record<string, number>;
  totalMark: number;
  isFinal: boolean;
}

export interface CalculatedResult {
  registrationId: string;
  averageScore: number;
  rank: number | null;  // null if gradeOnly
  grade: string;        // A+/A/B/C
  pointsAwarded: number;
  gradeOnly: boolean;   // < 3 teams rule
}

export class ResultCalculator {

  // Grade calculation
  static getGrade(score: number): string {
    if (score >= 90) return 'A+';
    if (score >= 75) return 'A';
    if (score >= 60) return 'B';
    if (score >= 50) return 'C';
    return 'D'; // Not eligible for certificate
  }

  // 3 judges average
  static calculateAverage(markEntries: MarkEntry[]): number {
    const finalEntries = markEntries.filter(e => e.isFinal);
    if (finalEntries.length < 3) {
      throw new Error('3 judges final submission ആവശ്യം (Handbook Rule)');
    }
    const total = finalEntries.reduce((sum, e) => sum + e.totalMark, 0);
    return total / finalEntries.length;
  }

  // Rank calculation with tie-break
  static calculateRanks(
    scores: Array<{ registrationId: string; averageScore: number; criteriaScores: Record<string, number> }>,
    pointsConfig: PointsConfig,
    majorCriteriaName: string = 'content'
  ): CalculatedResult[] {
    
    // Rule 12: < 3 teams → grade only
    const gradeOnly = scores.length < 3;

    // Sort by average score DESC
    const sorted = [...scores].sort((a, b) => {
      if (b.averageScore !== a.averageScore) {
        return b.averageScore - a.averageScore;
      }
      // Tie-break: major criteria (content/presentation)
      const aMajor = a.criteriaScores[majorCriteriaName] || 0;
      const bMajor = b.criteriaScores[majorCriteriaName] || 0;
      return bMajor - aMajor;
    });

    return sorted.map((entry, index) => {
      const rank = gradeOnly ? null : index + 1;
      const grade = this.getGrade(entry.averageScore);
      
      let pointsAwarded = 0;
      if (gradeOnly) {
        // Grade points only
        pointsAwarded = this.getGradePoints(grade, pointsConfig);
      } else {
        // Position points
        if (rank === 1) pointsAwarded = pointsConfig.rank_1_points;
        else if (rank === 2) pointsAwarded = pointsConfig.rank_2_points;
        else if (rank === 3) pointsAwarded = pointsConfig.rank_3_points;
        else pointsAwarded = this.getGradePoints(grade, pointsConfig);
      }

      return {
        registrationId: entry.registrationId,
        averageScore: entry.averageScore,
        rank,
        grade,
        pointsAwarded,
        gradeOnly
      };
    });
  }

  static getGradePoints(grade: string, config: PointsConfig): number {
    switch (grade) {
      case 'A+': return config.grade_a_plus_points;
      case 'A': return config.grade_a_points;
      case 'B': return config.grade_b_points;
      case 'C': return config.grade_c_points;
      default: return 0;
    }
  }
}
