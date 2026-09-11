import {
  CombinedAutocompleteProvider,
  Editor,
  matchesKey,
  ProcessTerminal,
  SelectList,
  Text,
  TuiMainScreen,
  type TUI,
  type Terminal,
} from '@earendil-works/pi-tui';

import type { RunCliOptions } from './cli.js';
import {
  createCommandHandler,
  parseCommandInput,
  type ParsedCommand,
} from './commands.js';

export type InteractiveTerminal = Terminal;

export interface RunInteractiveCliOptions
  extends Omit<RunCliOptions, 'input' | 'output' | 'error'> {
  readonly terminal?: InteractiveTerminal;
}

export async function runInteractiveCli(
  options: RunInteractiveCliOptions,
): Promise<void> {
  const terminal = options.terminal ?? new ProcessTerminal();
  const tui: TUI = new TuiMainScreen(terminal, true);
  let text = 'ChatOllama Agent CLI\nType / for commands. Ctrl+C cancels a run or quits when idle.';
  const transcript = new Text(text, 0, 0);
  const status = new Text('', 0, 0);
  const identity = (text: string) => text;
  const selectTheme = {
    selectedPrefix: identity,
    selectedText: identity,
    description: identity,
    scrollInfo: identity,
    noMatch: identity,
  };
  const editor = new Editor(tui, {
    borderColor: identity,
    selectList: selectTheme,
  });
  editor.setAutocompleteProvider(
    new CombinedAutocompleteProvider([
      { name: 'models', description: 'Choose an available model' },
      { name: 'model', description: 'Switch provider/model-id' },
      { name: 'skills', description: 'List workspace Skills for this session' },
      { name: 'new', description: 'Clear conversation history' },
      { name: 'exit', description: 'Quit' },
    ], process.cwd()),
  );
  const models = [...(options.availableModels ?? [])].sort((left, right) => {
    const a = `${left.provider}/${left.model}`;
    const b = `${right.provider}/${right.model}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const handleCommand = createCommandHandler({
    session: options.session,
    availableModels: models,
    env: options.env ?? process.env,
    writePreference: options.writePreference ?? (async () => {}),
  });
  let picker: SelectList | undefined;
  let closed = false;
  let runStatus = '';
  let runActive = false;
  let responseOpen = false;
  let assistantLabel = 'Assistant> ';
  let failureReported = false;
  let finish!: () => void;
  const done = new Promise<void>(resolve => {
    finish = resolve;
  });

  const append = (line: string) => {
    text += `\n${line}`;
    transcript.setText(text);
    tui.requestRender();
  };
  const updateStatus = () => {
    const current = options.session.getSnapshot().model;
    status.setText(
      `Model: ${current.provider}/${current.model}${runStatus ? `\n${runStatus}` : ''}`,
    );
    tui.requestRender();
  };
  const closePicker = () => {
    if (picker) tui.removeChild(picker);
    picker = undefined;
    if (!tui.children.includes(editor)) tui.addChild(editor);
    tui.setFocus(editor);
    updateStatus();
  };
  const showPicker = () => {
    const current = options.session.getSnapshot().model;
    tui.removeChild(editor);
    status.setText(
      'Available models: ↑/↓ to move, Enter to select, Escape to cancel',
    );
    picker = new SelectList(
      models.map(model => ({
        value: `${model.provider}/${model.model}`,
        label: `${model.provider}/${model.model}${
          model.provider === current.provider && model.model === current.model ? ' (current)' : ''
        }`,
      })),
      8,
      selectTheme,
    );
    picker.onSelect = item => {
      closePicker();
      void submit(parseCommandInput(`/model ${item.value}`));
    };
    picker.onCancel = () => {
      closePicker();
      void submit({ type: 'cancel-model-selection' });
    };
    tui.addChild(picker);
    tui.setFocus(picker);
    tui.requestRender();
  };
  const submit = async (command: ParsedCommand): Promise<void> => {
    editor.disableSubmit = true;
    try {
      const result = await handleCommand(command);
      if (closed) return;
      if (result.type === 'exit') {
        append('Goodbye.');
        tui.renderNow();
        finish();
      } else if (result.type === 'continue') {
        if (result.inputMode === 'model-selection') {
          showPicker();
        } else {
          for (const line of result.lines) append(line);
        }
        if (!picker) updateStatus();
      } else if (result.input.length > 0) {
        append(`You> ${result.input}`);
        failureReported = false;
        await options.session.prompt(result.input);
      }
    } catch {
      if (!closed && !failureReported) append('[error] Runtime prompt failed');
    } finally {
      editor.disableSubmit = false;
      if (!closed) tui.requestRender();
    }
  };

  tui.addChild(transcript);
  tui.addChild(status);
  tui.addChild(editor);
  tui.setFocus(editor);
  updateStatus();
  for (const notice of options.notices ?? []) append(`[warning] ${notice}`);
  editor.onSubmit = value => {
    void submit(parseCommandInput(value));
  };
  tui.addInputListener(data => {
    if (matchesKey(data, 'ctrl+c')) {
      if (runActive) {
        options.session.cancel();
        return { consume: true };
      }
      finish();
      return { consume: true };
    }
  });
  const unsubscribe = options.session.subscribe(event => {
    if (closed) return;
    switch (event.type) {
      case 'run.started':
        runActive = true;
        runStatus = `[run ${event.runId}] started`;
        break;
      case 'step.started':
        runStatus = `[step ${event.step}] started`;
        break;
      case 'step.completed':
        if (event.reason === 'tool-calls') responseOpen = false;
        runStatus = `[step ${event.step}] completed: ${event.reason}`;
        break;
      case 'tool.started':
        responseOpen = false;
        append(`[tool ${event.call.toolName}] running ${event.call.input}`);
        break;
      case 'tool.completed':
        responseOpen = false;
        append(
          `[tool ${event.result.toolName}] completed ${event.result.output}`,
        );
        break;
      case 'tool.failed':
        responseOpen = false;
        append(`[tool ${event.result.toolName}] failed ${event.result.output}`);
        break;
      case 'model.started':
        assistantLabel = `Assistant (${event.model.provider}/${event.model.model})> `;
        break;
      case 'model.delta':
        if (!responseOpen) {
          append(assistantLabel);
          responseOpen = true;
        }
        text += event.delta;
        transcript.setText(text);
        tui.requestRender();
        break;
      case 'model.completed':
        responseOpen = false;
        break;
      case 'run.completed':
        runActive = false;
        responseOpen = false;
        runStatus = `[run ${event.runId}] completed`;
        break;
      case 'run.stopped':
        runActive = false;
        responseOpen = false;
        runStatus = `[run ${event.runId}] stopped: step limit reached`;
        break;
      case 'run.failed':
        runActive = false;
        responseOpen = false;
        append(`[error] ${event.error.message}`);
        failureReported = true;
        runStatus = `[run ${event.runId}] failed`;
        break;
      case 'run.cancelled':
        runActive = false;
        responseOpen = false;
        runStatus = `[run ${event.runId}] cancelled`;
        break;
      case 'model.changed':
      case 'session.reset':
        break;
    }
    if (!picker) updateStatus();
  });

  try {
    tui.start();
    await done;
  } finally {
    closed = true;
    unsubscribe();
    try {
      options.session.cancel();
      await terminal.drainInput();
    } finally {
      tui.stop();
    }
  }
}
