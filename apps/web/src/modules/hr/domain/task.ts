export interface Task {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assigneeId: string | null;
  internalOrderId: string | null;
  startDate: string | null;
  dueDate: string | null;
  estimatedHours: string | null;
  actualHours: string | null;
  progress: number;
  /** Solo presentes en tareas ya programadas (vista Gantt). */
  startAt?: string | null;
  endAt?: string | null;
  [key: string]: unknown;
}

export interface GanttResponse {
  tasks: Task[];
  [key: string]: unknown;
}
