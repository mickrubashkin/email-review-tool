import type { EditableField, EditableFields } from "../types";

export type EditorFormState = {
  title: string;
  subject: string;
  preheader: string;
  editableFields: EditableFields;
  originalHTML: string;
};

export type FieldGroup = {
  key: string;
  fields: [string, EditableField][];
};
