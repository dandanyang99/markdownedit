const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { dialog } = require('electron');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // 创建浏览器窗口
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'assets/icon.png'), // 可选图标
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // 加载 index.html
  mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'));

  // 打开开发者工具
  // mainWindow.webContents.openDevTools();
};

// 这段程序将会在 Electron 结束初始化时被调用
app.on('ready', createWindow);

// 当全部窗口关闭时退出
app.on('window-all-closed', () => {
  // 在 macOS 上，除非用户明确地按 Cmd+Q 退出，否则通常应用程序会继续运行
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // 在 macOS 上，当单击 dock 图标并且没有其他窗口打开时，
  // 通常在应用程序中重新创建一个窗口
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 为应用程序创建菜单栏
app.whenReady().then(() => {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: 'Ctrl+N', click: () => console.log('新建文件') },
        { label: '打开', accelerator: 'Ctrl+O', click: () => console.log('打开文件') },
        { label: '保存', accelerator: 'Ctrl+S', click: () => console.log('保存文件') },
        { type: 'separator' },
        { label: '退出', role: 'quit' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于', click: () => console.log('关于信息') }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
});

// IPC 通信处理
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  
  return null;
});

ipcMain.handle('scan-directory', async (event, folderPath) => {
  try {
    const items = fs.readdirSync(folderPath);
    const treeData = [];
    
    for (const item of items) {
      const fullPath = path.join(folderPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // 检查目录中是否包含 .md 文件
        const dirItems = fs.readdirSync(fullPath);
        const hasMdFiles = dirItems.some(file => file.toLowerCase().endsWith('.md'));
        
        if (hasMdFiles) {
          treeData.push({
            name: item,
            type: 'folder',
            path: fullPath,
            children: scanMdFilesInFolder(fullPath)
          });
        }
      } else if (item.toLowerCase().endsWith('.md')) {
        treeData.push({
          name: item,
          type: 'file',
          path: fullPath
        });
      }
    }
    
    return treeData;
  } catch (error) {
    console.error('扫描目录时发生错误:', error);
    return [];
  }
});

// 辅助函数：递归扫描文件夹中的 .md 文件
function scanMdFilesInFolder(folderPath) {
  const items = fs.readdirSync(folderPath);
  const children = [];
  
  for (const item of items) {
    const fullPath = path.join(folderPath, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      const subChildren = scanMdFilesInFolder(fullPath);
      if (subChildren.length > 0) {
        children.push({
          name: item,
          type: 'folder',
          path: fullPath,
          children: subChildren
        });
      }
    } else if (item.toLowerCase().endsWith('.md')) {
      children.push({
        name: item,
        type: 'file',
        path: fullPath
      });
    }
  }
  
  return children;
}

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error('读取文件时发生错误:', error);
    return '';
  }
});

ipcMain.handle('save-file', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error('保存文件时发生错误:', error);
    return false;
  }
});