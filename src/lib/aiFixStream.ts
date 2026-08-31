// Client-side helper for reading /api/ai/fix's response. The route returns
// plain JSON for request-level failures (bad upload, missing instruction —
// caught before the agent ever starts) but streams Server-Sent Events for a
// real run, since a full-document generate can take 15-30+ minutes and the
// caller needs live progress, not just an opaque wait. Shared by AiFixModal
// and SmartFormGenerator so both get identical parsing/progress handling.

export interface AiFixProgressEvent {
  turn: number;
  maxTurns: number;
  label: string;
  editsApplied: number;
}

export const readAiFixResponse = async <TResult>(
  res: Response,
  onProgress: (event: AiFixProgressEvent) => void
): Promise<TResult> => {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as TResult;
  }

  if (!res.body) throw new Error('No response body received from the server.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: TResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data: ')) continue;
      const event = JSON.parse(line.slice('data: '.length));
      if (event.type === 'progress') {
        const { type, ...progress } = event;
        onProgress(progress as AiFixProgressEvent);
      } else if (event.type === 'result') {
        const { type, ...rest } = event;
        result = rest as TResult;
      }
    }
  }

  if (!result) throw new Error('The connection ended before a result was received.');
  return result;
};
