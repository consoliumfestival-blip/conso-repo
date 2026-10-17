export const calculateGrade = (totalMark: number, maxMark: number): string | null => {
  if (maxMark <= 0) return null;
  const pct = (totalMark / maxMark) * 100;
  
  if (pct >= 90) return 'A+';
  if (pct >= 75) return 'A';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  return null;
};

export const calculatePoints = (
  grade: string | null,
  rank: number | null,
  isGroup: boolean = false,
  config?: any
): number => {
  let points = 0;

  // Use config values or defaults
  const rankPoints = [
    config?.rank_1_points ?? 5,
    config?.rank_2_points ?? 3,
    config?.rank_3_points ?? 1
  ];

  // Position Points
  if (rank === 1) points += rankPoints[0];
  else if (rank === 2) points += rankPoints[1];
  else if (rank === 3) points += rankPoints[2];

  // If no grade, no points for participation
  if (!grade || grade === '-') return points;

  // Grade points based on Individual or Group
  let gPoints = [0, 0, 0, 0]; // [A+, A, B, C]
  if (isGroup) {
    gPoints = [
      config?.grp_a_plus_points ?? 18,
      config?.grp_a_points ?? 15,
      config?.grp_b_points ?? 10,
      config?.grp_c_points ?? 5
    ];
  } else {
    gPoints = [
      config?.ind_a_plus_points ?? 6,
      config?.ind_a_points ?? 5,
      config?.ind_b_points ?? 3,
      config?.ind_c_points ?? 1
    ];
  }

  const gIndex = grade === 'A+' ? 0 : grade === 'A' ? 1 : grade === 'B' ? 2 : grade === 'C' ? 3 : -1;

  if (gIndex !== -1) {
    points += gPoints[gIndex];
  }

  return points;
};
