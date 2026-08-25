import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const M = require("./editor-model.js");

const educationSection = M.FORM_SCHEMA.find((s) => s.key === "教育经历");
const skillsSection = M.FORM_SCHEMA.find((s) => s.key === "技能");
const publicationsSection = M.FORM_SCHEMA.find((s) => s.key === "论文发表");
const awardsSection = M.FORM_SCHEMA.find((s) => s.key === "荣誉奖项");
const projectsSection = M.FORM_SCHEMA.find((s) => s.key === "项目经历");

test("skills rows map to OneLineEntry (label + details, no items)", () => {
  const entry = M.entryFromForm(skillsSection, { label: "Languages", details: "Python, Go" });
  assert.deepEqual(entry, { label: "Languages", details: "Python, Go" });
});

test("publications rows map to PublicationEntry", () => {
  const entry = M.entryFromForm(publicationsSection, {
    title: "A Paper",
    authors: "Alice, Bob",
    venue: "Nature",
    year: "2024",
    link: "https://example.com",
    summary: "Abstract",
  });
  assert.deepEqual(entry, {
    title: "A Paper",
    authors: ["Alice", "Bob"],
    journal: "Nature",
    date: "2024",
    url: "https://example.com",
    summary: "Abstract",
  });
});

test("awards rows map to NormalEntry (title -> name)", () => {
  const entry = M.entryFromForm(awardsSection, { title: "Best Award", date: "2024-05" });
  assert.deepEqual(entry, { name: "Best Award", date: "2024-05" });
});

test("projects rows embed the link into summary markdown", () => {
  const entry = M.entryFromForm(projectsSection, {
    name: "My Project",
    link: "https://example.com/p",
    start_date: "2020-01",
    end_date: "2020-06",
  });
  assert.deepEqual(entry, {
    name: "My Project",
    start_date: "2020-01",
    end_date: "2020-06",
    summary: "[项目链接](https://example.com/p)",
  });
});

test("projects rows keep an existing summary and append the link", () => {
  const entry = M.entryFromForm(projectsSection, {
    name: "My Project",
    link: "https://example.com/p",
    summary: "Cool thing",
  });
  assert.equal(entry.summary, "Cool thing\n[项目链接](https://example.com/p)");
});

test("education rows keep highlights as a list", () => {
  const entry = M.entryFromForm(educationSection, {
    institution: "MIT",
    highlights: "First\nSecond",
  });
  assert.deepEqual(entry, { institution: "MIT", highlights: ["First", "Second"] });
});

test("empty rows produce no entry", () => {
  assert.equal(M.entryFromForm(skillsSection, { label: "  " }), null);
  assert.equal(M.entryFromForm(skillsSection, {}), null);
});

test("applyFormToData preserves design, custom sections, photo and unknown keys", () => {
  const fullData = {
    design: { theme: "opal", colors: { name: "rgb(1, 2, 3)" } },
    cv: {
      name: "Old Name",
      photo: "photo.jpg",
      sections: {
        自定义小节: ["Some custom text"],
        教育经历: [{ institution: "MIT" }],
      },
    },
    custom_top_level: { keep: true },
  };
  const formData = {
    name: "New Name",
    "教育经历": [{ institution: "Harvard", degree: "PhD" }],
  };
  const result = M.applyFormToData(fullData, formData);
  assert.equal(result.cv.name, "New Name");
  assert.equal(result.cv.photo, "photo.jpg");
  assert.deepEqual(result.design, { theme: "opal", colors: { name: "rgb(1, 2, 3)" } });
  assert.deepEqual(result.custom_top_level, { keep: true });
  assert.deepEqual(result.cv.sections["自定义小节"], ["Some custom text"]);
  assert.deepEqual(result.cv.sections["教育经历"], [{ institution: "Harvard", degree: "PhD" }]);
});

test("applyFormToData writes back to the original section key (aliases)", () => {
  const fullData = { cv: { name: "X", sections: { education: [{ institution: "MIT" }] } } };
  const result = M.applyFormToData(fullData, { "教育经历": [{ institution: "Harvard" }] });
  assert.equal(result.cv.sections.education[0].institution, "Harvard");
  assert.equal(result.cv.sections["教育经历"], undefined);
});

test("applyFormToData removes an emptied section", () => {
  const fullData = { cv: { name: "X", sections: { 技能: [{ label: "L", details: "D" }] } } };
  const result = M.applyFormToData(fullData, { "技能": [] });
  assert.equal(result.cv.sections["技能"], undefined);
});

