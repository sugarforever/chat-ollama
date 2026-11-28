import { createServer, type ServerResponse } from 'node:http';
export async function goalModel(options: {
  reject?: boolean; weekly?: boolean; missing?: boolean; maintain?: boolean; unresolvedWeekly?: boolean;
  collapsedWindow?: boolean; prepareUnscheduled?: boolean; deliverables?: boolean;
  deliverableWaitOnceId?: string; rejectAggregate?: boolean; deliverableAskId?: string; deliverableRejectId?: string; deliverableRejectOnceId?: string; deliverableNeedsUserId?: string;
  deliverableBadVerify?: { id: string; mode: 'criterion-mismatch' | 'evidence-mismatch' };
} = {}) {
  const calls: { purpose: string; deliverableId?: string | null; body: any }[] = [];
  const held = new Map<string, ServerResponse[]>();
  let historyIds: string[] = [];
  const holds = new Set<string>();
  const respond = (purpose: string, res: ServerResponse, suppliedArg?: any) => {
    const latest = calls[calls.length - 1];
    const supplied = suppliedArg ?? (latest ? JSON.parse(latest.body.messages.find((m: any) => m.role === 'user').content) : null);
    const scheduleKnown = !options.unresolvedWeekly || supplied?.goal.originalText.includes('Europe/Dublin');
    const active = supplied?.activeDeliverable;
    const data: Record<string, unknown> = {
      interpret: options.deliverables
        ? {
            objective: '为本次版本发布准备三项独立文本交付',
            criteria: ['完成发布说明', '完成150字以内更新介绍', '完成基于实测记录的兼容性说明'],
            mode: 'once',
            schedule: null,
            missing: [],
            deliverables: [
              { id: 'release-notes', title: '发布说明', criteria: ['包含核心变更与升级提示'], missing: [] },
              { id: 'short-summary', title: '150字以内更新介绍', criteria: ['简明概括本次更新亮点'], missing: [] },
              { id: 'compat-notes', title: '基于实测记录的兼容性说明', criteria: ['引用用户提供的实测记录说明兼容情况'], missing: ['缺少实测记录，请提供实测环境与结果记录'] },
            ],
          }
        : { objective: 'Write an introduction from supplied facts', criteria: ['Include background and uses'], mode: options.weekly || options.unresolvedWeekly ? 'weekly' : options.maintain ? 'maintain' : 'once', schedule: (options.weekly || options.unresolvedWeekly) && scheduleKnown ? { timezone: 'Europe/Dublin', weekdays: [5], startLocalTime: '09:00', dueLocalTime: '12:00', endDate: null } : null, missing: !scheduleKnown ? ['What timezone and Friday preparation/delivery times should I use?'] : options.missing ? ['Live data is unavailable. Supply current evidence.'] : [] },
      review: { decision: options.missing || (!scheduleKnown && !options.prepareUnscheduled) ? 'ask' : 'execute', reason: 'Prepare the authorized text work', question: !scheduleKnown ? 'What timezone and Friday times?' : options.missing ? 'Can you supply current evidence?' : null, plan: 'Write background and uses', nextReviewMinutes: 60 },
      work: { content: '# Introduction\n\n## Background\nA goal-driven assistant.\n\n## Uses\nDurable text work.', evidence: ['user-input'] },
      verify: { accepted: !options.reject, reason: options.reject ? 'Missing required coverage' : 'The saved artifact covers background and uses', criteria: [{ criterion: 'Include background and uses', evidence: '## Background', satisfied: !options.reject }], needsUser: false },
      retrospect: { conclusion: 'Compared planned writing to the saved verified result', plan: 'Keep the proven text preparation path', evidence: [], nextReviewMinutes: 60 },
    };
    if (options.deliverables && active) {
      const hasClarifications = Array.isArray(active.clarifications) && active.clarifications.length > 0;
      if (purpose === 'review') {
        if (options.deliverableWaitOnceId === active.id && calls.filter(c => c.purpose === 'review' && c.deliverableId === active.id).length === 1) {
          data.review = { decision: 'wait', reason: 'Review again in one minute', question: null, plan: 'Wait briefly', nextReviewMinutes: 1 };
        } else if ((options.deliverableAskId === active.id || active.missing?.length) && !hasClarifications) {
          data.review = { decision: 'ask', reason: `需要补充输入才能继续：${active.title}`, question: `请为${active.title}补充所需信息`, plan: `等待${active.title}补充信息`, nextReviewMinutes: 60 };
        } else {
          data.review = { decision: 'execute', reason: `推进交付项：${active.title}`, question: null, plan: `撰写${active.title}`, nextReviewMinutes: 60 };
        }
      } else if (purpose === 'work') {
        const revised = options.deliverableRejectOnceId === active.id && (active.revisions ?? 0) >= 1;
        let content: string;
        if (active.id === 'release-notes') {
          content = '# 发布说明\n\n## 核心变更\n支持分项交付与独立验收。\n\n## 升级提示\n保持旧 Goal 与周期 Goal 向后兼容。';
        } else if (active.id === 'short-summary') {
          content = '# 更新介绍\n\n本次更新上线分项交付能力，就绪项优先推进并独立验收，阻塞项按需补充，已验收成果完整保留。';
        } else {
          const notes = hasClarifications ? active.clarifications.join('\n') : '未提供实测记录';
          content = `# 兼容性说明\n\n## 实测记录\n${notes}\n\n## 兼容结论\n基于上述实测记录验证兼容通过。`;
        }
        if (revised) content += '\n\n## Revised\n修订版正文：已按验收意见补充完善。';
        data.work = { content, evidence: ['user-input'] };
      } else if (purpose === 'verify') {
        const evidenceMap: Record<string, string> = {
          'release-notes': '## 核心变更',
          'short-summary': '本次更新上线分项交付能力',
          'compat-notes': '## 实测记录',
        };
        const badVerify = options.deliverableBadVerify;
        if (badVerify && badVerify.id === active.id) {
          const badMode = badVerify.mode;
          data.verify = {
            accepted: true,
            needsUser: false,
            reason: '满足全部验收标准',
            criteria: (active.criteria as string[]).map((c: string) => ({
              criterion: badMode === 'criterion-mismatch' ? `改写标准：${c}` : c,
              evidence: badMode === 'evidence-mismatch' ? '这是模型转述而非原文子串的证据' : (evidenceMap[active.id] ?? '##'),
              satisfied: true,
            })),
          };
        } else {
          const forceReject = options.deliverableRejectId === active.id;
          const forceRejectOnce = options.deliverableRejectOnceId === active.id && (active.revisions ?? 0) === 0;
          const forceNeedsUser = options.deliverableNeedsUserId === active.id && !hasClarifications;
          const accepted = !forceReject && !forceRejectOnce && !forceNeedsUser;
          data.verify = {
            accepted,
            needsUser: forceNeedsUser,
            reason: forceNeedsUser ? `${active.title}需要用户确认` : forceRejectOnce ? `${active.title}初稿需要修订` : forceReject ? `${active.title}未满足验收标准` : `已验收：${active.title}`,
            criteria: (active.criteria as string[]).map((c: string) => ({ criterion: c, evidence: evidenceMap[active.id] ?? '##', satisfied: accepted })),
          };
        }
      }
    }
    if (options.deliverables && !active && purpose === 'verify') {
      data.verify = { accepted: !options.rejectAggregate, needsUser: !!options.rejectAggregate, reason: options.rejectAggregate ? 'Cross-document requirement is not met' : 'All overall criteria verified', criteria: supplied.goal.agreement.criteria.map((criterion: string) => ({ criterion, evidence: '# 发布说明', satisfied: !options.rejectAggregate })) };
    }
    if (purpose === 'retrospect') (data.retrospect as any).evidence = historyIds.length ? [historyIds[0]] : ['missing'];
    if (options.collapsedWindow && purpose === 'interpret') Object.assign(data.interpret as object, { mode: 'weekly', schedule: { timezone: 'Europe/Dublin', weekdays: [7], startLocalTime: '01:30', dueLocalTime: '02:00', endDate: null } });
    const text = JSON.stringify(data[purpose]);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ id: 'goal-fixture', choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ id: 'goal-fixture', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  };
  const heldPayloads = new WeakMap<ServerResponse, any>();
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    const prompt = body.messages.find((m: any) => m.role === 'user')?.content ?? '';
    const parsed = JSON.parse(prompt);
    const purpose = parsed.purpose;
    const deliverableId = parsed.activeDeliverable?.id ?? null;
    historyIds = parsed.activity.filter((a: any) => ['work', 'verification', 'result', 'failure'].includes(a.kind)).map((a: any) => a.id);
    calls.push({ purpose, deliverableId, body });
    const specificKey = deliverableId ? `${purpose}:${deliverableId}` : null;
    const holdKey = specificKey && holds.has(specificKey) ? specificKey : holds.has(purpose) ? purpose : null;
    if (holdKey) {
      heldPayloads.set(res, parsed);
      held.set(holdKey, [...held.get(holdKey) ?? [], res]);
      res.on('close', () => held.set(holdKey, (held.get(holdKey) ?? []).filter(x => x !== res)));
    } else respond(purpose, res, parsed);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  return {
    endpoint: { baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`, apiKey: 'fixture-secret', modelId: 'fixture' }, calls,
    hold(key: string) { holds.add(key); },
    release(key: string) {
      holds.delete(key);
      const purpose = key.includes(':') ? key.slice(0, key.indexOf(':')) : key;
      for (const res of held.get(key) ?? []) respond(purpose, res, heldPayloads.get(res));
      held.delete(key);
    },
    async close() { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); },
  };
}
