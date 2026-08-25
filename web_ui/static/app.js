const API = {
  themes: '/api/themes',
  sample: '/api/sample',
  render: '/api/render',
  parseYaml: '/api/parse-yaml',
  serializeYaml: '/api/serialize-yaml',
  design: '/api/design',
};

const FORM_SCHEMA = EditorModel.FORM_SCHEMA;

const LOCALES = [
  { id: 'mandarin_chinese', label: '简体中文' },
  { id: 'english', label: 'English' },
];

const state = {
  cvs: [{ id: 'cv-1', name: '示例简历', yaml: '' }],
  activeCvId: 'cv-1',
  workspace: 'cv',
  editMode: 'form',
  theme: 'classic',
  locale: 'mandarin_chinese',
  zoom: 1,
  page: 0,
  pages: [],
  lastSuccess: null,
  status: 'idle',
  error: null,
  errors: [],
  history: [],
  future: [],
  sidebarOpen: true,
  mobileView: 'editor',
  themes: [],
  fullData: null,
  parsedData: null,
  revision: 0,
  designMode: 'form',
  designDefaults: {},
  settings: { current_date: 'today', bold_keywords: [] },
};

let renderTimer = null;
let pushTimer = null;
let abortController = null;
let splitterState = null;

function getActiveCv() {
  return state.cvs.find((cv) => cv.id === state.activeCvId) || state.cvs[0];
}

function getYaml() {
  return getActiveCv()?.yaml || '';
}

function setActiveYaml(yamlText) {
  const activeCv = getActiveCv();
  if (activeCv) activeCv.yaml = yamlText;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function icon(symbol, label) {
  return `<span class="icon" aria-hidden="true">${symbol}</span><span class="sr-only">${escapeHtml(label)}</span>`;
}

function renderSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const cvItems = state.cvs.map((cv) => `
    <button class="cv-item ${cv.id === state.activeCvId ? 'is-active' : ''}" type="button" data-cv-id="${escapeHtml(cv.id)}">
      <span>${escapeHtml(cv.name)}</span>
    </button>`).join('');
  sidebar.innerHTML = `
    <div class="brand"><span class="brand-mark" aria-hidden="true">◡</span><span class="brand-text"><strong>RenderCV</strong><small>简历设计工作台</small></span></div>
    <button class="sidebar-action" id="create-cv-btn" type="button">${icon('+', '新建简历')}<span>新建简历</span></button>
    <label class="upload-dropzone" id="upload-dropzone" for="yaml-file-input">
      ${icon('↥', '导入 YAML')}
      <span><strong>导入 YAML</strong><span>拖放文件到这里，或点击选择</span></span>
    </label>
    <div class="sidebar-heading">我的简历</div>
    <div class="cv-list">${cvItems}</div>
    <div class="sidebar-spacer"></div>
    <div class="sidebar-links">
      <button class="sidebar-link" type="button" data-local-message="反馈功能在本地模式中不可用">${icon('⌁', '反馈')}<span>反馈</span></button>
      <button class="sidebar-link" type="button" disabled title="本地模式暂不支持云端同步">${icon('●', '同步')}<span>同步到 GitHub</span></button>
      <button class="sidebar-link" id="download-all-btn" type="button">${icon('⇩', '下载')}<span>下载数据</span></button>
      <button class="sidebar-link" type="button" data-local-message="定价页面不属于本地编辑器">${icon('$', '定价')}<span>定价</span></button>
      <button class="sidebar-link" type="button" data-local-message="教程请参考项目文档">${icon('⌁', '教程')}<span>使用教程</span></button>
    </div>
    <div class="local-profile"><span class="profile-avatar">L</span><span><strong>本地工作区</strong><span>数据保存在当前浏览器</span></span></div>`;

  document.getElementById('create-cv-btn')?.addEventListener('click', createCv);
  sidebar.querySelectorAll('[data-cv-id]').forEach((button) => {
    button.addEventListener('click', () => selectCv(button.dataset.cvId));
  });
  sidebar.querySelectorAll('[data-local-message]').forEach((button) => {
    button.addEventListener('click', () => setStatus(button.dataset.localMessage, true));
  });
  document.getElementById('download-all-btn')?.addEventListener('click', () => downloadFile(getYaml(), 'cv.yaml', 'text/yaml'));
  const dropzone = document.getElementById('upload-dropzone');
  dropzone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragging');
  });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('is-dragging'));
  dropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragging');
    const file = event.dataTransfer.files[0];
    if (file) readYamlFile(file);
  });
}

