<script lang="ts">
  import Button from '$lib/components/ui/button/button.svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import type { Artifact, Deliverable, Goal } from '$lib/goals/contracts';

  let {
    goal,
    deliverables,
    artifacts,
    busy,
    pendingGoal,
    currentGoalId,
    renderMarkdown,
    formatTime,
    onAnswer,
  }: {
    goal: Goal;
    deliverables: Deliverable[];
    artifacts: Artifact[];
    busy: boolean;
    pendingGoal: string;
    currentGoalId: string;
    renderMarkdown: (content: string) => string;
    formatTime: (at: number | null) => string;
    onAnswer: (deliverableId: string, text: string) => Promise<boolean>;
  } = $props();

  let answers = $state<Record<string, string>>({});

  const terminal = $derived(['completed', 'cancelled'].includes(goal.lifecycle));
  const acceptedCount = $derived(deliverables.filter(d => d.state === 'succeeded').length);
  const waitingCount = $derived(deliverables.filter(d => d.state === 'waiting').length);

  const artifactsById = $derived(new Map(artifacts.map(a => [a.id, a])));
  const deliverableEntries = $derived(
    deliverables.map(item => ({
      item,
      artifact: item.artifactId ? artifactsById.get(item.artifactId) : undefined,
      activeQuestion: item.question
        ?? (goal.questionDeliverableId === item.id && goal.question ? goal.question : null),
    }))
  );

  async function submitAnswer(event: SubmitEvent, deliverableId: string) {
    event.preventDefault();
    const value = (answers[deliverableId] ?? '').trim();
    if (!value || busy) return;
    const ok = await onAnswer(deliverableId, value);
    if (ok) answers[deliverableId] = '';
  }
</script>

