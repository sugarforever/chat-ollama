import { openGoalRuntime } from '../../src/lib/server/goals/runtime';
const runtime = await openGoalRuntime({ file: `${process.env.DATA_DIR}/goals.sqlite`, resolveEndpoint: () => ({ baseUrl: process.env.BASE_URL!, apiKey: 'fixture-secret', modelId: 'fixture' }) });
process.on('message', async (m: any) => {
  try {
    if (m.command === 'create') process.send?.({ event: 'created', ...await runtime.create(m.input) });
    if (m.command === 'snapshot') process.send?.({ event: 'snapshot', snapshot: await runtime.snapshot(m.id) });
    if (m.command === 'close') { await runtime.close(); process.exit(0); }
  } catch (e) { process.send?.({ event: 'error', message: String(e) }); }
});
process.send?.({ event: 'ready' });