function renderToolbar() {
  const toolbar = document.getElementById('top-toolbar');
  if (!toolbar) return;
  toolbar.innerHTML = `
    <div class="workbench-header">
      <span class="workbench-eyebrow">编辑工作台</span>
      <strong>${escapeHtml(getActiveCv()?.name || '未命名简历')}</strong>
      <span class="save-status">${escapeHtml(statusLabel())}</span>
    </div>
    <div class="toolbar-group">
      <button class="icon-button" id="sidebar-toggle" type="button" aria-label="切换侧栏">${state.sidebarOpen ? '◧' : '▣'}</button>
      <div class="toolbar-divider"></div>
      <button class="icon-button" id="undo-btn" type="button" aria-label="撤销" ${state.history.length ? '' : 'disabled'}>↶</button>
      <button class="icon-button" id="redo-btn" type="button" aria-label="重做" ${state.future.length ? '' : 'disabled'}>↷</button>
    </div>
    <div class="toolbar-group toolbar-actions">
      <button class="mobile-view-toggle toolbar-button" id="mobile-view-toggle" type="button">${state.mobileView === 'editor' ? '查看预览' : '返回编辑器'}</button>
      <label class="yaml-switch" title="切换 YAML 高级模式" aria-label="切换 YAML 高级模式">
        <input id="yaml-toggle" type="checkbox" ${state.editMode === 'yaml' ? 'checked' : ''}>
        <span class="switch-track" aria-hidden="true"></span><span>YAML</span>
      </label>
      <div class="zoom-control" aria-label="预览缩放">
        <button id="zoom-out" type="button" aria-label="缩小">−</button>
        <span id="zoom-value" class="zoom-value">${Math.round(state.zoom * 100)}%</span>
        <button id="zoom-in" type="button" aria-label="放大">+</button>
      </div>
      <button class="toolbar-button text-button" id="download-btn" type="button">${icon('⇩', '下载')}<span>下载</span></button>
      <button class="icon-button" id="upload-btn" type="button" aria-label="上传 YAML">↥</button>
      <button class="icon-button" id="share-btn" type="button" aria-label="分享链接" disabled title="本地模式暂不支持分享">↗</button>
      <button class="icon-button" id="theme-toggle" type="button" aria-label="切换明暗主题">☼</button>
    </div>`;

  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    state.sidebarOpen = !state.sidebarOpen;
    document.body.classList.toggle('sidebar-collapsed', !state.sidebarOpen);
    renderToolbar();
  });
  document.getElementById('undo-btn')?.addEventListener('click', undoChange);
  document.getElementById('redo-btn')?.addEventListener('click', redoChange);
  document.getElementById('yaml-toggle')?.addEventListener('change', (event) => switchMode(event.target.checked ? 'yaml' : 'form'));
  document.getElementById('zoom-out')?.addEventListener('click', () => setZoom(state.zoom - 0.1));
  document.getElementById('zoom-in')?.addEventListener('click', () => setZoom(state.zoom + 0.1));
  document.getElementById('download-btn')?.addEventListener('click', showDownloadMenu);
  document.getElementById('upload-btn')?.addEventListener('click', () => document.getElementById('yaml-file-input')?.click());
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  document.getElementById('mobile-view-toggle')?.addEventListener('click', toggleMobileView);
}

function renderTabs() {
  const tabs = document.getElementById('workspace-tabs');
  if (!tabs) return;
  const items = [
    ['cv', '内容'],
    ['design', '设计'],
    ['locale', '语言'],
    ['settings', '设置'],
  ];
  tabs.innerHTML = items.map(([id, label]) => `
    <button class="tab-button ${state.workspace === id ? 'is-active' : ''}" id="tab-${id}" type="button" role="tab" aria-controls="editor-panel" aria-selected="${state.workspace === id}">${label}</button>`).join('');
  items.forEach(([id]) => document.getElementById(`tab-${id}`)?.addEventListener('click', () => switchWorkspace(id)));
}

function renderWorkspace() {
  const panel = document.getElementById('editor-panel');
  if (!panel) return;
  panel.innerHTML = '<div id="workspace-content" class="editor-content"></div>';
  const content = document.getElementById('workspace-content');
  if (state.workspace === 'cv') renderCvPanel(content);
  if (state.workspace === 'design') renderDesignPanel(content);
  if (state.workspace === 'locale') renderLocalePanel(content);
  if (state.workspace === 'settings') renderSettingsPanel(content);
}

function renderCvPanel(content) {
  content.innerHTML = `
    <div class="editor-heading">
      <div>
        <span class="panel-kicker">简历内容</span>
        <h1>${escapeHtml(getActiveCv()?.name || '未命名简历')}</h1>
        <p>编辑内容，右侧会实时更新排版预览。</p>
      </div>
      <span class="status-chip">${state.editMode === 'form' ? '表单模式' : 'YAML 模式'}</span>
    </div>
    <div id="cv-editor" class="cv-editor ${state.editMode === 'form' ? '' : 'hidden'}"></div>
    <textarea id="yaml-editor" class="yaml-editor ${state.editMode === 'yaml' ? '' : 'hidden'}" spellcheck="false" aria-label="YAML 编辑器">${escapeHtml(getYaml())}</textarea>
    <p id="editor-error" class="editor-error ${state.error ? '' : 'hidden'}">${escapeHtml(state.error || '')}</p>`;
  buildForm();
  const formData = state.fullData || state.parsedData;
  if (formData) populateForm(formData);
  const yamlEditor = document.getElementById('yaml-editor');
  yamlEditor?.addEventListener('input', (event) => {
    recordHistory();
    setActiveYaml(event.target.value);
    state.error = null;
    state.errors = [];
    updateEditorError();
    clearFormErrors();
    scheduleRender();
  });
}