test("applyFormToData preserves non-LinkedIn/GitHub social networks", () => {
  const fullData = {
    cv: {
      social_networks: [
        { network: "LinkedIn", username: "old" },
        { network: "Mastodon", username: "@me" },
      ],
    },
  };
  const result = M.applyFormToData(fullData, { github: "newuser" });
  assert.deepEqual(result.cv.social_networks, [
    { network: "Mastodon", username: "@me" },
    { network: "GitHub", username: "newuser" },
  ]);
});

test("cleanForSerialize drops empty values but keeps false", () => {
  const cleaned = M.cleanForSerialize({
    a: "",
    b: null,
    c: false,
    d: 0,
    e: [],
    f: { g: "" },
    h: "ok",
    i: ["keep", ""],
  });
  assert.deepEqual(cleaned, { c: false, d: 0, h: "ok", i: ["keep"] });
});

test("formFieldLocator maps section entry field errors", () => {
  const locator = M.formFieldLocator(["cv", "sections", "技能", "0", "details"]);
  assert.deepEqual(locator, { sectionKey: "技能", index: 0, field: "details", raw: ["cv", "sections", "技能", "0", "details"] });
});

test("formFieldLocator maps basic field errors", () => {
  const locator = M.formFieldLocator(["cv", "email"]);
  assert.deepEqual(locator, { sectionKey: "basics", field: "email", raw: ["cv", "email"] });
});

test("formFieldLocator maps errors by English alias", () => {
  const locator = M.formFieldLocator(["cv", "sections", "education", "2", "institution"]);
  assert.deepEqual(locator, { sectionKey: "教育经历", index: 2, field: "institution", raw: ["cv", "sections", "education", "2", "institution"] });
});

test("formValuesFromDesign reads nested design paths", () => {
  const values = M.formValuesFromDesign({
    page: { size: "a4", show_footer: false },
    colors: { name: "rgb(1, 2, 3)" },
  });
  assert.equal(values["page.size"], "a4");
  assert.equal(values["page.show_footer"], false);
  assert.equal(values["colors.name"], "rgb(1, 2, 3)");
  assert.equal(values["typography.alignment"], undefined);
});

test("designFromForm writes values and deletes cleared ones", () => {
  const design = M.designFromForm({ theme: "opal", page: { size: "a4" } }, {
    "page.size": "us-letter",
    "colors.name": "rgb(9, 9, 9)",
    "typography.alignment": "",
  });
  assert.equal(design.page.size, "us-letter");
  assert.equal(design.colors.name, "rgb(9, 9, 9)");
  assert.equal(design.typography, undefined);
});

test("formDataFromData rebuilds the form shape from full data", () => {
  const fullData = {
    cv: {
      name: "张三",
      email: "a@b.com",
      social_networks: [{ network: "GitHub", username: "z3" }],
      sections: {
        个人简介: ["Line one", "Line two"],
        教育经历: [{ institution: "MIT", degree: "PhD" }],
        自定义小节: ["custom text"],
      },
    },
  };
  const formData = M.formDataFromData(fullData);
  assert.equal(formData.name, "张三");
  assert.equal(formData.github, "z3");
  assert.equal(formData["个人简介"], "Line one\nLine two");
  assert.deepEqual(formData["教育经历"], [{ institution: "MIT", degree: "PhD" }]);
  assert.equal(formData["自定义小节"], undefined);
});

test("entryFromForm accepts array highlights/authors from full data", () => {
  const edu = M.entryFromForm(educationSection, {
    institution: "MIT",
    highlights: ["First", "Second"],
  });
  assert.deepEqual(edu, { institution: "MIT", highlights: ["First", "Second"] });
  const pub = M.entryFromForm(publicationsSection, {
    title: "P",
    authors: ["Alice", "Bob"],
  });
  assert.deepEqual(pub, { title: "P", authors: ["Alice", "Bob"] });
});

test("formDataFromData round-trips through applyFormToData", () => {
  const fullData = {
    cv: {
      name: "张三",
      social_networks: [{ network: "GitHub", username: "z3" }],
      sections: {
        个人简介: ["Hello"],
        技能: [{ label: "Languages", details: "Python, Go" }],
        自定义小节: ["keep me"],
      },
    },
    design: { theme: "opal" },
  };
  const rebuilt = M.applyFormToData(fullData, M.formDataFromData(fullData));
  assert.deepEqual(rebuilt, fullData);
});

test("deepMerge keeps nested defaults under overrides", () => {
  const merged = M.deepMerge({ page: { size: "a4", show_footer: true } }, { page: { size: "us-letter" } });
  assert.deepEqual(merged, { page: { size: "us-letter", show_footer: true } });
});
