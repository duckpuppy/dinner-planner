/**
 * Incremental Server-Sent Events parser (WHATWG "Interpreting an event stream"). Feed it decoded
 * text chunks of any size; frames may be split across chunks at any byte boundary.
 */

export interface SseFrame {
  /** Event id of this frame (undefined when the frame had no id field). */
  id?: string;
  /** Event name; 'message' when the frame had no event field. */
  event: string;
  data: string;
}

export interface SseParserHandlers {
  onFrame: (frame: SseFrame) => void;
  /** Server-suggested reconnect delay in ms (`retry:` field). */
  onRetry?: (ms: number) => void;
}

export interface SseParser {
  push: (chunk: string) => void;
}

export function createSseParser({ onFrame, onRetry }: SseParserHandlers): SseParser {
  let buffer = '';
  let first = true;
  let skipLf = false; // previous chunk ended with CR; swallow a following LF
  let id: string | undefined;
  let event = '';
  let data: string[] = [];
  let hasField = false;

  function dispatch() {
    if (data.length > 0 || event !== '') {
      onFrame({ id, event: event || 'message', data: data.join('\n') });
    }
    id = undefined;
    event = '';
    data = [];
    hasField = false;
  }

  function line(l: string) {
    if (l === '') {
      if (hasField) dispatch();
      return;
    }
    if (l.startsWith(':')) return; // comment / heartbeat
    const colon = l.indexOf(':');
    const field = colon === -1 ? l : l.slice(0, colon);
    let value = colon === -1 ? '' : l.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'event':
        event = value;
        hasField = true;
        break;
      case 'data':
        data.push(value);
        hasField = true;
        break;
      case 'id':
        if (!value.includes('\0')) {
          id = value;
          hasField = true;
        }
        break;
      case 'retry':
        if (/^\d+$/.test(value)) onRetry?.(Number(value));
        break;
      default:
        break;
    }
  }

  return {
    push(chunk: string) {
      let text = chunk;
      if (first && text.length > 0) {
        first = false;
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      }
      if (skipLf && text.length > 0) {
        if (text[0] === '\n') text = text.slice(1);
        skipLf = false;
      }
      buffer += text;
      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const c = buffer[i];
        if (c !== '\n' && c !== '\r') continue;
        if (c === '\r') {
          line(buffer.slice(start, i));
          if (i + 1 === buffer.length) {
            // CR at the end of the chunk: a following LF belongs to this line break.
            start = i + 1;
            skipLf = true;
            break;
          }
          if (buffer[i + 1] === '\n') i++;
          start = i + 1;
        } else {
          line(buffer.slice(start, i));
          start = i + 1;
        }
      }
      buffer = buffer.slice(start);
    },
  };
}