function createField(field, idPrefix) {
  const div = document.createElement('div');
  div.className = `field${field.full ? ' full-width' : ''}`;
  const label = document.createElement('label');
  label.htmlFor = idPrefix;
  label.textContent = field.label;
  div.appendChild(label);
  const input = document.createElement(field.type === 'textarea' ? 'textarea' : 'input');
  input.id = idPrefix;
  input.dataset.field = field.name;
  input.type = field.type === 'textarea' ? '' : field.type;
  if (field.type === 'textarea') input.rows = 3;
  div.appendChild(input);
  return div;
}

function buildForm() {
  const editor = document.getElementById('cv-editor');
  if (!editor) return;
  editor.innerHTML = '';
  FORM_SCHEMA.forEach((section, sectionIndex) => {
    const sectionElement = document.createElement('details');
    sectionElement.className = 'form-section section-card';
    sectionElement.dataset.section = section.key;
    sectionElement.open = true;

    const header = document.createElement('summary');
    header.className = 'section-card-header';
    header.innerHTML = `
      <span class="section-index">${String(sectionIndex + 1).padStart(2, '0')}</span>
      <h3>${escapeHtml(section.title)}</h3>
      <span class="section-state">${section.list ? '可添加多条' : '基础设置'}</span>
      <span class="section-chevron" aria-hidden="true"></span>`;
    sectionElement.appendChild(header);
    sectionElement.addEventListener('toggle', () => {
      sectionElement.classList.toggle('is-collapsed', !sectionElement.open);
    });

    const body = document.createElement('div');
    body.className = 'section-card-body';
    body.id = `section-body-${section.key}`;

    if (section.list) {
      const list = document.createElement('div');
      list.className = 'entry-list';
      list.dataset.sectionList = section.key;
      body.appendChild(list);
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'add-button';
      addButton.textContent = `+ 添加${section.title}`;
      addButton.addEventListener('click', () => {
        recordHistory();
        addEntry(list, section);
        formToYaml();
      });
      body.appendChild(addButton);
    } else {
      const fields = document.createElement('div');
      fields.className = 'fields-grid';
      section.fields.forEach((field) => fields.appendChild(createField(field, `${section.key}-${field.name}`)));
      body.appendChild(fields);
    }
    sectionElement.appendChild(body);
    editor.appendChild(sectionElement);
  });
  editor.querySelectorAll('input, textarea, select').forEach((input) => {
    input.addEventListener('input', () => {
      recordHistory();
      formToYaml();
    });
  });
  FORM_SCHEMA.filter((section) => section.list).forEach((section) => {
    const list = editor.querySelector(`[data-section-list="${section.key}"]`);
    if (list) addEntry(list, section);
  });
}

function addEntry(container, section, values = {}) {
  const index = container.children.length;
  const entry = document.createElement('article');
  entry.className = 'entry';
  entry.dataset.section = section.key;
  entry.innerHTML = `
    <div class="entry-header"><span class="entry-title">${escapeHtml(section.title)} #${index + 1}</span>
      <div class="entry-actions">
        <button class="small-button move-up" type="button" aria-label="上移">↑</button>
        <button class="small-button move-down" type="button" aria-label="下移">↓</button>
        <button class="small-button delete-entry" type="button">删除</button>
      </div>
    </div>`;
  const fields = document.createElement('div');
  fields.className = 'fields-grid';
  section.fields.forEach((field) => {
    const fieldElement = createField(field, `${section.key}-${index}-${field.name}`);
    const input = fieldElement.querySelector('input, textarea');
    const value = values[field.name];
    if (input) input.value = Array.isArray(value) ? value.join(field.name === 'items' ? ', ' : '\n') : (value || '');
    fields.appendChild(fieldElement);
  });
  entry.appendChild(fields);
  entry.querySelector('.delete-entry')?.addEventListener('click', () => {
    recordHistory();
    entry.remove();
    renumberEntries(container, section);
    formToYaml();
  });
  entry.querySelector('.move-up')?.addEventListener('click', () => moveEntry(entry, -1, container, section));
  entry.querySelector('.move-down')?.addEventListener('click', () => moveEntry(entry, 1, container, section));
  entry.querySelectorAll('input, textarea').forEach((input) => input.addEventListener('input', () => {
    recordHistory();
    formToYaml();
  }));
  container.appendChild(entry);
}

function moveEntry(entry, direction, container, section) {
  const sibling = direction < 0 ? entry.previousElementSibling : entry.nextElementSibling;
  if (!sibling) return;
  recordHistory();
  if (direction < 0) container.insertBefore(entry, sibling);
  else container.insertBefore(sibling, entry);
  renumberEntries(container, section);
  formToYaml();
}

function renumberEntries(container, section) {
  [...container.children].forEach((entry, index) => {
    const title = entry.querySelector('.entry-title');
    if (title) title.textContent = `${section.title} #${index + 1}`;
  });
}

