import { Placeholder } from "./Placeholder";
import type { ReportContentType } from "../api/types";

export interface ReportDialogProps {
  open: boolean;
  content_type: ReportContentType;
  content_id: number;
  onClose: () => void;
}

/** Report flow dialog. Filled by a later ticket. */
export function ReportDialog(_props: ReportDialogProps) {
  return <Placeholder title="Inhalt melden" />;
}

export default ReportDialog;
