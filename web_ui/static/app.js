/* Frontend application for the RenderCV web UI. */

const API = {
  themes: '/api/themes',
  sample: '/api/sample',
  render: '/api/render',
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
// Mode switching
// ---------------------------------------------------------------------------

function switchMode() {
  if (state.mode === 'form') {
    state.mode = 'yaml';
    els.formEditor.classList.add('hidden');
    els.yamlEditor.classList.remove('hidden');
    els.yamlEditor.value = state.yaml;
    els.modeToggle.textContent = '切换表单模式';
  } else {
    state.mode = 'form';
    els.formEditor.classList.remove('hidden');
    els.yamlEditor.classList.add('hidden');
    // Form is not yet populated from YAML in this task.
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
  reader.onload = (ev) => {
    state.yaml = ev.target.result;
    if (state.mode === 'yaml') {
      els.yamlEditor.value = state.yaml;
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
  await loadSample();
  await doRender();
}

init();