function getFormData() {
  const editor = document.getElementById('cv-editor');
  if (!editor) return EditorModel.formDataFromData(state.fullData || {});
  const data = {};
  FORM_SCHEMA.forEach((section) => {
    if (section.list) {
      data[section.key] = [...editor.querySelectorAll(`[data-section-list="${section.key}"] > .entry`)].map((entry) => {
        const item = {};
        section.fields.forEach((field) => {
          const input = entry.querySelector(`[data-field="${field.name}"]`);
          if (!input || !input.value.trim()) return;
          if (field.name === 'highlights') item[field.name] = input.value.split('\n').map((line) => line.trim()).filter(Boolean);
          else if (field.name === 'items') item[field.name] = input.value.split(',').map((line) => line.trim()).filter(Boolean);
          else item[field.name] = input.value.trim();
        });
        return item;
      });
      return;
    }
    if (section.single) {
      const input = editor.querySelector(`[data-section="${section.key}"] [data-field="text"]`);
      data[section.key] = input?.value.trim() || '';
      return;
    }
    section.fields.forEach((field) => {
      const input = editor.querySelector(`[data-section="${section.key}"] [data-field="${field.name}"]`);
      if (!input || !input.value.trim()) return;
      if (field.name === 'linkedin' || field.name === 'github') {
        data.social_networks ||= [];
        data.social_networks.push({ network: field.name === 'linkedin' ? 'LinkedIn' : 'GitHub', username: input.value.trim() });
      } else data[field.name] = input.value.trim();
    });
  });
  return data;
}

function formToYaml() {
  if (state.editMode !== 'form') return;
  state.revision += 1;
  state.fullData = EditorModel.applyFormToData(state.fullData, getFormData());
  state.parsedData = state.fullData;
  schedulePushYaml();
}

function schedulePushYaml() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(pushYaml, 300);
}

async function forceSyncYaml() {
  if (pushTimer) clearTimeout(pushTimer);
  await pushYaml();
}

async function pushYaml() {
  pushTimer = null;
  if (state.editMode !== 'form' || !state.fullData) return;
  const revision = state.revision;
  try {
    const response = await fetch(API.serializeYaml, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: EditorModel.cleanForSerialize(state.fullData) }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (revision !== state.revision) return;
    if (result.yaml) setActiveYaml(result.yaml);
    scheduleRender();
  } catch (error) {
    if (revision !== state.revision) return;
    setStatus(`保存 YAML 失败：${error.message}`, true);
  }
}

function clearFormErrors() {
  document.querySelectorAll('.field-error').forEach((element) => element.remove());
}

function findFormInput(locator) {
  const editor = document.getElementById('cv-editor');
  if (!editor || !locator) return null;
  if (locator.sectionKey === 'basics') {
    return editor.querySelector(`[data-section="basics"] [data-field="${locator.field}"]`);
  }
  if (locator.index !== null && locator.index !== undefined) {
    const list = editor.querySelector(`[data-section-list="${locator.sectionKey}"]`);
    if (!list) return null;
    const entry = list.querySelectorAll('.entry')[locator.index];
    if (!entry) return null;
    return entry.querySelector(`[data-field="${locator.field}"]`);
  }
  return null;
}

function renderFormErrors() {
  clearFormErrors();
  if (state.editMode !== 'form' || !state.errors || !state.errors.length) return;
  state.errors.forEach((error) => {
    const locator = EditorModel.formFieldLocator(error.schema_location);
    const input = findFormInput(locator);
    if (!input) return;
    const field = input.closest('.field');
    if (!field) return;
    const errorElement = document.createElement('p');
    errorElement.className = 'field-error';
    errorElement.textContent = error.message;
    field.appendChild(errorElement);
  });
}

function populateForm(data) {
  const cv = data?.cv || {};
  const sections = cv.sections || {};
  state.fullData = data || {};
  state.parsedData = state.fullData;
  state.locale = data?.locale?.language || state.locale;
  state.settings = {
    current_date: data?.settings?.current_date || 'today',
    bold_keywords: Array.isArray(data?.settings?.bold_keywords) ? data.settings.bold_keywords : [],
  };
  const editor = document.getElementById('cv-editor');
  if (!editor) return;
  FORM_SCHEMA.forEach((section) => {
    if (section.list) {
      const list = editor.querySelector(`[data-section-list="${section.key}"]`);
      if (!list) return;
      list.innerHTML = '';
      const items = EditorModel.findSection(sections, section);
      if (Array.isArray(items)) items.forEach((item) => addEntry(list, section, item));
      if (!list.children.length) addEntry(list, section);
      return;
    }
    if (section.single) {
      const input = editor.querySelector(`[data-section="${section.key}"] [data-field="text"]`);
      const value = EditorModel.findSection(sections, section);
      if (input) input.value = Array.isArray(value) ? value.join('\n') : (value || '');
      return;
    }
    section.fields.forEach((field) => {
      const input = editor.querySelector(`[data-section="${section.key}"] [data-field="${field.name}"]`);
      if (!input) return;
      if (field.name === 'linkedin' || field.name === 'github') {
        const network = field.name === 'linkedin' ? 'LinkedIn' : 'GitHub';
        input.value = (cv.social_networks || []).find((item) => item.network === network)?.username || '';
      } else input.value = cv[field.name] || '';
    });
  });
}

