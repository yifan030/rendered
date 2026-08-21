/* Frontend application for the RenderCV web UI. */

const API = {
  themes: '/api/themes',
  sample: '/api/sample',
  render: '/api/render',
  parseYaml: '/api/parse-yaml',
};

const state = {
  yaml: '',
  theme: 'classic',
  mode: 'form', // 'form' | 'yaml'
};

const els = {
  themeSelect: document.getElementById('theme-select'),
  modeToggle: document.getElementById('mode-toggle'),
  uploadBtn: document.getElementById('upload-btn'),
  downloadYamlBtn: document.getElementById('download-yaml-btn'),
  downloadPdfBtn: document.getElementById('download-pdf-btn'),
  yamlFileInput: document.getElementById('yaml-file-input'),
  formEditor: document.getElementById('form-editor'),
  yamlEditor: document.getElementById('yaml-editor'),
  status: document.getElementById('status'),
  previewImg: document.getElementById('preview-img'),
};

// ---------------------------------------------------------------------------
// Theme / sample loading
// ---------------------------------------------------------------------------

async function loadThemes() {
  try {
    const res = await fetch(API.themes);
    const { themes } = await res.json();
    els.themeSelect.innerHTML = themes
      .map((t) => `<option value="${t.id}">${t.name}</option>`)
      .join('');
    // Restore selection if possible.
    if ([...els.themeSelect.options].some((o) => o.value === state.theme)) {
      els.themeSelect.value = state.theme;
    } else {
      state.theme = els.themeSelect.value;
    }
  } catch (err) {
    setStatus('加载主题列表失败：' + err.message, true);
  }
}

async function loadSample() {
  try {
    const res = await fetch(API.sample);
    const { yaml } = await res.json();
    state.yaml = yaml;
    if (state.mode === 'yaml') {
      els.yamlEditor.value = yaml;
    }
  } catch (err) {
    setStatus('加载示例失败：' + err.message, true);
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

let renderTimer = null;
let abortController = null;

async function doRender() {
  if (abortController) {
    abortController.abort();
  }
  abortController = new AbortController();

  setStatus('渲染中...');
  try {
    const res = await fetch(API.render, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml: state.yaml, theme: state.theme }),
      signal: abortController.signal,
    });
    const data = await res.json();
    if (data.success) {
      if (data.files.png && data.files.png.length > 0) {
        els.previewImg.src = data.files.png[0];
        els.previewImg.hidden = false;
      }
      els.previewImg.dataset.pdf = data.files.pdf || '';
      els.previewImg.dataset.typst = data.files.typst || '';
      setStatus('渲染成功');
    } else {
      setStatus('渲染失败：' + (data.error || '未知错误'), true);
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      setStatus('请求失败：' + err.message, true);
    }
  }
}

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(doRender, 600);
}

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.classList.toggle('error', isError);
}

// ---------------------------------------------------------------------------
// Form editor
// ---------------------------------------------------------------------------

