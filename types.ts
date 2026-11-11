// Shared domain types for the Real or Fake quiz.

export type QuestionMode = 1 | 2 | 3 | 4;

export interface QuizMedia {
  id: string;
  src: string;
}

export interface QuestionBase {
  id: string;
  level: number;
  explanation: string;
  timer?: number;
  images: QuizMedia[];
}

export type Question =
  | (QuestionBase & { mode: 1; answer: "real" | "fake" })
  | (QuestionBase & { mode: 2; answer: string })
  | (QuestionBase & { mode: 3; answer: string })
  | (QuestionBase & { mode: 4; answer: string[] });

export interface Fact {
  id: string;
  type: "hint" | "fact" | "incident";
  unlockedAtLevel: number;
  title: string;
  body: string;
  source?: string;
  teaser?: boolean;
}

export interface SecretFragment {
  id: string;
  type: string;
  fragmentIndex?: number;
  title: string;
  body: string;
  source?: string;
}

export type InterludeItem =
  | { kind: "note"; data: SecretFragment }
  | { kind: "fact"; data: Fact }
  | { kind: "complete" };
