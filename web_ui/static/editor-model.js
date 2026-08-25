/*
 * Pure, DOM-free logic for the RenderCV editor.
 *
 * The browser loads this as a classic script (window.EditorModel) and Node
 * tests import it via require(). It centralizes the mapping between the
 * CV/design forms and the RenderCV YAML data model so that field-mapping
 * mistakes are unit-testable instead of living inline in app.js.
 *
 * Invariant: the full parsed YAML object (state.fullData) is the single
 * source of truth. Forms only write known fields through applyFormToData /
 * designFromForm; everything else (design block, custom sections, photo,
 * unknown keys) is preserved untouched.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EditorModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  "use strict";

  const FORM_SCHEMA = [
    {
      key: "basics",
      title: "基础信息",
      fields: [
        { name: "name", label: "姓名", type: "text" },
        { name: "headline", label: "职位头衔", type: "text" },
        { name: "location", label: "地点", type: "text" },
        { name: "email", label: "邮箱", type: "email" },
        { name: "phone", label: "电话", type: "text" },
        { name: "website", label: "个人网站", type: "url" },
        { name: "linkedin", label: "LinkedIn 用户名", type: "text" },
        { name: "github", label: "GitHub 用户名", type: "text" },
      ],
    },
    {
      key: "个人简介",
      aliases: ["个人简介", "summary", "简介"],
      title: "个人简介",
      single: true,
      fields: [{ name: "text", label: "简介", type: "textarea" }],
    },
    {
      key: "教育经历",
      aliases: ["教育经历", "education"],
      title: "教育经历",
      list: true,
      fields: [
        { name: "institution", label: "学校", type: "text" },
        { name: "degree", label: "学位", type: "text" },
        { name: "area", label: "专业", type: "text" },
        { name: "location", label: "地点", type: "text" },
        { name: "start_date", label: "开始时间", type: "text" },
        { name: "end_date", label: "结束时间", type: "text" },
        { name: "highlights", label: "亮点（每行一条）", type: "textarea", full: true },
      ],
    },
    {
      key: "工作经历",
      aliases: ["工作经历", "experience"],
      title: "工作经历",
      list: true,
      fields: [
        { name: "company", label: "公司", type: "text" },
        { name: "position", label: "职位", type: "text" },
        { name: "location", label: "地点", type: "text" },
        { name: "start_date", label: "开始时间", type: "text" },
        { name: "end_date", label: "结束时间", type: "text" },
        { name: "highlights", label: "亮点（每行一条）", type: "textarea", full: true },
      ],
    },
    {
      key: "项目经历",
      aliases: ["项目经历", "projects"],
      title: "项目经历",
      list: true,
      fields: [
        { name: "name", label: "项目名", type: "text" },
        { name: "link", label: "链接（写入简介 Markdown）", type: "url" },
        { name: "start_date", label: "开始时间", type: "text" },
        { name: "end_date", label: "结束时间", type: "text" },
        { name: "summary", label: "简介", type: "textarea", full: true },
        { name: "highlights", label: "亮点（每行一条）", type: "textarea", full: true },
      ],
    },
    {
      key: "技能",
      aliases: ["技能", "skills"],
      title: "技能",
      list: true,
      fields: [
        { name: "label", label: "分类", type: "text" },
        { name: "details", label: "技能（逗号分隔）", type: "text", full: true },
      ],
    },
    {
      key: "论文发表",
      aliases: ["论文发表", "publications"],
      title: "论文发表",
      list: true,
      fields: [
        { name: "title", label: "标题", type: "text" },
        { name: "authors", label: "作者（逗号分隔）", type: "text" },
        { name: "venue", label: "期刊/会议", type: "text" },
        { name: "year", label: "年份", type: "text" },
        { name: "link", label: "链接", type: "url" },
        { name: "summary", label: "摘要", type: "textarea", full: true },
      ],
    },
    {
      key: "荣誉奖项",
      aliases: ["荣誉奖项", "awards"],
      title: "荣誉奖项",
      list: true,
      fields: [
        { name: "title", label: "奖项", type: "text" },
        { name: "date", label: "时间", type: "text" },
        { name: "summary", label: "说明", type: "textarea", full: true },
      ],
    },
  ];

  function findSection(sections, section) {
    if (!sections || typeof sections !== "object") return undefined;
    return (section.aliases || [section.key])
      .map((key) => sections[key])
      .find((value) => value !== undefined);
  }

  function splitLines(value) {
    return String(value)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function splitList(value) {
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  /*
   * Convert one form row of a list section into the YAML entry object that
   * RenderCV's schema expects. The RenderCV entry types are:
   *   - OneLineEntry: label, details
   *   - NormalEntry:  name, date/start_date/end_date, location, summary, highlights
   *   - ExperienceEntry: company, position, + NormalEntry fields
   *   - EducationEntry: institution, area, degree, + NormalEntry fields
   *   - PublicationEntry: title, authors (list), date, summary, journal, url, doi
   */
  function entryFromForm(section, row) {
    if (!row) return null;
    const entry = {};
    switch (section.key) {
      case "教育经历":
        for (const key of ["institution", "degree", "area", "location", "start_date", "end_date"]) {
          if (row[key] && String(row[key]).trim()) entry[key] = String(row[key]).trim();
        }
        break;
      case "工作经历":
        for (const key of ["company", "position", "location", "start_date", "end_date"]) {
          if (row[key] && String(row[key]).trim()) entry[key] = String(row[key]).trim();
        }
        break;
      case "项目经历": {
        if (row.name && String(row.name).trim()) entry.name = String(row.name).trim();
        for (const key of ["start_date", "end_date"]) {
          if (row[key] && String(row[key]).trim()) entry[key] = String(row[key]).trim();
        }
        const summary = row.summary ? String(row.summary).trim() : "";
        const link = row.link ? String(row.link).trim() : "";
        let summaryText = summary;
        if (link) {
          summaryText = summaryText ? `${summaryText}\n[项目链接](${link})` : `[项目链接](${link})`;
        }
        if (summaryText) entry.summary = summaryText;
        break;
      }
      case "技能":
        if (row.label && String(row.label).trim()) entry.label = String(row.label).trim();
        if (row.details && String(row.details).trim()) entry.details = String(row.details).trim();
        break;
      case "论文发表":
        if (row.title && String(row.title).trim()) entry.title = String(row.title).trim();
        if (row.authors !== undefined && row.authors !== null && String(row.authors).trim()) {
          entry.authors = Array.isArray(row.authors)
            ? row.authors.map((item) => String(item).trim()).filter(Boolean)
            : splitList(row.authors);
        }
        if (row.venue && String(row.venue).trim()) entry.journal = String(row.venue).trim();
        if (row.year && String(row.year).trim()) entry.date = String(row.year).trim();
        if (row.link && String(row.link).trim()) entry.url = String(row.link).trim();
        if (row.summary && String(row.summary).trim()) entry.summary = String(row.summary).trim();
        break;
      case "荣誉奖项":
        if (row.title && String(row.title).trim()) entry.name = String(row.title).trim();
        if (row.date && String(row.date).trim()) entry.date = String(row.date).trim();
        if (row.summary && String(row.summary).trim()) entry.summary = String(row.summary).trim();
        break;
      default:
        // Fallback: pass through non-empty fields verbatim.
        for (const field of section.fields || []) {
          const value = row[field.name];
          if (value !== undefined && value !== null && String(value).trim()) {
            entry[field.name] = String(value).trim();
          }
        }
    }
    if (row.highlights !== undefined && row.highlights !== null && String(row.highlights).trim() && entry.highlights === undefined) {
      entry.highlights = Array.isArray(row.highlights)
        ? row.highlights.map((item) => String(item).trim()).filter(Boolean)
        : splitLines(row.highlights);
    }
    return Object.keys(entry).length ? entry : null;
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  /*
   * Merge the current form data into a clone of the full parsed YAML object.
   * Only the fields the form manages are written; the design block, custom
   * sections, photo, custom_connections and any unknown keys survive.
   */
  function applyFormToData(fullData, formData) {
    const result = clone(fullData) || {};
    const cv = result.cv || (result.cv = {});
    const form = formData || {};

    for (const key of ["name", "headline", "location", "email", "phone", "website"]) {
      const value = form[key] && String(form[key]).trim();
      if (value) cv[key] = value;
      else delete cv[key];
    }

    const existingNetworks = Array.isArray(cv.social_networks) ? cv.social_networks : [];
    const kept = existingNetworks.filter(
      (network) => !["LinkedIn", "GitHub"].includes(network && network.network)
    );
    const linkedin = form.linkedin && String(form.linkedin).trim();
    const github = form.github && String(form.github).trim();
    if (linkedin) kept.push({ network: "LinkedIn", username: linkedin });
    if (github) kept.push({ network: "GitHub", username: github });
    if (kept.length) cv.social_networks = kept;
    else delete cv.social_networks;

    const sections = cv.sections || (cv.sections = {});
    for (const section of FORM_SCHEMA) {
      if (section.key === "basics") continue;
      const writeKey = findSectionKey(sections, section);
      if (section.single) {
        const text = form[section.key] && String(form[section.key]).trim();
        if (text) sections[writeKey] = splitLines(text);
        else delete sections[writeKey];
        continue;
      }
      const rows = Array.isArray(form[section.key]) ? form[section.key] : [];
      const entries = rows
        .map((row) => entryFromForm(section, row))
        .filter((entry) => entry && Object.keys(entry).length);
      if (entries.length) sections[writeKey] = entries;
      else delete sections[writeKey];
    }

    return result;
  }

  function findSectionKey(sections, section) {
    const matched = (section.aliases || [section.key]).find((key) => sections[key] !== undefined);
    return matched || section.key;
  }

  /*
   * Rebuild the form-data shape from the full YAML object. Used when the CV
   * form DOM is not mounted (e.g. while the Design workspace is active) so
   * that formToYaml never clobbers the CV with empty values.
   */
  function formDataFromData(fullData) {
    const formData = {};
    const cv = (fullData && fullData.cv) || {};
    const basics = FORM_SCHEMA.find((item) => item.key === "basics");
    for (const field of basics.fields) {
      if (field.name === "linkedin" || field.name === "github") {
        const network = field.name === "linkedin" ? "LinkedIn" : "GitHub";
        const found = (cv.social_networks || []).find((n) => n && n.network === network);
        if (found) formData[field.name] = found.username;
      } else if (cv[field.name] !== undefined && cv[field.name] !== null) {
        formData[field.name] = Array.isArray(cv[field.name])
          ? cv[field.name].join(", ")
          : cv[field.name];
      }
    }
    const sections = cv.sections || {};
    for (const section of FORM_SCHEMA) {
      if (section.key === "basics") continue;
      const value = findSection(sections, section);
      if (section.single) {
        formData[section.key] = Array.isArray(value) ? value.join("\n") : value || "";
      } else if (Array.isArray(value)) {
        formData[section.key] = value;
      }
    }
    return formData;
  }

  /*
   * Strip empty values so the serialized YAML stays clean. Falsy-but-meaningful
   * values (false, 0) are preserved; only null/undefined/'' and empty
   * containers are removed.
   */
  function cleanForSerialize(value) {
    if (Array.isArray(value)) {
      const cleaned = value.map(cleanForSerialize).filter((item) => item !== undefined);
      return cleaned.length ? cleaned : undefined;
    }
    if (value && typeof value === "object") {
      const cleaned = {};
      for (const key of Object.keys(value)) {
        const item = cleanForSerialize(value[key]);
        if (item !== undefined) cleaned[key] = item;
      }
      return Object.keys(cleaned).length ? cleaned : undefined;
    }
    if (value === undefined || value === null || value === "") return undefined;
    return value;
  }

  // --- Design form -----------------------------------------------------

  const DESIGN_SECTIONS = [
    { key: "page", title: "页面" },
    { key: "colors", title: "颜色" },
    { key: "typography", title: "排版" },
    { key: "header", title: "页眉" },
    { key: "links", title: "链接" },
    { key: "sections", title: "小节" },
    { key: "entries", title: "条目" },
  ];

  const DESIGN_FIELDS = [
    { path: ["page", "size"], label: "页面尺寸", type: "select", options: ["a4", "a5", "us-letter", "us-executive"] },
    { path: ["page", "top_margin"], label: "上边距", type: "text" },
    { path: ["page", "bottom_margin"], label: "下边距", type: "text" },
    { path: ["page", "left_margin"], label: "左边距", type: "text" },
    { path: ["page", "right_margin"], label: "右边距", type: "text" },
    { path: ["page", "show_footer"], label: "显示页脚", type: "checkbox" },
    { path: ["page", "show_top_note"], label: "显示顶部备注", type: "checkbox" },

    { path: ["colors", "name"], label: "姓名颜色", type: "text" },
    { path: ["colors", "headline"], label: "头衔颜色", type: "text" },
    { path: ["colors", "body"], label: "正文字色", type: "text" },
    { path: ["colors", "section_titles"], label: "小节标题颜色", type: "text" },
    { path: ["colors", "links"], label: "链接颜色", type: "text" },

    { path: ["typography", "line_spacing"], label: "行距", type: "text" },
    { path: ["typography", "alignment"], label: "对齐", type: "select", options: ["left", "justified", "justified-with-no-hyphenation"] },
    { path: ["typography", "font_family", "body"], label: "正文字体", type: "text" },
    { path: ["typography", "font_size", "body"], label: "正文字号", type: "text" },
    { path: ["typography", "font_size", "name"], label: "姓名字号", type: "text" },
    { path: ["typography", "bold", "name"], label: "姓名加粗", type: "checkbox" },
    { path: ["typography", "small_caps", "section_titles"], label: "小节标题小型大写", type: "checkbox" },

    { path: ["header", "alignment"], label: "页眉对齐", type: "select", options: ["left", "center", "right"] },
    { path: ["header", "photo_width"], label: "照片宽度", type: "text" },
    { path: ["header", "connections", "show_icons"], label: "连接图标", type: "checkbox" },
    { path: ["header", "connections", "space_between_connections"], label: "连接间距", type: "text" },

    { path: ["links", "underline"], label: "链接下划线", type: "checkbox" },
    { path: ["links", "show_external_link_icon"], label: "外链图标", type: "checkbox" },

    { path: ["sections", "allow_page_break"], label: "允许小节分页", type: "checkbox" },
    { path: ["sections", "space_between_regular_entries"], label: "常规条目间距", type: "text" },
    { path: ["sections", "space_between_text_based_entries"], label: "文本条目间距", type: "text" },

    { path: ["entries", "date_and_location_width"], label: "日期列宽", type: "text" },
    { path: ["entries", "short_second_row"], label: "紧凑第二行", type: "checkbox" },
    { path: ["entries", "highlights", "bullet"], label: "要点符号", type: "text" },
  ];

  function getAt(object, path) {
    let node = object;
    for (const key of path) {
      if (node === undefined || node === null) return undefined;
      node = node[key];
    }
    return node;
  }

  function setAt(object, path, value) {
    let node = object;
    for (let i = 0; i < path.length - 1; i += 1) {
      const key = path[i];
      if (node[key] === undefined || node[key] === null || typeof node[key] !== "object") node[key] = {};
      node = node[key];
    }
    const last = path[path.length - 1];
    if (value === undefined || value === null || value === "") delete node[last];
    else node[last] = value;
    return object;
  }

  function deepMerge(target, source) {
    const out = {};
    for (const key of Object.keys(target || {})) {
      const value = target[key];
      out[key] = Array.isArray(value) ? [...value] : value && typeof value === "object" ? deepMerge(value, {}) : value;
    }
    for (const key of Object.keys(source || {})) {
      const value = source[key];
      const existing = out[key];
      if (value && typeof value === "object" && !Array.isArray(value) && existing && typeof existing === "object" && !Array.isArray(existing)) {
        out[key] = deepMerge(existing, value);
      } else if (value !== undefined) {
        out[key] = Array.isArray(value) ? [...value] : value;
      }
    }
    return out;
  }

  function pruneEmptyObjects(object) {
    for (const key of Object.keys(object)) {
      const value = object[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        pruneEmptyObjects(value);
        if (Object.keys(value).length === 0) delete object[key];
      }
    }
    return object;
  }

  /*
   * Write the design form values over a deep clone of the design object.
   * Empty inputs delete the key so the theme's default applies again.
   */
  function designFromForm(design, formValues) {
    const result = clone(design) || {};
    for (const field of DESIGN_FIELDS) {
      const value = formValues[field.path.join(".")];
      if (value === undefined) continue;
      if (field.type === "checkbox") setAt(result, field.path, !!value);
      else setAt(result, field.path, String(value).trim());
    }
    return pruneEmptyObjects(result);
  }

  /*
   * Read current form values from a design object (defaults merged with
   * overrides), keyed by dotted path for the form.
   */
  function formValuesFromDesign(design) {
    const values = {};
    for (const field of DESIGN_FIELDS) {
      const value = getAt(design, field.path);
      if (value !== undefined && value !== null) values[field.path.join(".")] = value;
    }
    return values;
  }

  // --- Error path mapping ----------------------------------------------

  /*
   * Map a RenderCV schema_location (e.g. ["cv","sections","技能","0","details"])
   * to a form field locator so the UI can highlight the offending input.
   */
  function formFieldLocator(schemaLocation, formSchema) {
    if (!Array.isArray(schemaLocation) || schemaLocation[0] !== "cv") return null;
    const schema = formSchema || FORM_SCHEMA;
    if (schemaLocation[1] === "sections" && schemaLocation[2] !== undefined) {
      const title = schemaLocation[2];
      const section = schema.find((item) => (item.aliases || [item.key]).includes(title));
      if (!section) return { sectionKey: title, field: null, raw: schemaLocation };
      if (!section.list) return { sectionKey: section.key, field: null, raw: schemaLocation };
      const index = Number(schemaLocation[3]);
      return {
        sectionKey: section.key,
        index: Number.isInteger(index) && index >= 0 ? index : null,
        field: schemaLocation[4] || null,
        raw: schemaLocation,
      };
    }
    const field = schemaLocation[1];
    const basics = schema.find((item) => item.key === "basics");
    if (basics && basics.fields.some((item) => item.name === field)) {
      return { sectionKey: "basics", field, raw: schemaLocation };
    }
    return { sectionKey: field, field: null, raw: schemaLocation };
  }

  return {
    FORM_SCHEMA,
    DESIGN_FIELDS,
    DESIGN_SECTIONS,
    findSection,
    entryFromForm,
    applyFormToData,
    formDataFromData,
    cleanForSerialize,
    getAt,
    setAt,
    deepMerge,
    designFromForm,
    formValuesFromDesign,
    formFieldLocator,
  };
});
