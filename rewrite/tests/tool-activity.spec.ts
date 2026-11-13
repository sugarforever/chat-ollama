import { expect, test } from 'vitest';
import { conversationTurns, toolLabel, activityBlocks } from '../src/lib/tool-activity';
import type { PublicEntry } from '../src/lib/contracts';
const user: PublicEntry = { id: 'user-1', kind: 'user', content: 'Check usage' };
const first: PublicEntry = { id: 'tool-1', kind: 'tool', toolName: 'bash', toolArguments: {command:'printf first'}, content:'first', toolStatus:'done' };
const second: PublicEntry = { id: 'tool-2', kind: 'tool', toolName:'bash', toolArguments:{command:'printf second'}, content:'', toolStatus:'running' };

test('turn history keeps completed commands while a later command runs and retains its identity on completion', () => {
  const running = conversationTurns([user, first, second], true);
  expect(running[0].activity).toEqual([first, second]);
  expect(running[0].answer).toBeUndefined();
  expect(running[0].active).toBe(true);
  const final: PublicEntry = {id:'answer',kind:'assistant',content:'Finished'};
  const completed = conversationTurns([user, first, {...second, toolStatus:'done'}, final], false);
  expect(completed[0].id).toBe(running[0].id);
  expect(completed[0].activity.map(entry => entry.id)).toEqual(['tool-1','tool-2']);
  expect(completed[0].answer).toEqual(final);
});

test('turn history preserves commentary order and separates later user turns', () => {
  const commentary: PublicEntry = {id:'comment',kind:'assistant',content:'Checking memory next'};
  const nextUser: PublicEntry = {id:'user-2',kind:'user',content:'Thanks'};
  const turns = conversationTurns([user, first, commentary, second, nextUser], true);
  expect(turns[0].activity).toEqual([first, commentary, second]);
  expect(turns[0].active).toBe(false);
  expect(turns[1].user).toEqual(nextUser);
  expect(turns[1].active).toBe(true);
});

test('command previews describe the actual input and retain the full command', () => {
  expect(toolLabel(first)).toBe('Ran printf first');
  expect(toolLabel(second)).toBe('Running printf second');
  expect(toolLabel({...first,toolError:true})).toBe('Failed printf first');
  expect(toolLabel({...first,toolName:'read',toolArguments:{path:'/tmp/notes.txt'}})).toBe('Read /tmp/notes.txt');
  expect(toolLabel({...first,toolName:'search_knowledge',toolArguments:{query:'orchard'}})).toBe('Ran search_knowledge · orchard');
});


test('command groups preserve their identity as calls append and keep commentary in order', () => {
  const comment: PublicEntry = {id:'comment',kind:'assistant',content:'Next check'};
  const initial = activityBlocks([first]);
  const expanded = activityBlocks([first, second, comment, {...first,id:'tool-3'}]);
  expect(expanded[0].id).toBe(initial[0].id);
  expect(expanded.map(block => block.entries.map(entry => entry.id))).toEqual([['tool-1','tool-2'],['comment'],['tool-3']]);
});


test('worked duration uses stored timestamps and a plain streamed answer stays outside activity', () => {
  const answer: PublicEntry = {id:'answer',kind:'assistant',content:'Done',timestamp:42000};
  const turn = conversationTurns([{...user,timestamp:1000}, first, answer], false)[0];
  expect(turn.durationSeconds).toBe(41);
  const partial = {...answer,partial:true};
  const streamed = conversationTurns([user,partial], true)[0];
  expect(streamed.activity).toEqual([]);
  expect(streamed.answer).toEqual(partial);
});