<section class="panel deliverables-panel" data-testid="deliverables-panel" aria-label="Deliverables">
  <div class="heading">
    <h2>Deliverables</h2>
    <span class="progress-badge" data-testid="deliverables-progress">{acceptedCount} / {deliverables.length} accepted</span>
  </div>
  <div class="progress-track" aria-hidden="true">
    <div class="progress-fill" style:width={`${deliverables.length ? (acceptedCount / deliverables.length) * 100 : 0}%`}></div>
  </div>
  {#if acceptedCount > 0 && waitingCount > 0 && !terminal}
    <p class="muted progress-note">Accepted deliverables stay saved while blocked items wait for your input.</p>
  {/if}

  <div class="deliverable-list">
    {#each deliverableEntries as { item, artifact, activeQuestion } (item.id)}
      <article class="deliverable-card" class:is-waiting={item.state === 'waiting'} class:is-succeeded={item.state === 'succeeded'} data-testid={`deliverable-${item.id}`}>
        <div class="heading card-heading">
          <h3>{item.title}</h3>
          <span class={`state-badge state-${item.state}`} data-testid={`deliverable-state-${item.id}`}>{item.state}</span>
        </div>

        {#if item.criteria.length}
          <div class="section-block">
            <span class="section-label">Acceptance criteria</span>
            <ul class="criteria-list">
              {#each item.criteria as criterion}
                <li>{criterion}</li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if item.missing.length && item.state !== 'succeeded'}
          <div class="section-block missing-block">
            <span class="section-label">Missing input</span>
            <ul class="criteria-list">
              {#each item.missing as gap}
                <li>{gap}</li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if item.state === 'waiting' && activeQuestion && !terminal}
          <div class="deliverable-question" data-testid={`deliverable-question-${item.id}`}>
            <p class="question-owner">Needs your input for <strong>{item.title}</strong></p>
            <p class="question-text">{activeQuestion}</p>
            <form onsubmit={event => submitAnswer(event, item.id)}>
              <label for={`deliverable-answer-${item.id}`}>Reply for {item.title}</label>
              <Textarea
                id={`deliverable-answer-${item.id}`}
                value={answers[item.id] ?? ''}
                oninput={e => { answers[item.id] = (e.currentTarget as HTMLTextAreaElement).value; }}
                disabled={busy && pendingGoal === currentGoalId}
                required
                rows={3}
                placeholder={`Supply the missing details for ${item.title}…`}
              />
              <p class="muted">This reply applies only to "{item.title}". Previously accepted deliverables remain intact.</p>
              <div class="form-actions">
                <Button type="submit" disabled={busy || !(answers[item.id] ?? '').trim()}>
                  Send answer for {item.title}
                </Button>
              </div>
            </form>
          </div>
        {/if}

        {#if item.clarifications.length}
          <details class="meta-details">
            <summary>Supplied clarifications ({item.clarifications.length})</summary>
            <ul class="criteria-list">
              {#each item.clarifications as note}
                <li>{note}</li>
              {/each}
            </ul>
          </details>
        {/if}

        {#if artifact}
          {#key artifact.id}
            <div class="deliverable-artifact" data-testid={`deliverable-artifact-${item.id}`} data-artifact-id={artifact.id}>
              <div class="heading artifact-heading">
                <small>Saved {formatTime(artifact.createdAt)}</small>
                <a href={`/api/goals/${goal.id}/artifacts/${encodeURIComponent(artifact.id)}?download=1`}>Download Markdown</a>
              </div>
              <div class="markdown">{@html renderMarkdown(artifact.content)}</div>
            </div>
          {/key}
        {/if}

        {#if item.evidence.length}
          <details class="meta-details evidence-details" data-testid={`deliverable-evidence-${item.id}`}>
            <summary>Acceptance evidence ({item.evidence.length})</summary>
            <small class="evidence-text">{item.evidence.join(' · ')}</small>
          </details>
        {/if}
      </article>
    {/each}
  </div>
</section>

<style>
  .deliverables-panel {
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 22px;
    margin-bottom: 18px;
    background: var(--surface);
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .deliverables-panel h2 {
    font-size: 16px;
    margin: 0;
  }
  .progress-badge {
    background: var(--inset);
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }
  .progress-track {
    height: 6px;
    border-radius: 999px;
    background: var(--inset);
    margin: 12px 0 14px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 999px;
    transition: width 0.25s ease;
  }
  .progress-note {
    margin: 0 0 14px;
  }
  .deliverable-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .deliverable-card {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    background: var(--surface);
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .deliverable-card.is-waiting {
    border-color: var(--accent);
  }
  .card-heading {
    margin-bottom: 10px;
  }
  .card-heading h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .state-badge {
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 12px;
    background: var(--inset);
    flex-shrink: 0;
  }
  .state-succeeded {
    background: var(--accent-subtle);
    color: var(--text);
  }
  .state-waiting {
    border: 1px solid var(--accent);
  }
  .state-failed {
    color: var(--destructive);
    border: 1px solid var(--destructive);
  }
  .section-block {
    margin-top: 10px;
  }
  .section-label {
    display: block;
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .criteria-list {
    margin: 0;
    padding-left: 18px;
    font-size: 13px;
  }
  .criteria-list li + li {
    margin-top: 4px;
  }
  .missing-block {
    background: var(--inset);
    padding: 10px 12px;
    border-radius: 8px;
  }
  .deliverable-question {
    margin-top: 12px;
    padding: 14px;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: var(--inset);
  }
  .question-owner {
    margin: 0 0 6px;
    font-size: 13px;
  }
  .question-text {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 500;
  }
  .deliverable-question label {
    display: block;
    font-size: 12px;
    color: var(--muted);
  }
  .deliverable-question :global(textarea) {
    margin: 6px 0 8px;
    width: 100%;
    box-sizing: border-box;
  }
  .form-actions {
    margin-top: 10px;
  }
  .form-actions :global(button) {
    max-width: 100%;
    white-space: normal;
    height: auto;
    text-align: center;
  }
  .deliverable-artifact {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .artifact-heading {
    margin-bottom: 8px;
  }
  .markdown {
    font-size: 14px;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }
  .markdown :global(pre) {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .markdown :global(h1) {
    font-size: 20px;
  }
  .markdown :global(h2) {
    font-size: 16px;
    margin-top: 16px;
  }
  .meta-details {
    margin-top: 10px;
  }
  .meta-details summary {
    cursor: pointer;
    color: var(--muted);
    font-size: 12px;
  }
  .evidence-text {
    display: block;
    margin-top: 6px;
    color: var(--muted);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .muted, small {
    color: var(--muted);
    font-size: 12px;
  }
  .muted {
    margin: 0;
  }
  @media (max-width: 760px) {
    .deliverables-panel {
      padding: 18px;
    }
    .deliverable-card {
      padding: 14px;
    }
    .deliverable-question {
      padding: 12px;
    }
  }
</style>
