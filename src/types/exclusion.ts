export type ExclusionKind = "app" | "domain" | "title_glob";

export interface Exclusion {
  id: number | null;
  kind: ExclusionKind;
  value: string;
  note: string | null;
}
