export interface EvaluationCycle {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'draft' | 'active' | 'closed';
  [key: string]: unknown;
}

export interface Competency {
  id: string;
  code: string;
  name: string;
  weight: string;
  scaleMax: number;
  isActive: boolean;
  [key: string]: unknown;
}

export interface EvaluationScore {
  competencyId: string;
  scoreSelf?: number;
  scoreManager?: number;
  comments?: string;
  [key: string]: unknown;
}

export interface Evaluation {
  id: string;
  cycleId: string;
  employeeId: string;
  managerId: string | null;
  status: 'pending' | 'self_done' | 'manager_done' | 'closed';
  finalScore: string | null;
  scores?: EvaluationScore[];
  [key: string]: unknown;
}

export interface Objective {
  id: string;
  employeeId: string;
  cycleId: string | null;
  title: string;
  description: string | null;
  targetMetric: string | null;
  targetValue: string | null;
  achievedValue: string | null;
  weight: string | null;
  status: 'pending' | 'in_progress' | 'achieved' | 'missed';
  dueDate: string | null;
  [key: string]: unknown;
}