function renderDesignPanel(content) {
  const themes = state.themes.length ? state.themes : [{ id: state.theme, name: state.theme }];
  content.innerHTML = `
    <div class="editor-heading"><div><span class="panel-kicker">视觉系统</span><h1>设计</h1><p>选择主题并调整页面、颜色、排版和区块间距。</p></div></div>
    <section class="section-block"><h2 class="section-title">主题</h2><div class="theme-grid">${themes.map((theme) => `
      <button class="theme-card ${state.theme === theme.id ? 'is-selected' : ''}" type="button" data-theme="${escapeHtml(theme.id)}" aria-pressed="${state.theme === theme.id}">
        <span class="theme-preview theme-${escapeHtml(theme.id)}"><span>${escapeHtml((theme.name || theme.id).slice(0, 1))}</span><i></i><i></i><i></i></span>
        <strong>${escapeHtml(theme.name)}</strong>
      </button>`).join('')}</div></section>
    <div class="design-mode-toggle" role="tablist" aria-label="设计编辑方式">
      <button type="button" class="design-mode-btn ${state.designMode === 'form' ? 'is-active' : ''}" data-design-mode="form">表单</button>
      <button type="button" class="design-mode-btn ${state.designMode === 'yaml' ? 'is-active' : ''}" data-design-mode="yaml">YAML</button>
    </div>
    <div id="design-editor"></div>`;
  content.querySelectorAll('[data-theme]').forEach((card) => card.addEventListener('click', () => selectDesignTheme(card.dataset.theme)));
  content.querySelectorAll('[data-design-mode]').forEach((button) => button.addEventListener('click', () => {
    state.designMode = button.dataset.designMode;
    renderApp();
  }));
  const container = content.querySelector('#design-editor');
  if (state.designMode === 'yaml') renderDesignYamlEditor(container);
  else renderDesignForm(container);
}

function ensureFullDataDesign() {
  if (!state.fullData) state.fullData = { locale: { language: state.locale }, cv: {} };
  if (!state.fullData.design) state.fullData.design = { theme: state.theme };
  else if (!state.fullData.design.theme) state.fullData.design.theme = state.theme;
  return state.fullData.design;
}

