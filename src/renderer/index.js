// 等待 DOM 加载完成后再执行
document.addEventListener('DOMContentLoaded', function() {
  // 动态创建页面结构
  document.getElementById('root').innerHTML = `
    <div class="toolbar">
      <button id="mode-toggle" title="切换编辑模式">切换模式</button>
      <span id="mode-indicator">当前: Markdown 模式</span>
      <span style="margin: 0 10px;">|</span>
      <button id="split-mode-btn" title="分栏预览模式">分栏预览</button>
      <button id="focus-mode-btn" title="专注模式">专注</button>
      <button id="theme-toggle-btn" title="夜间模式">🌙</button>
      <button id="bold-btn" title="加粗">B</button>
      <button id="italic-btn" title="斜体">I</button>
      <button id="heading-btn" title="标题">H</button>
      <button id="link-btn" title="链接">🔗</button>
      <button id="image-btn" title="图片">🖼️</button>
      <button id="list-btn" title="列表">•</button>
      <button id="code-btn" title="代码">{'{}'}</button>
      <button id="quote-btn" title="引用">❝</button>
      <button id="numbered-list-btn" title="有序列表">1.</button>
      <button id="code-block-btn" title="代码块">{'{}'}</button>
    </div>
    <div class="container">
      <div class="editor-container">
        <div class="editor-section">
          <div class="editor-panel">
            <textarea id="editor" placeholder="在这里输入 Markdown..." style="display: block; width: 100%; height: 100%; padding: 10px; border: none; outline: none; font-family: 'Courier New', monospace; font-size: 14px; line-height: 1.5;"></textarea>
            <div id="rich-editor" contenteditable="true" placeholder="在这里进行富文本编辑..." style="display: none; width: 100%; height: 100%; padding: 10px; border: none; outline: none; font-family: 'Courier New', monospace; font-size: 14px; line-height: 1.5;"></div>
          </div>
          <div class="preview-panel">
            <div id="preview" class="preview-content"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="status-bar">
      <span>行数: <span id="line-count">0</span></span>
      <span>字符数: <span id="char-count">0</span></span>
    </div>
  `;

  // 获取元素
  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const lineCount = document.getElementById('line-count');
  const charCount = document.getElementById('char-count');
  const modeToggle = document.getElementById('mode-toggle');
  const modeIndicator = document.getElementById('mode-indicator');

  // 初始化状态
  let currentMode = 'markdown';
  let splitMode = false; // 分栏预览模式状态
  let currentFilePath = null; // 记录当前打开的文件路径
  
  // 确保在DOM加载完成后执行
  document.addEventListener('DOMContentLoaded', function() {
    // 初始化分栏模式状态
    if (splitMode) {
      document.querySelector('.container').classList.add('split-mode');
    }
  });

  // 设置marked选项
  marked.setOptions({
    gfm: true,
    breaks: true,
    smartLists: true,
    smartypants: true
  });

  // 更新预览
  function updatePreview() {
    let markdown;
    if (currentMode === 'markdown') {
      markdown = editor.value;
    } else {
      const richContent = document.getElementById('rich-editor').innerHTML;
      markdown = htmlToMarkdown(richContent);
    }
    try {
      const rendered = marked.parse(markdown);
      preview.innerHTML = DOMPurify.sanitize(rendered);
    } catch (e) {
      console.error('Markdown 解析错误:', e);
      preview.innerHTML = '<div style="color: red;">Markdown 解析错误，请检查语法</div>';
    }
    
    // 更新状态栏
    updateStatusBar();
  }

  // 更新状态栏
  function updateStatusBar() {
    const text = currentMode === 'markdown' ? editor.value : '';
    const lines = text.split('\n').length;
    const chars = text.length;
    
    lineCount.textContent = lines;
    charCount.textContent = chars;
  }

  // 插入文本
  function insertAtCursor(textToInsert) {
    if (currentMode === 'markdown') {
      const startPos = editor.selectionStart;
      const endPos = editor.selectionEnd;
      const before = editor.value.substring(0, startPos);
      const after = editor.value.substring(endPos, editor.value.length);
      
      editor.value = before + textToInsert + after;
      
      const newPos = startPos + textToInsert.length;
      editor.setSelectionRange(newPos, newPos);
      editor.focus();
      
      updatePreview();
    } else {
      // 富文本模式下插入文本
      document.getElementById('rich-editor').focus();
      document.execCommand('insertText', false, textToInsert);
      updatePreview();
    }
  }

  // 插入 Markdown 语法
  function insertMarkdownSyntax(prefix, suffix, placeholder) {
    if (currentMode === 'markdown') {
      const startPos = editor.selectionStart;
      const endPos = editor.selectionEnd;
      const selectedText = editor.value.substring(startPos, endPos);
      const textToInsert = selectedText || placeholder;
      
      const before = editor.value.substring(0, startPos);
      const after = editor.value.substring(endPos, editor.value.length);
      
      editor.value = before + prefix + textToInsert + suffix + after;
      
      let newPos;
      if (selectedText) {
        newPos = startPos + prefix.length + selectedText.length + suffix.length;
      } else {
        newPos = startPos + prefix.length;
      }
      
      editor.setSelectionRange(newPos, newPos);
      editor.focus();
      updatePreview();
    } else {
      // 在富文本模式下应用格式
      document.getElementById('rich-editor').focus();
      
      if (prefix === '**' && suffix === '**') { // 加粗
        document.execCommand('bold', false, null);
      } else if (prefix === '*' && suffix === '*') { // 斜体
        document.execCommand('italic', false, null);
      } else if (prefix === '`' && suffix === '`') { // 代码
        document.execCommand('fontFamily', false, 'Courier New');
      } else if (prefix === '# ') { // 标题
        document.execCommand('formatBlock', false, '<h2>');
      } else if (prefix === '> ') { // 引用
        document.execCommand('formatBlock', false, '<blockquote>');
      } else if (prefix === '- ' || prefix === '1. ') { // 列表
        document.execCommand('insertUnorderedList', false, null);
      } else if (prefix.includes('``\n') && suffix.includes('\n```')) { // 代码块
        // 对整个选定内容应用代码块格式
        document.execCommand('formatBlock', false, '<pre>');
      }
      updatePreview();
    }
  }
  
  // 富文本编辑器格式化函数
  function formatRichText(command, value = null) {
    if (currentMode === 'rich') {
      document.getElementById('rich-editor').focus();
      document.execCommand(command, false, value);
      updatePreview();
    }
  }
  
  // 为富文本编辑器添加选择改变监听
  function setupRichEditorListeners() {
    const richEditor = document.getElementById('rich-editor');
    
    // 监听富文本编辑器内容变化
    richEditor.addEventListener('input', function() {
      if (currentMode === 'rich') {
        updatePreview();
      }
    });
    
    // 监听键盘快捷键
    richEditor.addEventListener('keydown', function(e) {
      // Ctrl+B -> 加粗
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        formatRichText('bold');
      }
      // Ctrl+I -> 斜体
      if (e.ctrlKey && e.key === 'i') {
        e.preventDefault();
        formatRichText('italic');
      }
      // Ctrl+U -> 下划线
      if (e.ctrlKey && e.key === 'u') {
        e.preventDefault();
        formatRichText('underline');
      }
    });
  }

  // 切换模式
  function toggleEditorMode() {
    if (currentMode === 'markdown') {
      // 切换到富文本模式
      const markdownContent = editor.value;
      const htmlContent = marked.parse(markdownContent);
      document.getElementById('rich-editor').innerHTML = DOMPurify.sanitize(htmlContent);
      
      editor.style.display = 'none';
      document.getElementById('rich-editor').style.display = 'block';
      
      currentMode = 'rich';
      modeIndicator.textContent = '当前: 富文本模式';
    } else {
      // 切换到 Markdown 模式
      const richContent = document.getElementById('rich-editor').innerHTML;
      const markdownContent = htmlToMarkdown(richContent);
      editor.value = markdownContent;
      
      document.getElementById('rich-editor').style.display = 'none';
      editor.style.display = 'block';
      
      currentMode = 'markdown';
      modeIndicator.textContent = '当前: Markdown 模式';
      updatePreview();
    }
  }

  // HTML 到 Markdown 转换
  function htmlToMarkdown(html) {
    let markdown = html;
    
    // 标题
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n');
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n');
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n');
    
    // 加粗和斜体
    markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
    
    // 链接和图片
    markdown = markdown.replace(/<a[^>]+href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');
    markdown = markdown.replace(/<img[^>]+src=["']([^"']*)["'][^>]*>/gi, '![]($1)');
    
    // 引用
    markdown = markdown.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n');
    
    // 代码
    markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
    
    // 列表
    markdown = markdown.replace(/<ul[^>]*>(.*?)<\/ul>/gi, '$1');
    markdown = markdown.replace(/<ol[^>]*>(.*?)<\/ol>/gi, '$1');
    markdown = markdown.replace(/<li>(.*?)<\/li>/gi, '- $1\n');
    
    // 移除其他标签
    markdown = markdown.replace(/<[^>]*>/g, '');
    
    return markdown.trim();
  }

  // 绑定事件
  modeToggle.addEventListener('click', toggleEditorMode);
  
  // 分栏预览模式分隔线拖拽功能
  let isDragging = false;
  let startX, startWidth;
  const splitter = document.createElement('div');
  splitter.className = 'splitter';
  document.querySelector('.editor-section').appendChild(splitter);

  splitter.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startWidth = document.querySelector('.editor-panel').offsetWidth;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const container = document.querySelector('.container');
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const minWidth = 180; // 左侧最小宽度
    const maxWidth = containerRect.width - 200; // 右侧最小宽度200px

    let newWidth = startWidth + (e.clientX - startX);
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

    document.querySelector('.editor-panel').style.width = `${newWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.style.cursor = 'default';
  });

  // 夜间模式状态
  let isDarkTheme = false;

  // 夜间模式按钮
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    // 从localStorage加载主题偏好
    isDarkTheme = localStorage.getItem('dark-theme') === 'true';
    if (isDarkTheme) {
      document.body.classList.add('dark-theme');
      themeToggleBtn.textContent = '☀️';
    }

    themeToggleBtn.addEventListener('click', () => {
      isDarkTheme = !isDarkTheme;
      if (isDarkTheme) {
        document.body.classList.add('dark-theme');
        themeToggleBtn.textContent = '☀️';
        localStorage.setItem('dark-theme', 'true');
      } else {
        document.body.classList.remove('dark-theme');
        themeToggleBtn.textContent = '🌙';
        localStorage.setItem('dark-theme', 'false');
      }
    });
  }

  // 专注模式状态
  let focusMode = false;

  // 专注模式按钮
  const focusModeBtn = document.getElementById('focus-mode-btn');
  if (focusModeBtn) {
    focusModeBtn.addEventListener('click', () => {
      console.log('专注模式按钮被点击');
      focusMode = !focusMode;
      const container = document.querySelector('.container');
      if (container) {
        if (focusMode) {
          container.classList.add('focus-mode');
          focusModeBtn.textContent = '退出专注';
        } else {
          container.classList.remove('focus-mode');
          focusModeBtn.textContent = '专注';
        }
        
        // 强制重新渲染
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 10);
      }
    });
  }
  
  // 工具栏按钮事件 - 根据当前模式执行不同操作
  document.getElementById('bold-btn').addEventListener('click', () => {
    if (currentMode === 'markdown') {
      insertMarkdownSyntax('**', '**', '加粗文字');
    } else {
      formatRichText('bold');
    }
  });
  
  document.getElementById('italic-btn').addEventListener('click', () => {
    if (currentMode === 'markdown') {
      insertMarkdownSyntax('*', '*', '斜体文字');
    } else {
      formatRichText('italic');
    }
  });
  
  document.getElementById('heading-btn').addEventListener('click', () => {
    if (currentMode === 'markdown') {
      insertMarkdownSyntax('# ', '', '标题文字');
    } else {
      formatRichText('formatBlock', '<h2>');
    }
  });
  
  document.getElementById('link-btn').addEventListener('click', () => {
    if (currentMode === 'markdown') {
      insertMarkdownSyntax('[', ']()', '链接文本');
    } else {
      // 在富文本模式下插入链接
      const url = prompt('请输入链接地址:');
      if (url) {
        formatRichText('createLink', url);
      }
    }
  });
  
  document.getElementById('image-btn').addEventListener('click', () => {
    if (currentMode === 'markdown') {
      insertMarkdownSyntax('![', ']()', '图片描述');
    } else {
      // 在富文本模式下插入图片
      const url = prompt('请输入图片地址:');
      if (url) {
        document.getElementById('rich-editor').focus();
        document.execCommand('insertImage', false, url);
        updatePreview();
      }
    }
  });
  
  document.getElementById('list-btn').addEventListener('click', () => {
    if (currentMode === 'markdown') {
      insertAtCursor('- ');
    } else {
      formatRichText('insertUnorderedList');
    }
  });
  
  document.getElementById('code-btn').addEventListener('click', () => {
    if (currentMode === 'markdown') {
      insertMarkdownSyntax('`', '`', '代码');
    } else {
      formatRichText('fontFamily', 'Courier New');
    }
  });
  
  document.getElementById('quote-btn').addEventListener('click', () => {
    if (currentMode === 'markdown') {
      insertAtCursor('> ');
    } else {
      formatRichText('formatBlock', '<blockquote>');
    }
  });
  
  document.getElementById('numbered-list-btn').addEventListener('click', () => {
    if (currentMode === 'markdown') {
      insertAtCursor('1. ');
    } else {
      formatRichText('insertOrderedList');
    }
  });
  
  document.getElementById('code-block-btn').addEventListener('click', () => {
    if (currentMode === 'markdown') {
      insertMarkdownSyntax('```\n', '\n```', '代码内容');
    } else {
      formatRichText('formatBlock', '<pre>');
    }
  });

  // 监听编辑器变化
  editor.addEventListener('input', updatePreview);
  
  // 初始化预览
  updatePreview();
  
  // 设置富文本编辑器监听
  setupRichEditorListeners();
  
  // 目录树相关功能
  const selectFolderBtn = document.getElementById('select-folder-btn');
  const directoryTree = document.getElementById('directory-tree');
  
  // 选择文件夹
  if (selectFolderBtn) {
    selectFolderBtn.addEventListener('click', async () => {
      try {
        const folderPath = await window.electronAPI.selectFolder();
        if (folderPath) {
          const treeData = await window.electronAPI.scanDirectory(folderPath);
          renderDirectoryTree(treeData, directoryTree, folderPath);
        }
      } catch (error) {
        console.error('选择文件夹时发生错误:', error);
      }
    });
  }
  
  // 渲染目录树
  function renderDirectoryTree(treeData, container, basePath) {
    container.innerHTML = '';
    
    treeData.forEach(item => {
      const itemElement = createTreeItem(item, basePath);
      container.appendChild(itemElement);
    });
  }
  
  // 创建树形节点
  function createTreeItem(item, basePath) {
    const itemDiv = document.createElement('div');
    itemDiv.className = `tree-item ${item.type}`;
    itemDiv.textContent = item.name;
    itemDiv.title = item.path;
    
    // 如果是文件，添加点击事件打开文件
    if (item.type === 'file') {
      itemDiv.addEventListener('click', async (e) => {
        e.stopPropagation(); // 阻止事件冒泡，避免触发父文件夹的点击事件
        try {
          const content = await window.electronAPI.readFile(item.path);
          
          // 更新编辑器内容
          if (currentMode === 'markdown') {
            editor.value = content;
            updatePreview(); // 更新预览
          } else {
            // 切换到markdown模式再加载内容，避免格式冲突
            if (currentMode === 'rich') {
              toggleEditorMode(); // 切换回markdown模式
            }
            editor.value = content;
            updatePreview();
          }
          
          // 记录当前文件路径
          currentFilePath = item.path;
          
          // 更新选中状态
          document.querySelectorAll('.tree-item.selected').forEach(el => {
            el.classList.remove('selected');
          });
          itemDiv.classList.add('selected');
        } catch (error) {
          console.error('读取文件时发生错误:', error);
        }
      });
    } 
    // 如果是文件夹，展开/收起子项
    else if (item.type === 'folder' && item.children && item.children.length > 0) {
      // 添加展开/折叠图标
      const expandIcon = document.createElement('span');
      expandIcon.className = 'tree-expand-icon collapsed';
      itemDiv.insertBefore(expandIcon, itemDiv.firstChild);
      
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';
      childrenContainer.style.display = 'none';
      childrenContainer.style.marginLeft = '16px';
      
      item.children.forEach(child => {
        const childElement = createTreeItem(child, basePath);
        childrenContainer.appendChild(childElement);
      });
      
      itemDiv.addEventListener('click', (e) => {
        if (e.target !== expandIcon) {
          // 如果点击的不是展开图标，则只更新选中状态，不展开/折叠
          document.querySelectorAll('.tree-item.selected').forEach(el => {
            el.classList.remove('selected');
          });
          itemDiv.classList.add('selected');
          return;
        }
        
        // 只有点击展开图标才展开/折叠
        e.stopPropagation();
        const isExpanded = childrenContainer.style.display === 'block';
        childrenContainer.style.display = isExpanded ? 'none' : 'block';
        
        // 更新展开图标
        expandIcon.className = isExpanded 
          ? 'tree-expand-icon collapsed'
          : 'tree-expand-icon expanded';
      });
      
      // 默认展开根级文件夹
      setTimeout(() => {
        childrenContainer.style.display = 'block';
        expandIcon.className = 'tree-expand-icon expanded';
      }, 100);
      
      itemDiv.appendChild(childrenContainer);
    }
    
    return itemDiv;
  }
  
  // 保存文件
  async function saveCurrentFile() {
    if (currentFilePath) {
      try {
        let content;
        if (currentMode === 'markdown') {
          content = editor.value;
        } else {
          const richContent = document.getElementById('rich-editor').innerHTML;
          content = htmlToMarkdown(richContent);
        }
        
        const success = await window.electronAPI.saveFile(currentFilePath, content);
        if (success) {
          console.log('文件保存成功');
        } else {
          console.error('文件保存失败');
        }
      } catch (error) {
        console.error('保存文件时发生错误:', error);
      }
    }
  }
  
  // 添加 Ctrl+S 快捷键保存
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      saveCurrentFile();
    }
  });
});

// 创建 Electron API 接口（模拟）
window.electronAPI = {
  selectFolder: async () => {
    // 这个函数将在主进程中实现
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      return await ipcRenderer.invoke('select-folder');
    } else {
      // 在浏览器环境中模拟
      alert('此功能仅在Electron应用中可用');
      return null;
    }
  },
  scanDirectory: async (folderPath) => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      return await ipcRenderer.invoke('scan-directory', folderPath);
    } else {
      // 在浏览器环境中模拟
      return [];
    }
  },
  readFile: async (filePath) => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      return await ipcRenderer.invoke('read-file', filePath);
    } else {
      // 在浏览器环境中模拟
      return '';
    }
  },
  saveFile: async (filePath, content) => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      return await ipcRenderer.invoke('save-file', filePath, content);
    } else {
      // 在浏览器环境中模拟
      return false;
    }
  }
};