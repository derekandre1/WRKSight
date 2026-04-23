export type GoalDirection = "increase" | "decrease";

export type GoalTargetKind =
  | "category"
  | "project"
  | "strategic"
  | "reactive";

export interface Goal {
  id: number | null;
  label: string;
  direction: GoalDirection;
  target_kind: GoalTargetKind;
  target_value: string | null;
  target_hours: number | null;
  active: boolean;
  created_at: number;
}

export type GoalAlignmentStatus =
  | "ahead"
  | "on_track"
  | "behind"
  | "unknown";

export interface GoalAlignmentResult {
  goal: Goal;
  actual_hours: number;
  status: GoalAlignmentStatus;
  note: string;
}
