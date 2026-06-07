// server.js — Study Buddy backend using Groq API
// Run with: node server.js

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "2mb" })); // allow large notes payloads

// ─── Groq client ─────────────────────────────────────────────────────────────
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "Study Buddy server is running!" });
});

// ─── POST /chat ───────────────────────────────────────────────────────────────
// Body: { question: string, notes: string, history?: { role, content }[] }
app.post("/chat", async (req, res) => {
  const { question, notes, history = [] } = req.body;

  // Validate inputs
  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "question is required" });
  }
  if (!notes || typeof notes !== "string") {
    return res.status(400).json({ error: "notes is required" });
  }

  // Build system prompt — grounds all answers in the user's notes
  const systemPrompt = `You are a helpful, encouraging study assistant. The student has provided their notes below.

RULES:
- Answer questions using ONLY the provided notes.
- If the answer is not in the notes, say clearly: "I couldn't find that in your notes." Then optionally suggest what topic to look up.
- Keep answers concise and student-friendly.
- When asked to quiz the student, generate clear multiple-choice or short-answer questions based on the notes.
- When asked for a summary, give a well-structured bullet-point summary of the key ideas.

--- STUDENT NOTES START ---
${notes.trim()}
--- STUDENT NOTES END ---`;

  try {
    // Build message history (supports multi-turn conversation)
    const messages = [
      ...history.map(({ role, content }) => ({ role, content })),
      { role: "user", content: question },
    ];

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",       // fast & free — swap to llama3-70b-8192 for better quality
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      temperature: 0.5,              // balanced — not too creative, not too rigid
      max_tokens: 1024,
      stream: false,
    });

    const answer = completion.choices[0]?.message?.content ?? "Sorry, I couldn't generate a response. Please try again.";

    res.json({
      answer,
      model: completion.model,
      usage: completion.usage,        // token counts — useful for debugging
    });

  } catch (err) {
    console.error("Groq API error:", err);

    // Pass through Groq's error message if available
    const message = err?.error?.message ?? err.message ?? "Something went wrong";
    res.status(500).json({ error: message });
  }
});

// ─── POST /quiz ───────────────────────────────────────────────────────────────
// Generates 5 quiz questions from the notes
// Body: { notes: string }
app.post("/quiz", async (req, res) => {
  const { notes } = req.body;

  if (!notes || typeof notes !== "string") {
    return res.status(400).json({ error: "notes is required" });
  }

  const prompt = `Based on the following notes, generate exactly 5 quiz questions to test understanding.

Format your response as valid JSON only — no explanation, no markdown, just the JSON array:
[
  {
    "question": "...",
    "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
    "answer": "A"
  }
]

NOTES:
${notes.trim()}`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1024,
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";

    // Safely parse the JSON response
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const questions = JSON.parse(cleaned);

    res.json({ questions });

  } catch (err) {
    console.error("Quiz generation error:", err);
    res.status(500).json({ error: "Failed to generate quiz. Try again." });
  }
});

// ─── POST /summarize ──────────────────────────────────────────────────────────
// Returns a structured summary of the notes
// Body: { notes: string }
app.post("/summarize", async (req, res) => {
  const { notes } = req.body;

  if (!notes || typeof notes !== "string") {
    return res.status(400).json({ error: "notes is required" });
  }

  const prompt = `Summarize the following study notes into clear, concise bullet points grouped by topic. Use this format:

## [Topic Name]
- Key point
- Key point

Keep it tight — this is a quick-reference summary, not a rewrite.

NOTES:
${notes.trim()}`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 1024,
    });

    const summary = completion.choices[0]?.message?.content ?? "Could not generate summary.";
    res.json({ summary });

  } catch (err) {
    console.error("Summarize error:", err);
    res.status(500).json({ error: "Failed to summarize. Try again." });
  }
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Study Buddy server running on http://localhost:${PORT}`);
  console.log(`Groq API key loaded: ${process.env.GROQ_API_KEY ? "YES" : "NO — check your .env file"}`);
});