import { Placeholder } from "./Placeholder";

export interface PaginationProps {
  page: number;
  pages: number;
  total?: number;
  perPage?: number;
  onPageChange: (page: number) => void;
}

/** Page controls plus the 'Seite X von Y' line. Filled by a later ticket. */
export function Pagination(_props: PaginationProps) {
  return <Placeholder title="Seitennavigation" />;
}

export default Pagination;
