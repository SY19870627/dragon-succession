import { app, BrowserWindow } from "electron";
import { fileURLToPath, pathToFileURL } from "url";
import { join, dirname } from "path";

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Creates the main Electron browser window and loads the Vite output.
 */
async function createMainWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1280,
    height: 720,
    title: "Dragon Succession",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (app.isPackaged) {
    const indexPath = join(ROOT_DIR, "..", "dist", "index.html");
    await window.loadURL(pathToFileURL(indexPath).toString());
  } else {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
    await window.loadURL(devServerUrl);
  }

  window.once("ready-to-show", () => {
    window.show();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

app
  .whenReady()
  .then(createMainWindow)
  .catch((error: unknown) => {
    console.error("Failed to create Electron window", error);
  });