const FORM_SCHEMA = [
  {
    key: 'basics',
    title: '基础信息',
    fields: [
      { name: 'name', label: '姓名', type: 'text' },
      { name: 'headline', label: '职位头衔', type: 'text' },
      { name: 'location', label: '地点', type: 'text' },
      { name: 'email', label: '邮箱', type: 'email' },
      { name: 'phone', label: '电话', type: 'text' },
      { name: 'website', label: '个人网站', type: 'text' },
      { name: 'linkedin', label: 'LinkedIn 用户名', type: 'text' },
      { name: 'github', label: 'GitHub 用户名', type: 'text' },
    ],
  },
  {
    key: '个人简介',
    title: '个人简介',
    single: true,
    fields: [{ name: 'text', label: '简介', type: 'textarea' }],
  },
  {
    key: '教育经历',
    title: '教育经历',
    list: true,
    fields: [
      { name: 'institution', label: '学校', type: 'text' },
      { name: 'degree', label: '学位', type: 'text' },
      { name: 'area', label: '专业', type: 'text' },
      { name: 'location', label: '地点', type: 'text' },
      { name: 'start_date', label: '开始时间', type: 'text' },
      { name: 'end_date', label: '结束时间', type: 'text' },
      { name: 'highlights', label: '亮点（每行一条）', type: 'textarea' },
    ],
  },
  {
    key: '工作经历',
    title: '工作经历',
    list: true,
    fields: [
      { name: 'company', label: '公司', type: 'text' },
      { name: 'position', label: '职位', type: 'text' },
      { name: 'location', label: '地点', type: 'text' },
      { name: 'start_date', label: '开始时间', type: 'text' },
      { name: 'end_date', label: '结束时间', type: 'text' },
      { name: 'highlights', label: '亮点（每行一条）', type: 'textarea' },
    ],
  },
  {
    key: '项目经历',
    title: '项目经历',
    list: true,
    fields: [
      { name: 'name', label: '项目名', type: 'text' },
      { name: 'link', label: '链接', type: 'text' },
      { name: 'start_date', label: '开始时间', type: 'text' },
      { name: 'end_date', label: '结束时间', type: 'text' },
      { name: 'highlights', label: '亮点（每行一条）', type: 'textarea' },
    ],
  },
  {
    key: '技能',
    title: '技能',
    list: true,
    fields: [
      { name: 'label', label: '分类', type: 'text' },
      { name: 'items', label: '技能（逗号分隔）', type: 'text' },
    ],
  },
  {
    key: '论文发表',
    title: '论文发表',
    list: true,
    fields: [
      { name: 'title', label: '标题', type: 'text' },
      { name: 'authors', label: '作者', type: 'text' },
      { name: 'venue', label: '期刊/会议', type: 'text' },
      { name: 'year', label: '年份', type: 'text' },
      { name: 'link', label: '链接', type: 'text' },
    ],
  },
  {
    key: '荣誉奖项',
    title: '荣誉奖项',
    list: true,
    fields: [
      { name: 'title', label: '奖项', type: 'text' },
      { name: 'date', label: '时间', type: 'text' },
      { name: 'summary', label: '说明', type: 'textarea' },
    ],
  },
];

function createField(field, idPrefix) {
  const div = document.createElement('div');
  div.className = 'field';
  const label = document.createElement('label');
  label.htmlFor = idPrefix;
  label.textContent = field.label;
  div.appendChild(label);
  const input = document.createElement(field.type === 'textarea' ? 'textarea' : 'input');
  input.id = idPrefix;
  input.dataset.field = field.name;
  if (field.type !== 'textarea') input.type = field.type;
  if (field.type === 'textarea') input.rows = 4;
  div.appendChild(input);
  return div;
}

function addEntry(container, section) {
  const entry = document.createElement('div');
  entry.className = 'entry';
  entry.dataset.section = section.key;
  const header = document.createElement('div');
  header.className = 'entry-header';
  const title = document.createElement('span');
  title.className = 'entry-title';
  title.textContent = `${section.title} #${container.children.length + 1}`;
  header.appendChild(title);
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'small-btn';
  delBtn.textContent = '删除';
  delBtn.addEventListener('click', () => {
    entry.remove();
    formToYaml();
    scheduleRender();
  });
  header.appendChild(delBtn);
  entry.appendChild(header);
  section.fields.forEach((field) => {
    entry.appendChild(createField(field, `${section.key}-${container.children.length}-${field.name}`));
  });
  entry.querySelectorAll('input, textarea').forEach((input) => {
    input.addEventListener('input', () => {
      formToYaml();
      scheduleRender();
    });
  });
  container.appendChild(entry);
}

function buildForm() {
  els.formEditor.innerHTML = '';
  FORM_SCHEMA.forEach((section) => {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'form-section';
    const title = document.createElement('h3');
    title.textContent = section.title;
    sectionEl.appendChild(title);

    if (section.list) {
      const listContainer = document.createElement('div');
      listContainer.dataset.sectionList = section.key;
      sectionEl.appendChild(listContainer);
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'small-btn';
      addBtn.textContent = `+ 添加${section.title}`;
      addBtn.addEventListener('click', () => {
        addEntry(listContainer, section);
        formToYaml();
        scheduleRender();
      });
      sectionEl.appendChild(addBtn);
    } else if (section.single) {
      sectionEl.dataset.section = section.key;
      section.fields.forEach((field) => {
        sectionEl.appendChild(createField(field, `${section.key}-${field.name}`));
      });
      sectionEl.querySelector('textarea').addEventListener('input', () => {
        formToYaml();
        scheduleRender();
      });
    } else {
      sectionEl.dataset.section = section.key;
      section.fields.forEach((field) => {
        const fieldEl = createField(field, `${section.key}-${field.name}`);
        sectionEl.appendChild(fieldEl);
        const input = fieldEl.querySelector('input, textarea');
        input.dataset.section = section.key;
        input.dataset.field = field.name;
        input.addEventListener('input', () => {
          formToYaml();
          scheduleRender();
        });
      });
    }
    els.formEditor.appendChild(sectionEl);
  });
}

