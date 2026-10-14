const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// Crea la ventana de escritorio y selecciona la versión local o de desarrollo.
function createWindow() {
  // Buscar icono disponible (icono cuadrado para nitidez perfecta en barra y ventana)
  const iconCandidates = [
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../dist/deskplugit.png'),
    path.join(__dirname, '../public/deskplugit.png'),
  ];
  const iconPath = iconCandidates.find((p) => fs.existsSync(p)) || iconCandidates[iconCandidates.length - 1];

  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 950,
    minHeight: 650,
    title: 'PlugiT - Trayectorias de Puntada',
    icon: iconPath,
    autoHideMenuBar: true,
    // Aísla la interfaz del acceso directo a Node.js.
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// Inicia la ventana cuando Electron está listo y la restaura al activar la aplicación.
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// En Windows/Linux cierra el proceso cuando ya no quedan ventanas.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
