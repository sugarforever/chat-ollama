<script lang="ts">
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import ModelSelector from '$lib/components/ModelSelector.svelte';
  import DeliverablesPanel from '$lib/components/goals/DeliverablesPanel.svelte';
  import { ArrowLeft, Target, Pause, Play, ShieldCheck, RefreshCw } from '@lucide/svelte';
  import MarkdownIt from 'markdown-it';
  import { api } from '$lib/client';
  import type { Goal, GoalSnapshot } from '$lib/goals/contracts';
  import type { PublicProvider, ProviderSelection } from '$lib/contracts';
  let goals = $state<Goal[]>([]), snapshot = $state<GoalSnapshot | null>(null);
  let providers = $state<PublicProvider[]>([]), catalog = $state<{ id: string; models: { id: string; name: string }[] }[]>([]);
  let selection = $state<ProviderSelection>({ providerId: '', modelId: '' });
  let text = $state(''), authorized = $state(false), dailyRequests = $state(12), priority = $state(5);
  let pendingGoal = $state('');
  let current = $state(''), error = $state(''), busy = $state(false), answer = $state('');
  let editText = $state(''), editing = $state(false), editBudget = $state(12), editPriority = $state(5), editDeadline = $state('');
  let generation = 0, reads = 0, disposed = false;
  let receipt: { payload: string; requestId: string } | undefined;
  let commandReceipt: { payload: string; requestId: string; expectedRevision: number } | undefined;
  const md = new MarkdownIt({ html: false, linkify: false });
  md.renderer.rules.image = (tokens, i) => md.utils.escapeHtml(tokens[i].content);
  const when = (at: number | null) => at === null ? '—' : new Date(at).toLocaleString();
  function limits(goal: Goal) {
    editBudget = goal.dailyRequests; editPriority = goal.priority;
    editDeadline = goal.deadlineAt ? new Date(goal.deadlineAt - new Date(goal.deadlineAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  }
  async function refresh() {
    const own = generation, id = current, read = ++reads;
    const [list, detail] = await Promise.all([api('/api/goals'), id ? api(`/api/goals/${id}`) : Promise.resolve(null)]);
    if (disposed || own !== generation || read !== reads) return;
    goals = list; if (detail) snapshot = detail;
  }
  async function open(id: string) {
    const own = ++generation, read = ++reads; current = id; snapshot = null; answer = ''; editing = false; error = '';
    replaceState(`/goals?goal=${encodeURIComponent(id)}`, {});
    try {
      const value = await api(`/api/goals/${id}`);
      if (!disposed && own === generation) { if (read === reads) snapshot = value; limits(value.goal); }
    } catch (e) { if (own === generation) error = (e as Error).message; }
  }
  async function create(event: SubmitEvent) {
    event.preventDefault(); if (busy) return; busy = true; error = '';
    try {
      const value = { text, ...selection, authorizeTextWork: authorized, dailyRequests, priority };
      const payload = JSON.stringify(value);
      if (!receipt || receipt.payload !== payload) receipt = { payload, requestId: crypto.randomUUID() };
      const { id } = await api('/api/goals', { ...value, requestId: receipt.requestId });
      receipt = undefined; text = ''; await open(id); await refresh();
    } catch (e) { error = (e as Error).message; }
    finally { busy = false; }
  }
  async function command(action: string, extra: Record<string, unknown> = {}): Promise<boolean> {
    if (!snapshot || busy) return false; busy = true; error = '';
    const id = current, own = generation; pendingGoal = id; reads++;
    const payload = JSON.stringify({ id, action, ...extra });
    if (!commandReceipt || commandReceipt.payload !== payload) commandReceipt = { payload, requestId: crypto.randomUUID(), expectedRevision: snapshot.goal.revision };
    const pending = commandReceipt;
    try {
      await api(`/api/goals/${id}/commands`, { requestId: pending.requestId, expectedRevision: pending.expectedRevision, action, ...extra });
      if (commandReceipt === pending) commandReceipt = undefined;
      if (!disposed && own === generation && current === id) { answer = ''; editing = false; await refresh(); if (snapshot) limits(snapshot.goal); }
      return true;
    } catch (e) { if (!disposed && own === generation && current === id) { error = (e as Error).message; await refresh().catch(() => {}); } return false; }
    finally { busy = false; if (pendingGoal === id) pendingGoal = ''; }
  }
  onMount(() => {
    disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { await refresh(); } catch (e) { if (!disposed) error = (e as Error).message; }
      if (!disposed) timer = setTimeout(poll, 1500);
    }
    void (async () => {
      try {
        const settings = await api('/api/settings');
        if (disposed) return;
        providers = settings.providers; catalog = settings.catalog ?? [];
        const provider = providers.find(p => p.id === settings.defaultProviderId) ?? providers[0];
        if (provider) selection = { providerId: provider.id, modelId: provider.modelId };
        await refresh();
        const id = new URL(location.href).searchParams.get('goal') ?? goals[0]?.id;
        if (id) await open(id);
      } catch (e) { if (!disposed) error = (e as Error).message; }
      if (!disposed) timer = setTimeout(poll, 1500);
    })();
    return () => { disposed = true; generation++; clearTimeout(timer); };
  });
</script>

<svelte:head><title>Goals · ChatOllama</title></svelte:head>
<main class="goal-workbench">
  <header class="topbar"><a href="/" class="back"><ArrowLeft size={17} />Chat</a><a href="/settings">Settings</a></header>
  <div class="intro"><Target size={28} /><div><h1>Goals</h1><p>Delegate a result. Review the agreement, follow the work, and read the evidence.</p></div></div>
  {#if error}<p role="alert" class="error">{error}</p>{/if}
  <div class="columns">
    <aside>
      <form class="panel create" onsubmit={create}>
        <h2>A new Goal</h2>
        <label for="goal-text">What result do you want?</label>
        <Textarea id="goal-text" bind:value={text} rows={5} required maxlength={32000} placeholder="Write an introduction using these project notes…" />
        <ModelSelector {providers} {catalog} {selection} onselect={async value => { selection = value; }} />
        <label class="permission"><input type="checkbox" bind:checked={authorized} /><span>Allow ongoing supplied-text analysis and Markdown work</span></label>
        <p class="muted">This permission lasts until revoked. It covers this provider and saved results in the app. Live research, shell, external accounts and publishing require additional capabilities.</p>
        <div class="pair"><label>Daily model requests<Input type="number" min={1} max={100} bind:value={dailyRequests} required /></label><label>Priority (0–10)<Input type="number" min={0} max={10} bind:value={priority} required /></label></div>
        <Button type="submit" disabled={busy || !text.trim() || !selection.providerId}>Create Goal</Button>
      </form>
      <nav class="panel goal-list" aria-label="Goals">
        <h2>Your Goals</h2>
        {#each goals as goal (goal.id)}
          <button class:chosen={current === goal.id} onclick={() => open(goal.id)}><span>{goal.agreement?.objective ?? goal.originalText}</span><small>{goal.lifecycle}</small></button>
        {:else}<p class="muted">Your delegations will appear here.</p>{/each}
      </nav>
    </aside>
    <section class="detail" aria-label="Goal details">
      {#if snapshot}
        {@const goal = snapshot.goal}
        {@const terminal = ['completed', 'cancelled'].includes(goal.lifecycle)}
        {@const deliverables = snapshot.deliverables ?? []}
        {@const deliverableTitles = new Map(deliverables.map(d => [d.id, d.title]))}
        {@const deliverableHandlesQuestion = deliverables.length > 0 && deliverables.some(d => d.state === 'waiting' && Boolean(d.question || (goal.questionDeliverableId === d.id && goal.question)))}
        <section class="panel">
          <div class="heading"><h2>Result agreement</h2><span class="status" data-testid="goal-lifecycle">{goal.lifecycle}</span></div>
          <p class="objective">{goal.agreement?.objective ?? 'The agreement will be interpreted after authorization.'}</p>
          <details><summary>Your original request</summary><p class="original">{goal.originalText}</p></details>
          {#if goal.agreement}<ul>{#each goal.agreement.criteria as criterion}<li>{criterion}</li>{/each}</ul>
            <p class="muted">{goal.agreement.mode === 'once' ? 'Ends after the agreed result is verified.' : 'Each period may finish while this Goal remains active.'}</p>
            {#if goal.agreement.schedule}<p class="muted">Weekly · {goal.agreement.schedule.timezone} · {goal.agreement.schedule.weekdays.map(day => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][day - 1]).join(', ')} · prepare {goal.agreement.schedule.startLocalTime} · deliver {goal.agreement.schedule.dueLocalTime}</p>{/if}
          {/if}
          <dl><dt>Next review</dt><dd>{when(goal.nextReviewAt)}</dd><dt>Next retrospect</dt><dd>{when(goal.nextRetrospectAt)}</dd><dt>Permission</dt><dd>{goal.authorized ? 'Supplied-text work allowed' : 'Not authorized'}</dd><dt>Limits</dt><dd>{goal.dailyRequests} requests/day · priority {goal.priority} · hard stop {when(goal.deadlineAt)}</dd></dl>
          {#if goal.waiting}<p class="waiting" role="status">{goal.waiting}</p>{/if}
          {#if !terminal}<div class="actions">
            <Button variant="outline" disabled={busy} onclick={() => command('pause')}><Pause size={14} />Pause</Button>
            {#if goal.lifecycle === 'paused'}<Button variant="outline" disabled={busy} onclick={() => command('resume')}><Play size={14} />Resume</Button>{/if}
            {#if !goal.authorized}<Button disabled={busy} onclick={() => command('authorize')}><ShieldCheck size={14} />Allow supplied-text work</Button>{:else}<Button variant="outline" disabled={busy} onclick={() => command('revoke')}>Revoke permission</Button>{/if}
            <Button variant="outline" disabled={busy} onclick={() => command('review')}><RefreshCw size={14} />Review now</Button>
            <Button variant="ghost" disabled={busy && pendingGoal === current} onclick={() => { editText = goal.originalText; editing = !editing; }}>Edit agreement</Button>
            <Button variant="ghost" disabled={busy} onclick={() => command('cancel')}>Cancel Goal</Button>
          </div>
          <details class="limits"><summary>Change provider or limits</summary>
            <ModelSelector {providers} {catalog} selection={{ providerId: goal.providerId, modelId: goal.modelId }} onselect={async value => { await command('configure', value); }} />
            <div class="pair"><label>Daily request limit<Input type="number" min={1} max={100} bind:value={editBudget} disabled={busy && pendingGoal === current} /></label><label>Goal priority<Input type="number" min={0} max={10} bind:value={editPriority} disabled={busy && pendingGoal === current} /></label></div>
            <label>Hard stop (your local time)<Input type="datetime-local" bind:value={editDeadline} disabled={busy && pendingGoal === current} /></label>
            <Button variant="outline" disabled={busy} onclick={() => command('configure', { dailyRequests: editBudget, priority: editPriority, deadlineAt: editDeadline ? new Date(editDeadline).getTime() : null })}>Save limits</Button>
          </details>{/if}
          {#if editing}<form onsubmit={event => { event.preventDefault(); void command('edit', { text: editText }); }}><label for="edit-goal">Revised request</label><Textarea id="edit-goal" bind:value={editText} disabled={busy && pendingGoal === current} rows={5} required /><Button type="submit" disabled={busy}>Save revised request</Button></form>{/if}
        </section>
        {#if deliverables.length > 0}
          {#key goal.id}
            <DeliverablesPanel
              {goal}
              {deliverables}
              artifacts={snapshot.artifacts}
              {busy}
              {pendingGoal}
              currentGoalId={current}
              renderMarkdown={content => md.render(content)}
              formatTime={when}
              onAnswer={(deliverableId, value) => command('answer', { text: value, deliverableId })}
            />
          {/key}
        {/if}
        {#if goal.question && !deliverableHandlesQuestion}<section class="panel question"><h2>Your decision</h2><p>{goal.question}</p><form onsubmit={event => { event.preventDefault(); void command('answer', { text: answer }); }}><label for="goal-answer">Clarification</label><Textarea id="goal-answer" bind:value={answer} disabled={busy && pendingGoal === current} required rows={3} /><p class="muted">A reply supplies information. It does not grant tool access.</p><Button type="submit" disabled={busy || !answer.trim()}>Send answer</Button></form></section>{/if}
        <section class="panel"><h2>Deliveries and decisions</h2>{#each snapshot.activity.filter(a => ['result', 'question'].includes(a.kind)).slice().reverse() as item (item.id)}<p>{item.summary}<br /><small class="muted">{when(item.at)}</small></p>{:else}<p class="muted">Results and necessary decisions appear here. Routine work stays in activity.</p>{/each}</section>
        <section class="panel"><h2>Saved results</h2>{#each snapshot.artifacts.slice().reverse() as artifact (artifact.id)}<article class="artifact"><div class="heading"><small>{#if artifact.deliverableId && deliverableTitles.has(artifact.deliverableId)}{deliverableTitles.get(artifact.deliverableId)} · {/if}{when(artifact.createdAt)}</small><a href={`/api/goals/${goal.id}/artifacts/${encodeURIComponent(artifact.id)}?download=1`}>Download Markdown</a></div><div class="markdown">{@html md.render(artifact.content)}</div></article>{:else}<p class="muted">No saved result yet. Generated work still needs acceptance.</p>{/each}</section>
        <section class="panel"><h2>Periods and acceptance</h2>{#each snapshot.occurrences.slice().reverse() as period (period.key)}<div class="period"><strong>{period.state}</strong><p>Started {when(period.startAt)} · expected delivery {when(period.dueAt)}</p><p class="muted">{period.evidence.length ? 'Saved result and independent verification recorded.' : 'Not accepted yet.'}</p>{#if period.evidence.length}<details><summary>Evidence references</summary><small>{period.evidence.join(' · ')}</small></details>{/if}</div>{:else}<p class="muted">No period admitted yet.</p>{/each}</section>
        <section class="panel"><h2>Activity and retrospect</h2><p class="muted">Latest 50 records. Earlier records and results stay in durable storage.</p>{#each snapshot.activity.slice().reverse() as item (item.id)}<div class="activity"><small>{item.kind} · {when(item.at)}</small><p>{item.summary}</p>{#if item.evidence.length}<details><summary>Evidence references</summary><small class="muted">{item.evidence.join(' · ')}</small></details>{/if}</div>{/each}</section>
      {:else}<section class="panel empty"><Target size={36} /><h2>Work toward an outcome</h2><p>Create a Goal or select one to see its agreement, saved results and next review.</p></section>{/if}
    </section>
  </div>
</main>

<style>
  .goal-workbench {
    max-width:1280px;
    margin:auto;
    padding:24px 32px 64px;
    line-height:1.55
  }
  .topbar,.back,.intro,.heading,.actions {
    display:flex;
    align-items:center;
    gap:12px
  }
  .topbar,.heading {
    justify-content:space-between
  }
  .back {
    text-decoration:none;
    color:var(--text)
  }
  .intro {
    margin:32px 0
  }
  .intro h1 {
    margin:0;
    font-size:30px;
    letter-spacing:-.8px
  }
  .intro p {
    margin:4px 0;
    color:var(--muted)
  }
  .columns {
    display:grid;
    grid-template-columns:310px minmax(0,1fr);
    gap:24px
  }
  .columns>* {
    min-width:0
  }
  .panel {
    border:1px solid var(--border);
    border-radius:12px;
    padding:22px;
    margin-bottom:18px;
    background:var(--surface);
    overflow-wrap:anywhere
  }
  .panel h2 {
    font-size:16px;
    margin:0 0 16px
  }
  .create {
    display:flex;
    flex-direction:column;
    gap:14px
  }
  .create h2 {
    margin:0
  }
  .muted,small {
    color:var(--muted);
    font-size:12px
  }
  .muted {
    margin:0
  }
  .permission {
    display:flex;
    align-items:flex-start;
    gap:9px;
    font-size:13px
  }
  .permission input {
    margin-top:5px;
    flex-shrink:0
  }
  .pair {
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:12px
  }
  .pair label {
    font-size:12px
  }
  .pair :global(input) {
    margin-top:6px
  }
  .goal-list button {
    width:100%;
    justify-content:space-between;
    text-align:left;
    margin:6px 0;
    gap:12px
  }
  .goal-list button span {
    display:-webkit-box;
    -webkit-line-clamp:2;
    line-clamp:2;
    -webkit-box-orient:vertical;
    overflow:hidden
  }
  .goal-list .chosen {
    background:var(--accent-subtle);
    border-color:var(--accent)
  }
  .goal-list small {
    flex-shrink:0
  }
  .status {
    background:var(--inset);
    padding:4px 10px;
    border-radius:20px;
    font-size:12px
  }
  .objective {
    font-size:18px;
    font-weight:600
  }
  .original {
    white-space:pre-wrap
  }
  .actions {
    flex-wrap:wrap;
    margin-top:18px
  }
  .limits {
    margin-top:18px
  }
  .limits>* {
    margin:12px 0
  }
  .limits summary,summary {
    cursor:pointer;
    color:var(--muted);
    font-size:13px
  }
  .waiting {
    background:var(--inset);
    padding:12px;
    border-radius:8px
  }
  dl {
    display:grid;
    grid-template-columns:130px minmax(0,1fr);
    gap:8px;
    font-size:13px
  }
  dt {
    color:var(--muted)
  }
  dd {
    margin:0
  }
  .artifact+.artifact,.activity+.activity,.period+.period {
    border-top:1px solid var(--border);
    padding-top:16px;
    margin-top:16px
  }
  .artifact small,.period small {
    display:block;
    overflow-wrap:anywhere
  }
  .markdown {
    font-size:14px;
    line-height:1.7
  }
  .markdown :global(pre) {
    white-space:pre-wrap;
    overflow-wrap:anywhere
  }
  .markdown :global(h1) {
    font-size:24px
  }
  .markdown :global(h2) {
    margin-top:22px
  }
  .question {
    border-color:var(--accent)
  }
  form :global(textarea) {
    margin:8px 0 12px
  }
  .error {
    color:var(--destructive);
    border:1px solid var(--border);
    padding:12px;
    border-radius:8px
  }
  .empty {
    padding:60px 28px;
    text-align:center;
    color:var(--muted)
  }
  @media(max-width:760px) {
    .goal-workbench {
      padding:16px
    }
    .columns {
      grid-template-columns:1fr
    }
    .intro {
      align-items:flex-start;
      margin:24px 0
    }
    .intro h1 {
      font-size:26px
    }
    .panel {
      padding:18px
    }
    .heading {
      align-items:flex-start;
      flex-wrap:wrap
    }
    dl {
      grid-template-columns:105px minmax(0,1fr)
    }
    .artifact .heading {
      gap:8px
    }
  }
</style>
