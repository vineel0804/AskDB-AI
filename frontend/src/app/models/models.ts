export interface ColumnMeta {
  name: string;
  type: string;
}

export interface TableMeta {
  name: string;
  row_count: number;
  columns: ColumnMeta[];
}

export interface TableData {
  table: string;
  columns: ColumnMeta[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ChatMessage {
  question: string;
  summary: string;
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  timestamp: string;
  duration_ms: number;
}
