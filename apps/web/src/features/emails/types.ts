export type EmailListItem = {
  id: string;
  sequence: string;
  title: string;
  subject: string | null;
  preheader: string | null;
  send_timing: string | null;
  stage: string | null;
  sort_order: number;
  language: string;
};

export type EmailDetail = EmailListItem & {
  slug: string;
  original_html: string;
};

export type EmailAnalysis = {
  summary: string;
  score: number;
  verdict: EmailAnalysisVerdict;
  checks: EmailAnalysisChecks;
  recommendations: EmailRecommendation[];
};

export type EmailAnalysisVerdict = "ready" | "minor_fixes" | "needs_work";

export type EmailAnalysisCheckStatus = "good" | "weak" | "bad";

export type EmailAnalysisChecks = {
  subject: EmailAnalysisCheckStatus;
  preheader: EmailAnalysisCheckStatus;
  focus: EmailAnalysisCheckStatus;
  cta: EmailAnalysisCheckStatus;
  stage_alignment: EmailAnalysisCheckStatus;
  readability: EmailAnalysisCheckStatus;
};

export type EmailAnalysisStreamEvent =
  | {
    type: "delta";
    text: string;
  }
  | {
    type: "done";
  }
  | {
    type: "error";
    message: string;
  };

export type EmailAnalysisStreamState = {
  status: "idle" | "streaming" | "done" | "error";
  text: string;
  error: string | null;
};

export type EmailRecommendation = {
  priority: "high" | "medium" | "low";
  title: string;
  details: string;
};

export type EmailVersionGroup = {
  key: string;
  stage: string;
  sortOrder: number;
  versions: EmailListItem[];
};

export type StageColumn = {
  stage: string;
  title: string;
  sortOrder: number;
  emailGroups: EmailVersionGroup[];
};