function getFormData() {
  const data = {};
  FORM_SCHEMA.forEach((section) => {
    if (section.list) {
      data[section.key] = [];
      const entries = els.formEditor.querySelectorAll(`[data-section="${section.key}"]`);
      entries.forEach((entry) => {
        const item = {};
        section.fields.forEach((field) => {
          const input = entry.querySelector(`[data-field="${field.name}"]`);
          if (!input) return;
          if (field.name === 'highlights') {
            item[field.name] = input.value.split('\n').map(s => s.trim()).filter(Boolean);
          } else if (field.name === 'items') {
            item[field.name] = input.value.split(',').map(s => s.trim()).filter(Boolean);
          } else {
            item[field.name] = input.value || undefined;
          }
        });
        data[section.key].push(item);
      });
    } else if (section.single) {
      const input = els.formEditor.querySelector(`[data-section="${section.key}"] textarea`);
      data[section.key] = input ? input.value : '';
    } else {
      section.fields.forEach((field) => {
        const input = els.formEditor.querySelector(`[data-section="${section.key}"] [data-field="${field.name}"]`);
        if (input) {
          if (field.name === 'linkedin' || field.name === 'github') {
            if (input.value) {
              if (!data.social_networks) data.social_networks = [];
              data.social_networks.push({
                network: field.name === 'linkedin' ? 'LinkedIn' : 'GitHub',
                username: input.value,
              });
            }
          } else {
            data[field.name] = input.value || undefined;
          }
        }
      });
    }
  });
  return data;
}

function quoteYaml(value) {
  const s = String(value);
  if (/[:#\[\]{}|>&*!?'"\n]/.test(s) || s.startsWith('-') || s.startsWith(' ')) {
    return JSON.stringify(s);
  }
  return s;
}

function formDataToYaml(data) {
  const lines = [
    'locale:',
    '  language: mandarin_chinese',
    '',
    'cv:',
  ];
  const basicFields = ['name', 'label', 'location', 'email', 'phone', 'website'];
  basicFields.forEach((key) => {
    if (data[key]) lines.push(`  ${key}: ${quoteYaml(data[key])}`);
  });
  if (data.social_networks && data.social_networks.length) {
    lines.push('  social_networks:');
    data.social_networks.forEach((sn) => {
      lines.push(`    - network: ${sn.network}`);
      lines.push(`      username: ${sn.username}`);
    });
  }
  const sectionKeys = ['个人简介', '教育经历', '工作经历', '项目经历', '论文发表', '荣誉奖项', '技能'];
  const sectionLines = [];
  if (data['个人简介']) {
    sectionLines.push('    个人简介:');
    data['个人简介'].split('\n').forEach((line) => {
      if (line.trim()) sectionLines.push(`      - ${quoteYaml(line.trim())}`);
    });
  }
  sectionKeys.slice(1).forEach((key) => {
    const items = data[key];
    if (!items || !items.length) return;
    // Skip entries that have no meaningful fields set.
    const nonEmptyItems = items.filter((item) =>
      Object.values(item).some((v) =>
        v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)
      )
    );
    if (!nonEmptyItems.length) return;
    sectionLines.push(`    ${key}:`);
    nonEmptyItems.forEach((item) => {
      sectionLines.push('      -');
      Object.entries(item).forEach(([k, v]) => {
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return;
        if (Array.isArray(v)) {
          sectionLines.push(`        ${k}:`);
          v.forEach((line) => sectionLines.push(`          - ${quoteYaml(line)}`));
        } else {
          sectionLines.push(`        ${k}: ${quoteYaml(v)}`);
        }
      });
    });
  });
  if (sectionLines.length) {
    lines.push('  sections:');
    lines.push(...sectionLines);
  }
  return lines.join('\n');
}

