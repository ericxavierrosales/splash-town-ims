// Set environment variables
//process.env.NODE_ENV = 'production'
process.env.GITHUB_TOKEN = '14346e52a2c949917c28d125f076f0d7acec936b'

// Requires
const { app, BrowserWindow, Menu, ipcMain, dialog, autoUpdater } = require('electron')
const isDev  = require('electron-is-dev')
const url    = require('url')
const path   = require('path')
const server = 'https://update.electronjs.org'
const feed   = `${server}/ericxavierrosales/splash-town-ims/${process.platform}-${process.arch}/${app.getVersion()}`

require ('update-electron-app')()

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit()
}

app.setAppUserModelId("com.electron.splash-town-pos-ims")

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let loginWindow
let currWindow
let loggedInUser

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1600,
    minWidth: 1600,
    height: 900,
    minHeight: 900,
    webPreferences: {
      nodeIntegration: true
    }
  })

  // and load the index.html of the app.
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Open the DevTools.
    mainWindow.webContents.openDevTools();

  // auto-update
  if (!isDev) {
    console.log('App is in production')
    autoUpdater.setFeedURL(feed)
    autoUpdater.checkForUpdates()

    setInterval(() => {
      autoUpdater.checkForUpdates()
    }, 5 * 60 * 1000)
  }
  else {
    console.log('App is in development')
  }

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  })

  // Initialize Menu
  const mainMenu = Menu.buildFromTemplate(menuTemplate)
  Menu.setApplicationMenu(mainMenu)

  currWindow = mainWindow

  
  // AUTOUPDATER EVENTS
  autoUpdater.on('checking-for-update', () => {
    dialog.showMessageBoxSync(mainWindow, {
      title: 'Checking for updates',
      message: 'Checking online for new updates...'
    })
  })

  autoUpdater.on('update-available', () => {
    dialog.showMessageBoxSync(mainWindow, {
      title: 'Checking for updates',
      message: 'An update is available!'
    })
  })

  autoUpdater.on('update-not-available', () => {
    dialog.showMessageBoxSync(mainWindow, {
      title: 'Checking for updates',
      message: 'There is no new update available! Check back later.'
    })
  })

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBoxSync(mainWindow, {
      title: 'Checking for updates',
      message: 'A new update has been downloaded! Restarting app...'
    })
    autoUpdater.quitAndInstall()
  })
}

function openLoginWindow() {
  // Create the browser window.
  loginWindow = new BrowserWindow({
    width: 600,
    height: 360,
    webPreferences: {
      nodeIntegration: true
    }
  })

  // and load the index.html of the app.
  loginWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'login.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Emitted when the window is closed.
  loginWindow.on('closed', function () {
    loginWindow = null
  })

  // Initialize menu
  const blankMenu = Menu.buildFromTemplate([])
  Menu.setApplicationMenu(blankMenu)

  currWindow = loginWindow
}

function signOut() {
  loggedInUser = null
  openLoginWindow()
  mainWindow.close()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', openLoginWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// IPC events
ipcMain.on('notif:send', function(e, notif) {
  dialog.showMessageBoxSync(mainWindow, {
    title: notif.title,
    message: notif.message,
    type: notif.type
  })
})

ipcMain.on('login:success', function(e, user) {
  createWindow()
  loginWindow.close()
  mainWindow.maximize()

  loggedInUser = user
})

ipcMain.on('login:getUser', function(e) {
  mainWindow.webContents.send('login:returnLoggedInUser', loggedInUser)
})

ipcMain.on('user:signOut', function(e) {
  signOut()
})

// Menu settings
const menuTemplate = [
  {
      label: 'Menu',
      submenu: [
          {
              label: 'Reload',
              role: 'reload'
          },
          {
              label: "Check for Updates",
              click() {
                autoUpdater.checkForUpdates()
              }
          },
          {
              label: 'Sign Out',
              click() {
                signOut()
              }
          },
          {
              label: 'Exit',
              accelerator: process.platform == 'darwin' ? 'Command+Q' : 'Ctrl+Alt+Q',
              click() {
                  app.quit()
              }
          }
      ]
  }
]

if (process.env.NODE_ENV !== 'production') {
  menuTemplate.push({
      label: 'Dev Tools',
      submenu: [
          {
              label: 'Toggle Developer Tools',
              accelerator: process.platform == 'darwin' ? 'Command+I' : 'Ctrl+Shift+I',
              click(i, currentWindow) {
                  currentWindow.toggleDevTools()
              }
          }
      ]
  })
}

if (process.platform == 'darwin') {
  menuTemplate.unshift({})
}

