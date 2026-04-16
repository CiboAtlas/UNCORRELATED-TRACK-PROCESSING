'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');

let mainWindow = null;
let serverProcess = null;
const SERVER_PORT = process.env.PORT || '3000';
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: '#0b0f14',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Window failed to load:', errorCode, errorDescription);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function waitForServer(url, timeoutMs = 30000, intervalMs = 500) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function tryConnect() {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });

      req.on('error', () => {
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`Timed out waiting for server at ${url}`));
          return;
        }
        setTimeout(tryConnect, intervalMs);
      });

      req.setTimeout(3000, () => {
        req.destroy();
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`Timed out waiting for server at ${url}`));
          return;
        }
        setTimeout(tryConnect, intervalMs);
      });
    }

    tryConnect();
  });
}

async function startServer() {
  const isPackaged = app.isPackaged;

  const serverPath = isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'server.js')
    : path.join(__dirname, 'server.js');

  const cwdPath = isPackaged ? process.resourcesPath : __dirname;

  const appSettingsFile = path.join(app.getPath('userData'), 'app-settings.json');

  serverProcess = fork(serverPath, [], {
    cwd: cwdPath,
    env: {
      ...process.env,
      PORT: SERVER_PORT,
      APP_SETTINGS_FILE: appSettingsFile
    },
    silent: false
  });

  serverProcess.on('error', (error) => {
    console.error('Failed to start server:', error);
  });

  serverProcess.on('exit', (code) => {
    console.log(`Server process exited with code ${code}`);
  });

  await waitForServer(SERVER_URL, 30000, 500);
}

function stopServer() {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch (error) {
      console.error('Failed to stop server process:', error);
    }
    serverProcess = null;
  }
}

app.whenReady().then(async () => {
  try {
    await startServer();
    createWindow();
  } catch (error) {
    console.error('App failed to start:', error);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  stopServer();
});

app.on('window-all-closed', () => {
  stopServer();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
