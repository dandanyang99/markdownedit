// 使用通过 script 标签引入的全局库

// 获取DOM元素
const editorTextarea = document.createElement('textarea');
editorTextarea.className = 'editor';
editorTextarea.placeholder = '在这里输入 Markdown...';

const previewDiv = document.createElement('div');
previewDiv.className = 'preview';

// 将元素添加到页面
document.getElementById('root').innerHTML = `
  <div class="toolbar">
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
          <textarea id="editor" placeholder="在这里输入 Markdown..."></textarea>
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

// 获取更新后的元素
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const lineCount = document.getElementById('line-count');
const charCount = document.getElementById('char-count');

// 设置marked选项以允许HTML渲染
marked.setOptions({
  gfm: true,
  breaks: true,
  smartLists: true,
  smartypants: true
});

// 更新预览
function updatePreview() {
  const markdown = editor.value;
  const rendered = marked.parse(markdown);
  preview.innerHTML = DOMPurify.sanitize(rendered);
  
  // 更新状态栏
  updateStatusBar();
}

// 更新状态栏
function updateStatusBar() {
  const text = editor.value;
  const lines = text.split('\n').length;
  const chars = text.length;
  
  lineCount.textContent = lines;
  charCount.textContent = chars;
}

// 插入文本到编辑器
function insertAtCursor(textToInsert) {
  const startPos = editor.selectionStart;
  const endPos = editor.selectionEnd;
  const before = editor.value.substring(0, startPos);
  const after = editor.value.substring(endPos, editor.value.length);
  
  editor.value = before + textToInsert + after;
  
  // 设置新的光标位置
  const newPos = startPos + textToInsert.length;
  editor.setSelectionRange(newPos, newPos);
  
  // 触发预览更新
  updatePreview();
}

// 绑定工具栏事件
function setupToolbarEvents() {
  document.getElementById('bold-btn').addEventListener('click', () => {
    insertMarkdownSyntax('**', '**', '加粗文字');
  });

  document.getElementById('italic-btn').addEventListener('click', () => {
    insertMarkdownSyntax('*', '*', '斜体文字');
  });

  document.getElementById('heading-btn').addEventListener('click', () => {
    insertMarkdownSyntax('### ', '', '标题');
  });

  document.getElementById('link-btn').addEventListener('click', () => {
    insertMarkdownSyntax('[', '](https://)', '链接描述');
  });

  document.getElementById('image-btn').addEventListener('click', () => {
    insertMarkdownSyntax('![', '](https://)', '图片描述');
  });

  document.getElementById('list-btn').addEventListener('click', () => {
    insertAtCursor('- ');
  });

  document.getElementById('numbered-list-btn').addEventListener('click', () => {
    insertAtCursor('1. ');
  });

  document.getElementById('code-btn').addEventListener('click', () => {
    insertMarkdownSyntax('`', '`', '代码');
  });

  document.getElementById('code-block-btn').addEventListener('click', () => {
    insertMarkdownSyntax('\n```\n', '\n```\n', '代码块');
  });

  document.getElementById('quote-btn').addEventListener('click', () => {
    insertAtCursor('> ');
  });
}

// 插入 Markdown 语法的通用函数
function insertMarkdownSyntax(prefix, suffix, placeholder) {
  const startPos = editor.selectionStart;
  const endPos = editor.selectionEnd;
  const selectedText = editor.value.substring(startPos, endPos);
  
  // 如果没有选中文本，则使用占位符
  const textToInsert = selectedText || placeholder;
  
  const before = editor.value.substring(0, startPos);
  const after = editor.value.substring(endPos, editor.value.length);
  
  editor.value = before + prefix + textToInsert + suffix + after;
  
  // 设置新的光标位置
  let newPos;
  if (selectedText) {
    // 如果有选中文本，将光标放在末尾
    newPos = startPos + prefix.length + selectedText.length + suffix.length;
  } else {
    // 如果没有选中文本，将光标放在中间
    newPos = startPos + prefix.length;
  }
  
  editor.setSelectionRange(newPos, newPos);
  editor.focus();
  
  // 触发预览更新
  updatePreview();
}

setupToolbarEvents();

// 监听编辑器内容变化
editor.addEventListener('input', updatePreview);

// 初始化预览
updatePreview();

// 实时更新状态栏
editor.addEventListener('input', updateStatusBar);
editor.addEventListener('keyup', updateStatusBar);