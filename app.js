// app.js — Study Buddy frontend logic
// Connects to server.js running on localhost:3001

const API = "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";

// ── State ─────────────────────────────────────────────────────────────────────
let chatHistory = [];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getNotes() {
  return document.getElementById("notes-input").value.trim();
}

function showToast(msg) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function requireNotes() {
  if (!getNotes()) {
    showToast("Paste your notes on the left first!");
    return false;
  }
  return true;
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === `tab-${tab}`));
}

// ── Notes handling ────────────────────────────────────────────────────────────
document.getElementById("notes-input").addEventListener("input", function () {
  document.getElementById("char-count").textContent = `${this.value.length} chars`;
});

function clearNotes() {
  document.getElementById("notes-input").value = "";
  document.getElementById("char-count").textContent = "0 chars";
}

function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const textarea = document.getElementById("notes-input");
    textarea.value = ev.target.result;
    document.getElementById("char-count").textContent = `${textarea.value.length} chars`;
  };
  reader.readAsText(file);
  e.target.value = ""; // reset so same file can be re-uploaded
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function appendMessage(role, content, isLoading = false) {
  const win = document.getElementById("chat-window");
  const div = document.createElement("div");
  div.className = `message ${role}${isLoading ? " loading" : ""}`;

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  if (isLoading) {
    bubble.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
  } else {
    bubble.textContent = content;
  }

  div.appendChild(bubble);
  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
  return { div, bubble };
}

async function sendChat() {
  if (!requireNotes()) return;

  const input = document.getElementById("chat-input");
  const question = input.value.trim();
  if (!question) return;

  const sendBtn = document.getElementById("send-btn");
  input.value = "";
  sendBtn.disabled = true;

  appendMessage("user", question);
  const { div: loadingDiv, bubble: loadingBubble } = appendMessage("ai", "", true);

  try {
    const res = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, notes: getNotes(), history: chatHistory }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Server error");
    }

    const data = await res.json();

    // Update the loading bubble with the real answer
    loadingDiv.classList.remove("loading");
    loadingBubble.textContent = data.answer;

    // Keep history for multi-turn conversation
    chatHistory.push({ role: "user", content: question });
    chatHistory.push({ role: "assistant", content: data.answer });

    // Keep history manageable (last 10 turns)
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

  } catch (err) {
    loadingDiv.classList.remove("loading");
    loadingBubble.textContent = `Error: ${err.message}. Is the server running?`;
    loadingBubble.style.color = "var(--danger)";
  }

  sendBtn.disabled = false;
  document.getElementById("chat-window").scrollTop = 9999;
}

// ── Quiz ──────────────────────────────────────────────────────────────────────
async function generateQuiz() {
  if (!requireNotes()) return;

  const btn = document.getElementById("quiz-btn");
  const area = document.getElementById("quiz-area");

  btn.disabled = true;
  btn.textContent = "Generating…";
  area.innerHTML = `<div class="empty-state"><div class="empty-icon">◈</div><p>Building your quiz…</p></div>`;

  try {
    const res = await fetch(`${API}/quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: getNotes() }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Server error");
    }

    const { questions } = await res.json();
    area.innerHTML = "";
    renderQuiz(questions);

  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">${err.message}</p></div>`;
    showToast(`Quiz failed: ${err.message}`);
  }

  btn.disabled = false;
  btn.textContent = "Generate quiz →";
}

function renderQuiz(questions) {
  const area = document.getElementById("quiz-area");

  questions.forEach((q, i) => {
    const card = document.createElement("div");
    card.className = "quiz-card";
    card.style.animationDelay = `${i * 0.06}s`;

    const options = q.options.map((opt, oi) => {
      const letter = String.fromCharCode(65 + oi); // A, B, C, D
      return `
        <button class="quiz-option" onclick="checkAnswer(this, '${letter}', '${q.answer}', ${i})">
          <span class="opt-letter">${letter}</span>
          <span>${opt.replace(/^[A-D]\.\s*/, "")}</span>
        </button>`;
    }).join("");

    card.innerHTML = `
      <div class="quiz-q-num">Question ${i + 1} of ${questions.length}</div>
      <div class="quiz-q-text">${q.question}</div>
      <div class="quiz-options" id="quiz-opts-${i}">${options}</div>`;

    area.appendChild(card);
  });
}

function checkAnswer(btn, selected, correct, qIndex) {
  // Lock all options in this question
  const opts = document.querySelectorAll(`#quiz-opts-${qIndex} .quiz-option`);
  opts.forEach(opt => opt.classList.add("revealed"));

  if (selected === correct) {
    btn.classList.add("correct");
  } else {
    btn.classList.add("wrong");
    // Highlight the correct answer
    opts.forEach(opt => {
      const letter = opt.querySelector(".opt-letter").textContent;
      if (letter === correct) opt.classList.add("correct");
    });
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
async function generateSummary() {
  if (!requireNotes()) return;

  const btn = document.getElementById("summary-btn");
  const area = document.getElementById("summary-area");

  btn.disabled = true;
  btn.textContent = "Summarizing…";
  area.innerHTML = `<div class="empty-state"><div class="empty-icon">◇</div><p>Reading your notes…</p></div>`;

  try {
    const res = await fetch(`${API}/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: getNotes() }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Server error");
    }

    const { summary } = await res.json();
    area.innerHTML = `<div class="summary-content">${markdownToHtml(summary)}</div>`;

  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">${err.message}</p></div>`;
    showToast(`Summary failed: ${err.message}`);
  }

  btn.disabled = false;
  btn.textContent = "Summarize notes →";
}

// Minimal markdown → HTML (headings + bullets only)
function markdownToHtml(text) {
  return text
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, match => `<ul>${match}</ul>`)
    .replace(/\n{2,}/g, "<br>");
}
