const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
} = require("electron");
const { join } = require("node:path");
const { mkdirSync } = require("node:fs");
const { externalUrl } = require("./url-policy.cjs");

// Stable across versions and architectures. A TUI can opt into this same directory.
app.setName("ChatOllama");
let backend;
let window;
let quitting = false;
const directory =
  process.env.CHATOLLAMA_DATA_DIR || join(app.getPath("userData"), "backend");
// The lock is per selected data directory, not per release/install location.
mkdirSync(join(directory, "desktop"), { recursive: true, mode: 0o700 });
app.setPath("userData", join(directory, "desktop"));
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!window && backend && !quitting) void createWindow();
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app.on("before-quit", (event) => {
    if (quitting || !backend) return;
    event.preventDefault();
    quitting = true;
    void backend.close().finally(() => app.quit());
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("activate", () => {
    if (backend && !quitting) {
      if (!window) void createWindow();
      else window.show();
    }
  });
  void app
    .whenReady()
    .then(start)
    .catch((error) => {
      dialog.showErrorBox("ChatOllama could not start", error.message);
      app.quit();
    });
}

async function start() {
  const { connectBackend } = await import("./backend-client.mjs");
  const root = app.isPackaged
    ? join(process.resourcesPath, "backend")
    : join(__dirname, "..");
  const node = app.isPackaged
    ? join(process.resourcesPath, "runtime", "bin", "node")
    : process.env.CHATOLLAMA_NODE;
  if (!node)
    throw new Error(
      "Set CHATOLLAMA_NODE to a Node 24 executable, or use pnpm desktop:dev.",
    );
  backend = await connectBackend({
    directory,
    node,
    server: join(root, "server.mjs"),
  });
  backend.child?.once("exit", () => {
    if (!quitting) {
      dialog.showErrorBox(
        "ChatOllama backend stopped",
        "Quit and reopen ChatOllama to recover pending work.",
      );
      app.quit();
    }
  });
  ipcMain.handle("open-external", async (event, value) => {
    if (
      event.sender !== window?.webContents ||
      new URL(event.senderFrame.url).origin !== backend.origin
    )
      throw new Error("Untrusted sender");
    const url = externalUrl(value);
    if (!url) throw new Error("Only HTTP and HTTPS links can be opened");
    await shell.openExternal(url);
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ]),
  );
  await createWindow();
}

async function createWindow() {
  window = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 480,
    minHeight: 400,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  const contents = window.webContents;
  // No credential enters renderer JS or a URL. Never send it to another origin.
  contents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders;
    if (new URL(details.url).origin === backend.origin)
      headers.Authorization = `Bearer ${backend.token}`;
    else {
      delete headers.Authorization;
      delete headers.authorization;
    }
    callback({ requestHeaders: headers });
  });
  contents.setWindowOpenHandler(({ url }) => {
    const safe = externalUrl(url);
    if (safe) void shell.openExternal(safe).catch(() => {});
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (new URL(url).origin === backend.origin) return;
    event.preventDefault();
    const safe = externalUrl(url);
    if (safe) void shell.openExternal(safe).catch(() => {});
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  window.once("ready-to-show", () => window?.show());
  window.on("closed", () => {
    window = undefined;
  });
  await window.loadURL(backend.origin);
}
