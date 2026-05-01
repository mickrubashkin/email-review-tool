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
  recommendations: EmailRecommendation[];
};

export type EmailRecommendation = {
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
