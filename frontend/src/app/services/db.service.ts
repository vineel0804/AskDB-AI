import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError, shareReplay } from 'rxjs';
import { TableMeta, TableData, ChatMessage } from '../models/models';

export interface StreamEvent {
  type: 'status' | 'sql' | 'rows' | 'token' | 'done' | 'error';
  text?: string;
  sql?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  row_count?: number;
  duration_ms?: number;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class DbService {
  private readonly base = '/api';
  private http = inject(HttpClient);

  private tables$ = this.http
    .get<TableMeta[]>(`${this.base}/db/tables`)
    .pipe(shareReplay(1), catchError(this.err));

  healthCheck(): Observable<{ status: string }> {
    return this.http.get<{ status: string }>(`${this.base}/health`);
  }

  getTables(): Observable<TableMeta[]> {
    return this.tables$;
  }

  getTableData(name: string, page = 1, pageSize = 50): Observable<TableData> {
    return this.http
      .get<TableData>(`${this.base}/db/tables/${name}`, {
        params: { page, page_size: pageSize },
      })
      .pipe(catchError(this.err));
  }

  chatStream(question: string): Observable<StreamEvent> {
    return new Observable<StreamEvent>(observer => {
      const controller = new AbortController();

      fetch(`${this.base}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      })
        .then(async response => {
          if (!response.ok) throw new Error(`Request failed: ${response.status}`);
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try { observer.next(JSON.parse(line.slice(6))); } catch {}
              }
            }
          }
          observer.complete();
        })
        .catch(err => {
          if (err.name !== 'AbortError') observer.error(err);
        });

      return () => controller.abort();
    });
  }

  getChatHistory(): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.base}/chat/history`).pipe(catchError(this.err));
  }

  getSuggestions(tableName: string): Observable<{ suggestions: string[] }> {
    return this.http
      .get<{ suggestions: string[] }>(`${this.base}/ai/suggestions/${encodeURIComponent(tableName)}`)
      .pipe(catchError(this.err));
  }

  private err(e: HttpErrorResponse): Observable<never> {
    return throwError(() => new Error(e.error?.detail ?? e.message ?? 'Unexpected error'));
  }
}
