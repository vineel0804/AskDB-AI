import { Injectable, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

const SQL_KW = new Set([
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL',
  'ON', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'AS', 'DISTINCT', 'GROUP',
  'ORDER', 'BY', 'HAVING', 'LIMIT', 'OFFSET', 'WITH', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'UNION', 'ALL', 'IS', 'NULL', 'INSERT', 'UPDATE', 'DELETE',
  'CREATE', 'DROP', 'ALTER', 'EXISTS', 'INTO', 'VALUES', 'SET',
]);

const SQL_FN = new Set([
  'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'COALESCE', 'NULLIF', 'CAST', 'ROUND',
  'FLOOR', 'CEIL', 'ABS', 'LENGTH', 'UPPER', 'LOWER', 'TRIM', 'NOW', 'DATE',
  'EXTRACT', 'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD', 'OVER',
  'PARTITION', 'STRING_AGG',
]);

type TokenType = 'kw' | 'fn' | 'str' | 'num' | 'cmt' | 'op' | 'id';

interface Token {
  type: TokenType;
  value: string;
}

@Injectable({ providedIn: 'root' })
export class SqlHighlighterService {
  private readonly sanitizer = inject(DomSanitizer);

  highlight(sql: string): SafeHtml {
    const tokens = this.tokenize(sql);
    const html = tokens
      .map(({ type, value }) => {
        const escaped = this.escape(value);
        switch (type) {
          case 'kw':  return `<span class="sk">${escaped}</span>`;
          case 'fn':  return `<span class="sf">${escaped}</span>`;
          case 'str': return `<span class="ss">${escaped}</span>`;
          case 'num': return `<span class="sn">${escaped}</span>`;
          case 'cmt': return `<span class="sc">${escaped}</span>`;
          default:    return escaped;
        }
      })
      .join('');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private tokenize(sql: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    while (i < sql.length) {
      // Line comment
      if (sql[i] === '-' && sql[i + 1] === '-') {
        let j = i + 2;
        while (j < sql.length && sql[j] !== '\n') j++;
        tokens.push({ type: 'cmt', value: sql.slice(i, j) });
        i = j;
        continue;
      }
      // String literal
      if (sql[i] === "'") {
        let j = i + 1;
        while (j < sql.length) {
          if (sql[j] === "'" && sql[j - 1] !== '\\') { j++; break; }
          j++;
        }
        tokens.push({ type: 'str', value: sql.slice(i, j) });
        i = j;
        continue;
      }
      // Identifier or keyword
      if (/[A-Za-z_]/.test(sql[i])) {
        let j = i;
        while (j < sql.length && /\w/.test(sql[j])) j++;
        const word = sql.slice(i, j);
        const upper = word.toUpperCase();
        const type: TokenType = SQL_KW.has(upper) ? 'kw' : SQL_FN.has(upper) ? 'fn' : 'id';
        tokens.push({ type, value: word });
        i = j;
        continue;
      }
      // Number
      if (/[0-9]/.test(sql[i])) {
        let j = i;
        while (j < sql.length && /[0-9.]/.test(sql[j])) j++;
        tokens.push({ type: 'num', value: sql.slice(i, j) });
        i = j;
        continue;
      }
      // Operator / punctuation
      tokens.push({ type: 'op', value: sql[i] });
      i++;
    }

    return tokens;
  }

  private escape(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
