export type EmailListItem = {
  id: string;
  sequence: string;
  title: string;
  subject: string | null;
  preheader: string | null;
  stage: string | null;
  sort_order: number;
  language: string;
};

export type EmailDetail = EmailListItem & {
  slug: string;
  original_html: string;
};

export type StageColumn = {
  stage: string;
  title: string;
  sortOrder: number;
  emails: EmailListItem[];
};
