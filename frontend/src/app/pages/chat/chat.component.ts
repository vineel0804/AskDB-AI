import { Component, OnInit, OnDestroy, AfterViewChecked, inject, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SafeHtml } from '@angular/platform-browser';
import { DbService } from '../../services/db.service';
import { SharedStateService } from '../../services/shared-state.service';
import { SqlHighlighterService } from '../../services/sql-highlighter.service';
import { ChatMessage } from '../models/models';

interface UiMessage {
  role: 'user' | 'assistant';
  // user
  text?: string;
  // assistant — streaming state
  status?: string;
  sql?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  row_count?: number;
  summary?: string;
  duration_ms?: number;
  streaming?: boolean;
  sqlOpen?: boolean;
  error?: string;
  loading?: boolean;
  // assistant — loaded from history
  data?: ChatMessage;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css',
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  messages: UiMessage[] = [];
  question = '';
  loading = false;
  inputFocused = false;
  suggestions: string[] = [
    'Top 5 products by revenue',
    'Which customers placed the most orders?',
    'Total sales by country',
    'Average order value by employee',
  ];
  loadingSuggestions = false;

  private needsScroll = false;
  private stateSub?: Subscription;

  @ViewChild('thread') threadEl!: ElementRef<HTMLElement>;
  private db = inject(DbService);
  private state = inject(SharedStateService);
  private highlighter = inject(SqlHighlighterService);

  ngAfterViewChecked(): void {
    if (this.needsScroll) {
      this.needsScroll = false;
      const el = this.threadEl?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }

  ngOnInit(): void {
    this.db.getChatHistory().subscribe({
      next: (history) => {
        this.messages = history.reverse().flatMap((h) => [
          { role: 'user' as const, text: h.question },
          { role: 'assistant' as const, data: h, sqlOpen: false },
        ]);
        this.scrollToBottom();
      },
      error: () => {},
    });

    this.stateSub = this.state.activeTable$.subscribe((table) => {
      if (table) this.fetchSuggestions(table);
    });
  }

  ngOnDestroy(): void {
    this.stateSub?.unsubscribe();
  }

  private fetchSuggestions(table: string): void {
    this.loadingSuggestions = true;
    this.db.getSuggestions(table).subscribe({
      next: (res) => {
        this.suggestions = res.suggestions;
        this.loadingSuggestions = false;
      },
      error: () => {
        // Keep existing suggestions on error — fail silently
        this.loadingSuggestions = false;
      },
    });
  }

  send(): void {
    if (!this.question.trim() || this.loading) return;
    const q = this.question.trim();
    this.question = '';
    this.loading = true;

    this.messages.push({ role: 'user', text: q });
    const msg: UiMessage = { role: 'assistant', loading: true, streaming: true, status: 'Thinking…' };
    this.messages.push(msg);
    this.scrollToBottom();

    this.db.chatStream(q).subscribe({
      next: (event) => {
        switch (event.type) {
          case 'status':
            msg.status = event.text;
            msg.loading = true;
            break;
          case 'sql':
            msg.loading = false;
            msg.sql = event.sql;
            msg.status = undefined;
            break;
          case 'rows':
            msg.columns = event.columns;
            msg.rows = event.rows;
            msg.row_count = event.row_count;
            break;
          case 'token':
            msg.summary = (msg.summary ?? '') + (event.text ?? '');
            break;
          case 'done':
            msg.streaming = false;
            msg.duration_ms = event.duration_ms;
            this.loading = false;
            break;
          case 'error':
            msg.error = event.message;
            msg.loading = false;
            msg.streaming = false;
            this.loading = false;
            break;
        }
        this.scrollToBottom();
      },
      error: (err: Error) => {
        msg.error = err.message;
        msg.loading = false;
        msg.streaming = false;
        this.loading = false;
        this.scrollToBottom();
      },
    });
  }

  useSuggestion(s: string): void {
    this.question = s;
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.send();
    }
  }

  toggleSql(msg: UiMessage): void {
    msg.sqlOpen = !msg.sqlOpen;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  getSql(msg: UiMessage): string {
    return msg.sql ?? msg.data?.sql ?? '';
  }

  getColumns(msg: UiMessage): string[] {
    return msg.columns ?? msg.data?.columns ?? [];
  }

  getRows(msg: UiMessage): Record<string, unknown>[] {
    return msg.rows ?? msg.data?.rows ?? [];
  }

  getRowCount(msg: UiMessage): number {
    return msg.row_count ?? msg.data?.row_count ?? 0;
  }

  getSummary(msg: UiMessage): string {
    return msg.summary ?? msg.data?.summary ?? '';
  }

  getDuration(msg: UiMessage): string {
    const ms = msg.duration_ms ?? msg.data?.duration_ms;
    if (!ms) return '';
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  }

  hasResult(msg: UiMessage): boolean {
    return !!(msg.sql ?? msg.data?.sql);
  }

  cellValue(v: unknown): string {
    if (v === null || v === undefined) return 'NULL';
    return String(v);
  }

  isNull(v: unknown): boolean {
    return v === null || v === undefined;
  }

  highlightSQL(sql: string): SafeHtml {
    return this.highlighter.highlight(sql);
  }

  private scrollToBottom(): void {
    this.needsScroll = true;
  }
}
