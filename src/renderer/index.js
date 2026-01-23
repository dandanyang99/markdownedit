// 等待 DOM 加载完成后再执行
document.addEventListener('DOMContentLoaded', function() {
  // 动态创建页面结构
  document.getElementById('root').innerHTML = `
    <div class="toolbar">
      <button id="mode-toggle" title="切换编辑模式">切换模式</button>
      <span id="mode-indicator">当前: Markdown 模式</span>
      <span style="margin: 0 10px;">|</span>
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
    if (currentMode !== 'markdown') return;
    
    const startPos = editor.selectionStart;
    const endPos = editor.selectionEnd;
    const before = editor.value.substring(0, startPos);
    const after = editor.value.substring(endPos, editor.value.length);
    
    editor.value = before + textToInsert + after;
    
    const newPos = startPos + textToInsert.length;
    editor.setSelectionRange(newPos, newPos);
    editor.focus();
    
    updatePreview();
  }

  // 插入 Markdown 语法
  function insertMarkdownSyntax(prefix, suffix, placeholder) {
    if (currentMode !== 'markdown') return;
    
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
  
  // 工具栏按钮事件
  document.getElementById('bold-btn').addEventListener('click', () => insertMarkdownSyntax('**', '**', '加粗文字'));
  document.getElementById('italic-btn').addEventListener('click', () => insertMarkdownSyntax('*', '*', '斜体文字'));
  document.getElementById('heading-btn').addEventListener('click', () => insertMarkdownSyntax('# ', '', '标题文字'));
  document.getElementById('link-btn').addEventListener('click', () => insertMarkdownSyntax('[', ']()', '链接文本'));
  document.getElementById('image-btn').addEventListener('click', () => insertMarkdownSyntax('![', ']()', '图片描述'));
  document.getElementById('list-btn').addEventListener('click', () => insertAtCursor('- '));
  document.getElementById('code-btn').addEventListener('click', () => insertMarkdownSyntax('`', '`', '代码'));  
  document.getElementById('quote-btn').addEventListener('click', () => insertAtCursor('> '));
  document.getElementById('numbered-list-btn').addEventListener('click', () => insertAtCursor('1. '));
  document.getElementById('code-block-btn').addEventListener('click', () => insertMarkdownSyntax('```\n', '\n```', '代码内容'));

  // 监听编辑器变化
  editor.addEventListener('input', updatePreview);
  
  // 初始化预览
  updatePreview();
});