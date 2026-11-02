const STORAGE_KEY = "copilot-quiz-v1";

const $ = (id) => document.getElementById(id);
const tabsEl = $("tabs");
const panelEl = $("panel");
const qDialog = $("question-dialog");
const rDialog = $("result-dialog");

let data;
let state = load();
let current = null;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") return { activeTab: saved.activeTab, answers: saved.answers ?? {} };
  } catch { /* ignore corrupt storage */ }
  return { activeTab: null, answers: {} };
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function statusOf(q) {
  const a = state.answers[q.id];
  return a ? (a.correct ? "correct" : "incorrect") : "unanswered";
}

const STATUS_LABEL = { correct: "✓ Correct", incorrect: "✗ Try again", unanswered: "Not answered" };

function renderTabs() {
  tabsEl.replaceChildren(...data.topics.map((t) => tabButton(t, t.id === state.activeTab)));
}

function tabButton(t, selected) {
  const b = el("button", { type: "button", textContent: t.title, id: `tab-${t.id}` });
  b.setAttribute("role", "tab");
  b.setAttribute("aria-selected", String(selected));
  b.setAttribute("aria-controls", "panel");
  b.tabIndex = selected ? 0 : -1;
  b.addEventListener("click", () => selectTab(t.id));
  return b;
}

function selectTab(id, focus = false) {
  state.activeTab = id;
  save();
  history.replaceState(null, "", `#${id}`);
  render();
  if (focus) $(`tab-${id}`).focus();
}

tabsEl.addEventListener("keydown", (e) => {
  const ids = data.topics.map((t) => t.id);
  const i = ids.indexOf(state.activeTab);
  const moves = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ids.length - 1 };
  if (!(e.key in moves)) return;
  e.preventDefault();
  selectTab(ids[(moves[e.key] + ids.length) % ids.length], true);
});

function renderPanel() {
  const topic = data.topics.find((t) => t.id === state.activeTab);
  const qs = data.questions.filter((q) => q.topic === topic.id);
  const done = qs.filter((q) => statusOf(q) === "correct").length;
  panelEl.setAttribute("aria-labelledby", `tab-${topic.id}`);

  const list = el("ul", { className: "grid" }, ...qs.map((q, i) => {
    const status = statusOf(q);
    const card = el("button", { type: "button", className: "question-card" },
      el("span", { className: "num", textContent: `Question ${i + 1}` }),
      el("span", { textContent: q.question }),
      el("span", { className: "badge", textContent: STATUS_LABEL[status] }),
    );
    card.dataset.status = status;
    card.addEventListener("click", () => openQuestion(q, i + 1, qs.length));
    return el("li", {}, card);
  }));

  panelEl.replaceChildren(
    el("p", { className: "progress", textContent: `${done} of ${qs.length} correct in this topic` }),
    list,
  );
}

function renderOverall() {
  const total = data.questions.length;
  const correct = data.questions.filter((q) => statusOf(q) === "correct").length;
  $("overall").textContent = `Overall: ${correct} of ${total} correct`;
}

function render() {
  renderTabs();
  renderPanel();
  renderOverall();
}

function openQuestion(q, n, total) {
  current = q;
  $("q-meta").textContent = `${data.topics.find((t) => t.id === q.topic).title} · Question ${n} of ${total}`;
  $("q-title").textContent = q.question;
  const fieldset = $("q-options");
  fieldset.querySelectorAll(".option").forEach((n) => n.remove());
  q.options.forEach((text, i) => {
    const input = el("input", { type: "radio", name: "answer", value: String(i), required: true });
    fieldset.append(el("label", { className: "option" }, input, el("span", { textContent: text })));
  });
  qDialog.showModal();
}

$("q-cancel").addEventListener("click", () => qDialog.close());

$("q-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const choice = Number(new FormData(e.target).get("answer"));
  const correct = choice === current.answerIndex;
  state.answers[current.id] = { choice, correct };
  save();
  qDialog.close();
  showResult(current, correct);
  render();
});

function showResult(q, correct) {
  const title = $("r-title");
  const body = $("r-body");
  const docs = $("r-docs");
  title.textContent = correct ? "🎉 Congratulations, that's correct!" : "Not quite";
  title.className = correct ? "good" : "bad";
  body.textContent = correct
    ? q.explanation
    : `The correct answer is: ${q.options[q.answerIndex]}. ${q.explanation}`;
  docs.replaceChildren();
  if (!correct) {
    const a = el("a", { href: q.docsUrl, target: "_blank", rel: "noopener", textContent: q.docsTitle });
    docs.append("Learn more in GitHub Docs: ", a);
  }
  $("r-retry").hidden = correct;
  rDialog.showModal();
}

$("r-close").addEventListener("click", () => rDialog.close());
$("r-retry").addEventListener("click", () => {
  const q = current;
  const qs = data.questions.filter((x) => x.topic === q.topic);
  rDialog.close();
  openQuestion(q, qs.indexOf(q) + 1, qs.length);
});

$("reset").addEventListener("click", () => {
  if (!confirm("Clear all your answers for this session?")) return;
  state.answers = {};
  save();
  render();
});

for (const d of [qDialog, rDialog]) {
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
}

async function init() {
  const res = await fetch("questions.json");
  data = await res.json();
  const hash = location.hash.slice(1);
  const valid = (id) => data.topics.some((t) => t.id === id);
  state.activeTab = valid(hash) ? hash : valid(state.activeTab) ? state.activeTab : data.topics[0].id;
  render();
}

init().catch(() => {
  panelEl.textContent = "Sorry, the quiz could not be loaded. Please refresh the page.";
});