function formToYaml() {
  const data = getFormData();
  state.yaml = formDataToYaml(data);
  if (state.mode === 'yaml') {
    els.yamlEditor.value = state.yaml;
  }
}

async function yamlToForm(yamlText) {
  try {
    const res = await fetch(API.parseYaml, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml: yamlText }),
    });
    const result = await res.json();
    populateForm(result.data);
  } catch (err) {
    setStatus('解析 YAML 失败：' + err.message, true);
  }
}

function populateForm(data) {
  const cv = (data && data.cv) || {};
  const sections = cv.sections || {};

  FORM_SCHEMA.forEach((section) => {
    if (section.list) {
      const container = els.formEditor.querySelector(`[data-section-list="${section.key}"]`);
      container.innerHTML = '';
      const items = sections[section.key] || [];
      items.forEach((item) => {
        addEntry(container, section);
        const entry = container.lastElementChild;
        section.fields.forEach((field) => {
          const input = entry.querySelector(`[data-field="${field.name}"]`);
          if (!input) return;
          const value = item[field.name];
          if (field.name === 'highlights' && Array.isArray(value)) {
            input.value = value.join('\n');
          } else if (field.name === 'items' && Array.isArray(value)) {
            input.value = value.join(', ');
          } else {
            input.value = value || '';
          }
        });
      });
      if (items.length === 0) addEntry(container, section);
    } else if (section.single) {
      const input = els.formEditor.querySelector(`[data-section="${section.key}"] textarea`);
      const value = sections[section.key];
      if (input) {
        if (Array.isArray(value)) {
          input.value = value.join('\n');
        } else {
          input.value = value || '';
        }
      }
    } else {
      section.fields.forEach((field) => {
        const input = els.formEditor.querySelector(`[data-section="${section.key}"] [data-field="${field.name}"]`);
        if (!input) return;
        if (field.name === 'linkedin' || field.name === 'github') {
          const network = field.name === 'linkedin' ? 'LinkedIn' : 'GitHub';
          const sn = (cv.social_networks || []).find((s) => s.network === network);
          input.value = sn ? sn.username : '';
        } else {
          input.value = cv[field.name] || '';
        }
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Mode switching
// ---------------------------------------------------------------------------

function switchMode() {
  if (state.mode === 'form') {
    formToYaml();
    state.mode = 'yaml';
    els.formEditor.classList.add('hidden');
    els.yamlEditor.classList.remove('hidden');
    els.yamlEditor.value = state.yaml;
    els.modeToggle.textContent = '切换表单模式';
  } else {
    state.mode = 'form';
    els.formEditor.classList.remove('hidden');
    els.yamlEditor.classList.add('hidden');
    yamlToForm(state.yaml);
    els.modeToggle.textContent = '切换 YAML 高级模式';
  }
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function dataUriToBlob(dataUri) {
  const [meta, b64] = dataUri.split(',');
  const mime = meta.match(/:(.*?);/)[1];
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

els.themeSelect.addEventListener('change', (e) => {
  state.theme = e.target.value;
  scheduleRender();
});

els.modeToggle.addEventListener('click', switchMode);

els.yamlEditor.addEventListener('input', (e) => {
  state.yaml = e.target.value;
  scheduleRender();
});

els.downloadYamlBtn.addEventListener('click', () => {
  downloadFile(state.yaml, 'cv.yaml', 'text/yaml');
});

els.downloadPdfBtn.addEventListener('click', () => {
  const pdf = els.previewImg.dataset.pdf;
  if (!pdf) {
    setStatus('没有可下载的 PDF，请先成功渲染', true);
    return;
  }
  const blob = dataUriToBlob(pdf);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cv.pdf';
  a.click();
  URL.revokeObjectURL(url);
});

els.uploadBtn.addEventListener('click', () => els.yamlFileInput.click());
els.yamlFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    state.yaml = ev.target.result;
    if (state.mode === 'yaml') {
      els.yamlEditor.value = state.yaml;
    } else {
      await yamlToForm(state.yaml);
    }
    scheduleRender();
  };
  reader.readAsText(file);
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  await loadThemes();
  buildForm();
  await loadSample();
  await yamlToForm(state.yaml);
  await doRender();
}

init();
