import { createServer, type ServerResponse } from 'node:http';
export async function goalModel(options: { reject?: boolean; weekly?: boolean; missing?: boolean; maintain?: boolean; unresolvedWeekly?: boolean; collapsedWindow?: boolean; prepareUnscheduled?: boolean } = {}) {
  const calls: { purpose: string; body: any }[] = [];
  const held = new Map<string, ServerResponse[]>();
  let historyIds: string[] = [];
  const holds = new Set<string>();
  const respond = (purpose: string, res: ServerResponse) => {
    const latest = calls[calls.length - 1];
    const supplied = latest ? JSON.parse(latest.body.messages.find((m: any) => m.role === 'user').content) : null;
    const scheduleKnown = !options.unresolvedWeekly || supplied?.goal.originalText.includes('Europe/Dublin');
    const data: Record<string, unknown> = {
      interpret: { objective: 'Write an introduction from supplied facts', criteria: ['Include background and uses'], mode: options.weekly || options.unresolvedWeekly ? 'weekly' : options.maintain ? 'maintain' : 'once', schedule: (options.weekly || options.unresolvedWeekly) && scheduleKnown ? { timezone: 'Europe/Dublin', weekdays: [5], startLocalTime: '09:00', dueLocalTime: '12:00', endDate: null } : null, missing: !scheduleKnown ? ['What timezone and Friday preparation/delivery times should I use?'] : options.missing ? ['Live data is unavailable. Supply current evidence.'] : [] },
      review: { decision: options.missing || (!scheduleKnown && !options.prepareUnscheduled) ? 'ask' : 'execute', reason: 'Prepare the authorized text work', question: !scheduleKnown ? 'What timezone and Friday times?' : options.missing ? 'Can you supply current evidence?' : null, plan: 'Write background and uses', nextReviewMinutes: 60 },
      work: { content: '# Introduction\n\n## Background\nA goal-driven assistant.\n\n## Uses\nDurable text work.', evidence: ['user-input'] },
      verify: { accepted: !options.reject, reason: options.reject ? 'Missing required coverage' : 'The saved artifact covers background and uses', criteria: [{ criterion: 'Include background and uses', evidence: '## Background', satisfied: !options.reject }], needsUser: false },
      retrospect: { conclusion: 'Compared planned writing to the saved verified result', plan: 'Keep the proven text preparation path', evidence: [], nextReviewMinutes: 60 },
    };
    if (purpose === 'retrospect') (data.retrospect as any).evidence = historyIds.length ? [historyIds[0]] : ['missing'];
    if (options.collapsedWindow && purpose === 'interpret') Object.assign(data.interpret as object, { mode: 'weekly', schedule: { timezone: 'Europe/Dublin', weekdays: [7], startLocalTime: '01:30', dueLocalTime: '02:00', endDate: null } });
    const text = JSON.stringify(data[purpose]);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ id: 'goal-fixture', choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ id: 'goal-fixture', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  };
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    const prompt = body.messages.find((m: any) => m.role === 'user')?.content ?? '';
    const parsed = JSON.parse(prompt);
    const purpose = parsed.purpose;
    historyIds = parsed.activity.filter((a: any) => ['work', 'verification', 'result', 'failure'].includes(a.kind)).map((a: any) => a.id);
    calls.push({ purpose, body });
    if (holds.has(purpose)) {
      held.set(purpose, [...held.get(purpose) ?? [], res]);
      res.on('close', () => held.set(purpose, (held.get(purpose) ?? []).filter(x => x !== res)));
    } else respond(purpose, res);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  return {
    endpoint: { baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`, apiKey: 'fixture-secret', modelId: 'fixture' }, calls,
    hold(purpose: string) { holds.add(purpose); },
    release(purpose: string) { holds.delete(purpose); for (const res of held.get(purpose) ?? []) respond(purpose, res); held.delete(purpose); },
    async close() { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); },
  };
}