async function loadDesignDefaults(theme) {
  if (state.designDefaults[theme]) return state.designDefaults[theme];
  try {
    const response = await fetch(`${API.design}/${theme}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    state.designDefaults[theme] = result.design || {};
  } catch (error) {
    state.designDefaults[theme] = {};
    setStatus(`加载设计配置失败：${error.message}`, true);
  }
  return state.designDefaults[theme];
}

async function selectDesignTheme(themeId) {
  recordHistory();
  state.theme = themeId;
  ensureFullDataDesign().theme = themeId;
  if (state.designMode === 'form') await loadDesignDefaults(themeId);
  formToYaml();
  renderApp();
}

async function renderDesignForm(container) {
  const defaults = await loadDesignDefaults(state.theme);
  const design = EditorModel.deepMerge(defaults, ensureFullDataDesign());
  const values = EditorModel.formValuesFromDesign(design);
  const groups = {};
  EditorModel.DESIGN_FIELDS.forEach((field) => {
    const group = field.path[0];
    (groups[group] = groups[group] || []).push(field);
  });
  const groupTitles = { page: '页面', colors: '颜色', typography: '排版', header: '页眉', links: '链接', sections: '小节', entries: '条目' };
  container.innerHTML = Object.keys(groups).map((group, groupIndex) => `
    <section class="section-card">
      <div class="section-card-header">
        <span class="section-index">${String(groupIndex + 1).padStart(2, '0')}</span>
        <h3>${groupTitles[group] || group}</h3>
      </div>
      <div class="section-card-body">
        <p class="section-help">留空时使用主题默认值。</p>
        <div class="fields-grid">${groups[group].map((field) => {
        const key = field.path.join('.');
        const value = values[key];
        if (field.type === 'checkbox') {
          return `<label class="design-check"><input type="checkbox" data-design-path="${key}" ${value ? 'checked' : ''}>${escapeHtml(field.label)}</label>`;
        }
        if (field.type === 'select') {
          return `<div class="field"><label>${escapeHtml(field.label)}</label><select data-design-path="${key}">${field.options.map((option) => `<option value="${option}" ${String(value) === option ? 'selected' : ''}>${option}</option>`).join('')}</select></div>`;
        }
        return `<div class="field"><label>${escapeHtml(field.label)}</label><input type="text" data-design-path="${key}" value="${escapeHtml(String(value ?? ''))}"></div>`;
        }).join('')}</div>
      </div>
    </section>`).join('')
    + '<p class="locale-note">更多高级设置（间距、模板等）请切换到 YAML 模式。</p>';
  container.querySelectorAll('[data-design-path]').forEach((input) => {
    input.addEventListener('input', () => onDesignInput(input));
    input.addEventListener('change', () => onDesignInput(input));
  });
}

function onDesignInput(input) {
  recordHistory();
  const key = input.dataset.designPath;
  const value = input.type === 'checkbox' ? input.checked : input.value;
  const design = ensureFullDataDesign();
  state.fullData.design = EditorModel.designFromForm(design, { [key]: value });
  formToYaml();
}

async function renderDesignYamlEditor(container) {
  const design = ensureFullDataDesign();
  let yamlText = '';
  try {
    const response = await fetch(API.serializeYaml, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: EditorModel.cleanForSerialize(design) }),
    });
    const result = await response.json();
    yamlText = result.yaml || '';
  } catch (error) {
    setStatus(`序列化 Design 失败：${error.message}`, true);
  }
  container.innerHTML = `
    <p class="locale-note">直接编辑 <code>design:</code> 配置块。留空或删除字段将使用主题默认值。</p>
    <textarea id="design-yaml-editor" class="yaml-editor" spellcheck="false" aria-label="Design YAML">${escapeHtml(yamlText)}</textarea>
    <div class="design-actions">
      <button class="toolbar-button text-button" id="design-yaml-save" type="button">保存 Design</button>
      <button class="toolbar-button text-button" id="design-yaml-reload" type="button">从主题重置</button>
    </div>`;
  document.getElementById('design-yaml-save')?.addEventListener('click', saveDesignYaml);
  document.getElementById('design-yaml-reload')?.addEventListener('click', () => {
    recordHistory();
    state.fullData.design = { theme: state.theme };
    formToYaml();
    renderApp();
  });
}

async function saveDesignYaml() {
  const editor = document.getElementById('design-yaml-editor');
  if (!editor) return;
  recordHistory();
  try {
    const result = await parseYaml(editor.value);
    const design = result.data || {};
    if (design.theme && typeof design.theme === 'string') state.theme = design.theme;
    ensureFullDataDesign();
    state.fullData.design = design;
    formToYaml();
    renderApp();
  } catch (error) {
    setStatus(`Design YAML 解析失败：${error.message}`, true);
  }
}

function renderLocalePanel(content) {
  content.innerHTML = `
    <div class="editor-heading">
      <div><span class="panel-kicker">语言与地区</span><h1>语言</h1><p>控制日期、月份和持续时间的显示语言。</p></div>
    </div>
    <section class="section-card">
      <div class="section-card-header">
        <span class="section-index">01</span>
        <h3>语言</h3>
      </div>
      <div class="section-card-body">
        <div class="setting-row"><label for="locale-select">简历语言</label><select id="locale-select">${LOCALES.map((locale) => `<option value="${locale.id}" ${locale.id === state.locale ? 'selected' : ''}>${locale.label}</option>`).join('')}</select></div>
        <p class="locale-note">语言会写回 YAML 的 <code>locale.language</code> 字段，并使用 RenderCV 当前支持的语言。</p>
      </div>
    </section>`;
  document.getElementById('locale-select')?.addEventListener('change', (event) => {
    recordHistory();
    state.locale = event.target.value;
    if (state.fullData) state.fullData.locale = { ...(state.fullData.locale || {}), language: state.locale };
    if (state.editMode === 'form') formToYaml();
    scheduleRender();
  });
}

function renderSettingsPanel(content) {
  const keywords = state.settings.bold_keywords.join(', ');
  content.innerHTML = `
    <div class="editor-heading">
      <div><span class="panel-kicker">设置</span><h1>设置</h1><p>控制当前简历的日期和排版文本设置。</p></div>
    </div>
    <section class="section-card">
      <div class="section-card-header">
        <span class="section-index">01</span>
        <h3>通用</h3>
      </div>
      <div class="section-card-body">
        <div class="setting-row"><label for="current-date">当前日期</label><input id="current-date" value="${escapeHtml(state.settings.current_date)}" placeholder="例如：today 或 2026-08-25"></div>
        <div class="setting-row"><label for="bold-keywords">加粗关键词</label><input id="bold-keywords" value="${escapeHtml(keywords)}" placeholder="用逗号分隔关键词"></div>
        <p class="locale-note">加粗关键词会与简历内容中的对应文本匹配并加粗显示；留空则不进行加粗。</p>
      </div>
    </section>`;
  document.getElementById('current-date')?.addEventListener('input', (event) => updateSetting('current_date', event.target.value));
  document.getElementById('bold-keywords')?.addEventListener('input', (event) => updateSetting('bold_keywords', event.target.value.split(',').map((value) => value.trim()).filter(Boolean)));
}

function updateSetting(key, value) {
  recordHistory();
  state.settings[key] = value;
  if (state.fullData) state.fullData.settings = { ...(state.fullData.settings || {}), [key]: value };
  if (state.editMode === 'form') formToYaml();
  scheduleRender();
}

function renderPreview() {
  const panel = document.getElementById('preview-panel');
  if (!panel) return;
  const pages = state.pages.length ? state.pages : [];
  const pageMarkup = pages.length ? pages.map((page, index) => `
    <figure class="preview-page ${index === state.page ? 'is-current' : ''}" style="transform: scale(${state.zoom})" data-page="${index}">
      <img src="${page}" alt="简历第 ${index + 1} 页" draggable="false">
    </figure>`).join('') : '<div class="preview-empty">输入或修改简历内容后，预览会显示在这里。</div>';
  panel.innerHTML = `
    <div class="preview-meta">
      <div><span class="panel-kicker">实时预览</span><strong>${escapeHtml(getActiveCv()?.name || '未命名简历')}</strong></div>
      <span class="preview-badge">${pages.length ? `${pages.length} 页` : '等待内容'}</span>
    </div>
    <div class="preview-toolbar"><span id="preview-status" class="preview-status ${state.error ? 'is-error' : ''}">${escapeHtml(state.error || statusLabel())}</span>
      <div class="preview-controls"><button class="small-button" id="preview-fit" type="button">适应宽度</button><button class="small-button" id="download-preview-btn" type="button">下载 PDF</button></div>
    </div>
    <div id="preview-pages" class="preview-pages"><div class="preview-pages-inner">${pageMarkup}</div></div>
    <div class="preview-footer"><button class="small-button" id="preview-prev" type="button" ${state.page <= 0 ? 'disabled' : ''}>上一页</button><span>${pages.length ? `${state.page + 1} / ${pages.length}` : '—'}</span><button class="small-button" id="preview-next" type="button" ${state.page >= pages.length - 1 ? 'disabled' : ''}>下一页</button></div>`;
  document.getElementById('preview-prev')?.addEventListener('click', () => showPage(-1));
  document.getElementById('preview-next')?.addEventListener('click', () => showPage(1));
  document.getElementById('preview-fit')?.addEventListener('click', fitPreview);
  document.getElementById('download-preview-btn')?.addEventListener('click', downloadPdf);
}

function statusLabel() {
  if (state.status === 'rendering') return '渲染中…';
  if (state.status === 'success') return '已更新';
  return '准备就绪';
}

function renderApp() {
  renderSidebar();
  renderToolbar();
  renderTabs();
  renderWorkspace();
  renderPreview();
  document.body.classList.toggle('sidebar-collapsed', !state.sidebarOpen);
  document.body.classList.toggle('mobile-preview', state.mobileView === 'preview');
}

function switchWorkspace(workspace) {
  state.workspace = workspace;
  renderApp();
}

async function switchMode(mode) {
  if (mode === state.editMode) return;
  state.revision += 1;
  if (mode === 'yaml') {
    await forceSyncYaml();
    state.editMode = 'yaml';
  } else {
    state.editMode = 'form';
    await yamlToForm(getYaml());
  }
  renderApp();
}

function recordHistory() {
  const snapshot = { yaml: getYaml(), theme: state.theme, locale: state.locale, settings: JSON.parse(JSON.stringify(state.settings)) };
  const previous = state.history[state.history.length - 1];
  if (previous && JSON.stringify(previous) === JSON.stringify(snapshot)) return;
  state.history.push(snapshot);
  if (state.history.length > 40) state.history.shift();
  state.future = [];
}

async function restoreSnapshot(snapshot) {
  state.revision += 1;
  setActiveYaml(snapshot.yaml);
  state.theme = snapshot.theme;
  state.locale = snapshot.locale;
  state.settings = snapshot.settings;
  state.parsedData = null;
  state.fullData = null;
  await yamlToForm(snapshot.yaml);
  renderApp();
  scheduleRender();
}

function undoChange() {
  if (!state.history.length) return;
  state.future.push({ yaml: getYaml(), theme: state.theme, locale: state.locale, settings: JSON.parse(JSON.stringify(state.settings)) });
  restoreSnapshot(state.history.pop());
}

function redoChange() {
  if (!state.future.length) return;
  state.history.push({ yaml: getYaml(), theme: state.theme, locale: state.locale, settings: JSON.parse(JSON.stringify(state.settings)) });
  restoreSnapshot(state.future.pop());
}

async function loadThemes() {
  try {
    const response = await fetch(API.themes);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    state.themes = Array.isArray(result.themes) ? result.themes : [];
    if (!state.themes.some((theme) => theme.id === state.theme) && state.themes[0]) state.theme = state.themes[0].id;
  } catch (error) {
    setStatus(`加载主题失败：${error.message}`, true);
  }
}

async function loadSample() {
  try {
    const response = await fetch(API.sample);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    setActiveYaml(result.yaml || '');
    state.cvs[0].name = readCvName(result.yaml) || '示例简历';
  } catch (error) {
    setStatus(`加载示例失败：${error.message}`, true);
  }
}

function readCvName(yamlText) {
  const match = String(yamlText).match(/^\s*name:\s*(.+)\s*$/m);
  return match ? match[1].replace(/^['"]|['"]$/g, '') : '';
}

async function parseYaml(yamlText) {
  const response = await fetch(API.parseYaml, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ yaml: yamlText }) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await response.json();
  if (!result.success) throw new Error(result.error || '解析失败');
  if (!result.data || typeof result.data !== 'object') throw new Error('返回数据格式无效');
  return result;
}

async function yamlToForm(yamlText) {
  try {
    const result = await parseYaml(yamlText);
    state.fullData = result.data;
    state.parsedData = result.data;
    populateForm(result.data);
    state.error = null;
    state.errors = [];
    updateEditorError();
    clearFormErrors();
  } catch (error) {
    state.error = `解析 YAML 失败：${error.message}`;
    updateEditorError();
    setStatus(state.error, true);
  }
}

async function doRender() {
  if (abortController) abortController.abort();
  abortController = new AbortController();
  state.status = 'rendering';
  state.error = null;
  renderPreview();
  try {
    const response = await fetch(API.render, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml: getYaml(), theme: state.theme }),
      signal: abortController.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (!result.success) {
      const error = new Error(result.error || '未知渲染错误');
      error.errors = Array.isArray(result.errors) ? result.errors : [];
      throw error;
    }
    state.pages = Array.isArray(result.files?.png) ? result.files.png : [];
    state.page = Math.min(state.page, Math.max(0, state.pages.length - 1));
    state.lastSuccess = { pdf: result.files?.pdf || '', typst: result.files?.typst || '', pages: [...state.pages] };
    state.status = 'success';
    state.error = null;
    state.errors = [];
    renderPreview();
    renderFormErrors();
  } catch (error) {
    if (error.name === 'AbortError') return;
    state.status = 'idle';
    state.error = `渲染失败：${error.message}`;
    state.errors = error.errors || [];
    if (state.lastSuccess) state.pages = [...state.lastSuccess.pages];
    renderPreview();
    updateEditorError();
    renderFormErrors();
  }
}

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(doRender, 600);
}

function setStatus(message, isError = false) {
  state.error = isError ? message : null;
  state.status = isError ? 'idle' : state.status;
  const status = document.getElementById('preview-status');
  if (status) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }
  updateEditorError();
}

function updateEditorError() {
  const element = document.getElementById('editor-error');
  if (!element) return;
  element.textContent = state.error || '';
  element.classList.toggle('hidden', !state.error);
}

function setZoom(value) {
  state.zoom = Math.max(0.5, Math.min(2, Math.round(value * 10) / 10));
  renderPreview();
  const zoomValue = document.getElementById('zoom-value');
  if (zoomValue) zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
}

function fitPreview() {
  const container = document.getElementById('preview-pages');
  if (!container) return;
  const available = container.clientWidth - 60;
  const pageWidth = 612;
  setZoom(Math.max(0.5, Math.min(1.5, available / pageWidth)));
}

function showPage(delta) {
  if (!state.pages.length) return;
  state.page = Math.max(0, Math.min(state.pages.length - 1, state.page + delta));
  renderPreview();
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelector(`[data-page="${state.page}"]`)?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
}

function downloadFile(content, filename, mime) {
  if (!content) {
    setStatus('当前没有可下载的内容', true);
    return;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function dataUriToBlob(dataUri) {
  const [meta, base64] = dataUri.split(',');
  const mime = meta.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
  return new Blob([array], { type: mime });
}

function downloadPdf() {
  const pdf = state.lastSuccess?.pdf;
  if (!pdf) {
    setStatus('没有可下载的 PDF，请先成功渲染', true);
    return;
  }
  const blob = dataUriToBlob(pdf);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${getActiveCv()?.name || 'cv'}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function showDownloadMenu() {
  const yaml = getYaml();
  downloadFile(yaml, 'cv.yaml', 'text/yaml');
}

function readYamlFile(file) {
  if (!file.name.match(/\.ya?ml$/i)) {
    setStatus('请选择 YAML 文件', true);
    return;
  }
  const reader = new FileReader();
  reader.onload = async (event) => {
    const text = String(event.target.result || '');
    try {
      const result = await parseYaml(text);
      recordHistory();
      state.revision += 1;
      setActiveYaml(text);
      state.fullData = result.data;
      state.parsedData = result.data;
      populateForm(result.data);
      state.error = null;
      state.errors = [];
      state.cvs.find((cv) => cv.id === state.activeCvId).name = result.data?.cv?.name || file.name.replace(/\.ya?ml$/i, '');
      renderApp();
      scheduleRender();
    } catch (error) {
      setStatus(`导入失败：${error.message}`, true);
    }
  };
  reader.readAsText(file);
}

function createCv() {
  const id = `cv-${Date.now()}`;
  const yaml = 'locale:\n  language: mandarin_chinese\n\ncv:\n  name: 新简历\n';
  state.cvs.push({ id, name: '新简历', yaml });
  state.activeCvId = id;
  state.parsedData = null;
  state.fullData = null;
  state.revision += 1;
  state.workspace = 'cv';
  yamlToForm(yaml);
  renderApp();
  scheduleRender();
}

function selectCv(id) {
  if (!state.cvs.some((cv) => cv.id === id)) return;
  state.activeCvId = id;
  state.parsedData = null;
  state.fullData = null;
  state.revision += 1;
  state.page = 0;
  yamlToForm(getYaml());
  renderApp();
  scheduleRender();
}

function toggleTheme() {
  document.documentElement.classList.toggle('dark');
}

function toggleMobileView() {
  state.mobileView = state.mobileView === 'editor' ? 'preview' : 'editor';
  renderApp();
}

function setupSplitter() {
  const splitter = document.getElementById('splitter');
  const workspace = document.getElementById('workspace');
  if (!splitter || !workspace) return;
  splitter.addEventListener('pointerdown', (event) => {
    splitter.setPointerCapture(event.pointerId);
    splitterState = { startX: event.clientX, startWidth: workspace.querySelector('.editor-panel').getBoundingClientRect().width };
  });
  splitter.addEventListener('pointermove', (event) => {
    if (!splitterState) return;
    const delta = event.clientX - splitterState.startX;
    const editorWidth = Math.max(360, splitterState.startWidth + delta);
    workspace.style.gridTemplateColumns = `${editorWidth}px 8px minmax(420px, 1fr)`;
  });
  splitter.addEventListener('pointerup', () => { splitterState = null; });
  splitter.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    const current = workspace.querySelector('.editor-panel').getBoundingClientRect().width;
    workspace.style.gridTemplateColumns = `${Math.max(360, current + direction * 24)}px 8px minmax(420px, 1fr)`;
  });
}

async function init() {
  await loadThemes();
  await loadSample();
  renderApp();
  await yamlToForm(getYaml());
  renderApp();
  setupSplitter();
  await doRender();
}

document.getElementById('yaml-file-input')?.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) readYamlFile(file);
  event.target.value = '';
});

init();
