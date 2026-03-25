const path = require('path');

// Load .env from server folder in development, use process.env in production (Vercel)
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
}

const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

const app = express();
app.use(cors({
  origin: [
    // "https://chat-bot-one-vert-80.vercel.app",
    "http://localhost:5173",
    // "http://localhost:3000"
  ],
  methods: ["GET", "POST", "DELETE"],
  credentials: true
}));

app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Simple response cache: key = sessionId + message
const responseCache = new Map();

const SYSTEM_PROMPT = `You are a helpful assistant for Maa Savitri Consultancy Services, an educational consultancy based in Siwan, Bihar. You handle new contact queries professionally and warmly.
 
LANGUAGE RULE (most important):
- The very first user message will either be a language selection ("English" or "हिंदी") or a general query.
- If the user selects English or writes in English → respond ONLY in English for the entire conversation.
- If the user selects हिंदी or writes in Hindi → respond ONLY in Hindi for the entire conversation.
- Once language is set, NEVER switch languages unless the user explicitly asks to change.
- After language selection, warmly greet the user and ask how you can help them today.
 
About the Organization:
- Educational consultancy focused on improving education quality in Bihar and eastern Uttar Pradesh
- Based in Siwan, Bihar
- Services: teacher recruitment, non-teaching staff recruitment, admission campaigns, advertising & promotion, website designing for schools
 
Teacher Recruitment Process:
1. Understanding client school requirements
2. Creating job descriptions
3. Sourcing candidates via advertisements and networks
4. Screening, interviews, background checks
5. Assessments: demo classes and written tests
6. Final selection → job offers → onboarding → continuous support
7. Feedback collection to improve future placements
 
Pricing - For Schools (Client Institutions):
- Service fee: ₹1500 total
- Payment: 50% (₹750) paid upfront, remaining 50% (₹750) after successful placement
 
Pricing - For Teachers (Candidates):
- Service fee: 50% of first month's salary
- Payment options: 
  1. One installment within 40 days
  2. Two installments over a defined period
 
Key Policies:
- Teachers must provide accurate information and attend interviews on time
- Both parties must maintain confidentiality
- Timely communication required from all parties
- Either party may terminate with prior notice
 
Your role:
- Answer queries about services, fees, process, and eligibility
- Collect contact details (name, phone, email, city, whether they are a school or teacher) when someone expresses interest
- Be warm, professional, and helpful
- Keep responses concise — 2-4 sentences typically
- If someone wants to connect with the team, ask for their name and contact number
 
Do NOT make up information not listed above. If unsure, say the team will get back to them.`;
 

const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT 
});

const conversationStore = {};

async function askGeminiWithRetry(history, message, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const chat = model.startChat({ history });
            const result = await chat.sendMessage(message);
            return result.response.text();
        } catch (err) {
            const isRateLimit = err.status === 429 || /quota|rate.?limit|exceeded/i.test(err.message);
            if (isRateLimit && i < retries) {
                await new Promise(r => setTimeout(r, 1000 * (i + 1)));
            } else {
                throw err;
            }
        }
    }
}

async function askGroq(history, message) {
    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.map(m => ({ role: m.role === "model" ? "assistant" : "user", content: m.parts[0].text })),
        { role: "user", content: message }
    ];
    const res = await groq.chat.completions.create({
        model: "llama3-8b-8192",
        messages
    });
    return res.choices[0].message.content;
}

app.post("/api/chat", async (req, res) => {
    const { message, sessionId } = req.body;

    if (!message || !sessionId) {
        return res.status(400).json({ error: "message and sessionId are required" });
    }

    if (!conversationStore[sessionId]) {
        conversationStore[sessionId] = [];
    }

    try {
        const cacheKey = `${sessionId}:${message}`;
        if (responseCache.has(cacheKey)) {
            return res.json({ reply: responseCache.get(cacheKey), sessionId, source: "cache" });
        }

        const history = conversationStore[sessionId].map(msg => ({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }],
        }));

        let assistantMessage;
        let source = "gemini";

        try {
            assistantMessage = await askGeminiWithRetry(history, message);
        } catch (geminiErr) {
            const isRateLimit = geminiErr.status === 429 || /quota|rate.?limit|exceeded/i.test(geminiErr.message);
            if (isRateLimit) {
                console.warn("Gemini limit hit, falling back to Groq");
                assistantMessage = await askGroq(history, message);
                source = "groq";
            } else {
                throw geminiErr;
            }
        }

        responseCache.set(cacheKey, assistantMessage);
        if (responseCache.size > 500) {
            responseCache.delete(responseCache.keys().next().value);
        }

        conversationStore[sessionId].push({ role: "user", content: message });
        conversationStore[sessionId].push({ role: "assistant", content: assistantMessage });

        if (conversationStore[sessionId].length > 20) {
            conversationStore[sessionId] = conversationStore[sessionId].slice(-20);
        }

        res.json({ reply: assistantMessage, sessionId, source });

    } catch (error) {
        console.error("AI error:", error.message);
        res.status(500).json({ error: "Failed to get response from AI" });
    }
});

app.delete("/api/chat/:sessionId", (req, res) => {
    delete conversationStore[req.params.sessionId];
    res.json({ message: "Session cleared" });
});

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "Maa Savitri Chatbot API (Gemini Powered)" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
