# 🧠 FlowMind — Your AI Chief of Staff

> Stop managing tasks. Start achieving goals.

FlowMind is an AI-powered productivity companion that moves beyond passive reminders. It proactively helps students, professionals, and entrepreneurs plan, prioritize, and actually complete their tasks before deadlines are missed — using conversational AI, voice commands, smart scheduling, and habit tracking, all wrapped in a clean, premium interface.

Built for **Vibe to Ship 2026** (Coding Ninjas × Google for Developers Hackathon).

---

## 🚀 Live Demo

- **Live App:** [your-deployed-link-here]
- **Demo Video:** [your-video-link-here]

---

## 🎯 Problem Statement

Students, professionals, and entrepreneurs frequently miss deadlines, assignments, meetings, bill payments, interviews, and important commitments. Existing productivity tools rely on passive reminders that are easy to ignore and do little to help users actually complete their tasks.

## 💡 Our Solution

FlowMind is not a to-do list — it's an AI Chief of Staff that:

- **Breaks goals into action plans automatically** — describe what you need to do in plain English, and AI generates a step-by-step plan with subtasks and time estimates
- **Schedules your week intelligently** — tell it your commitments, and it builds an optimized calendar around your energy and availability
- **Talks back** — a full conversational AI assistant ("Flow") with voice input/output, so you can plan hands-free
- **Watches deadlines proactively** — context-aware notifications before things go wrong, not just generic alerts
- **Builds habits that stick** — streak tracking, contribution-graph-style visualization, and gamified achievements
- **Helps you focus** — a built-in Pomodoro/deep-work mode with ambient sounds and an AI coach for when you're stuck

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🧠 **AI Goal Planner** | Describe any goal — Gemini AI breaks it into actionable subtasks instantly |
| 📅 **Smart Scheduling** | AI builds your weekly schedule around existing commitments |
| 🎙️ **Voice Assistant** | Add tasks and chat with Flow entirely by voice (Web Speech API) |
| 🔔 **Deadline Guardian** | Context-aware reminders for overdue, due-today, and upcoming tasks |
| 📊 **Habit Tracker & Analytics** | GitHub-style habit grid, productivity score, and AI-generated insights |
| 🍅 **Focus Mode** | Pomodoro/deep-work sessions with ambient sounds and an in-session AI coach |
| 💬 **AI Chat (Flow)** | Full conversational assistant that can create tasks and schedules directly from chat |
| 🏆 **Achievements** | Gamified streaks and milestones to keep momentum going |

---

## 🛠️ Tech Stack

**Frontend**
- React + Vite
- Tailwind CSS
- Framer Motion (animations)
- React Router DOM
- react-big-calendar
- Recharts (analytics charts)

**Backend & Services**
- **Firebase Authentication** — email/password + Google sign-in
- **Firebase Firestore** — real-time database for tasks, habits, conversations, analytics
- **Supabase Storage** — avatar & file storage (free tier, S3-compatible)
- **Google Gemini API** (`gemini-2.0-flash`) — AI planning, scheduling, chat, and insights

**Browser-native APIs (no extra cost)**
- Web Speech API — voice input (recognition) and output (text-to-speech)
- Web Audio API — focus mode ambient sounds and timer chimes
- Service Worker + Push API — browser notifications
- PWA manifest — installable on mobile/desktop

---

## 🏗️ Architecture

```
flowmind/
├── public/
│   ├── manifest.json        # PWA config
│   └── sw.js                 # Service worker for notifications
├── src/
│   ├── components/           # Layout, FocusMode, ProtectedRoute, ErrorBoundary
│   ├── contexts/              # AuthContext, ThemeContext
│   ├── lib/                   # gemini.js, supabase.js, notifications.js
│   ├── pages/
│   │   ├── Landing.jsx
│   │   ├── Auth.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Tasks.jsx
│   │   ├── Calendar.jsx
│   │   ├── AIChat.jsx
│   │   ├── Analytics.jsx
│   │   └── Settings.jsx
│   ├── firebase.js
│   └── App.jsx
└── .env
```

### Data Flow
1. User authenticates via Firebase Auth → profile stored in Firestore
2. Tasks/habits/conversations stored in Firestore with real-time `onSnapshot` listeners
3. AI requests (planning, chat, insights) go to Gemini API directly from the client
4. Avatars/files uploaded to Supabase Storage, public URL saved back to Firestore
5. Notifications generated client-side based on task deadlines, shown via browser Notification API

---

## ⚙️ Getting Started

### Prerequisites
- Node.js 18+
- A Firebase project (free tier)
- A Supabase project (free tier)
- A Google Gemini API key (free tier via [AI Studio](https://aistudio.google.com))

### Installation

```bash
# Clone the repo
git clone https://github.com/your-username/flowmind.git
cd flowmind

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
```

### Environment Variables

Create a `.env` file in the root with:

```env
# Firebase
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Supabase
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Google Gemini
VITE_GEMINI_API_KEY=
```

### Firebase Setup
1. Create a project at [firebase.google.com](https://firebase.google.com)
2. Add a Web App, copy the config values into `.env`
3. Enable **Authentication** → Email/Password and Google providers
4. Enable **Firestore Database** → start in test mode (or apply rules below)

### Supabase Setup
1. Create a project at [supabase.com](https://supabase.com)
2. Go to **Settings → API** → copy Project URL and `anon` public key into `.env`
3. Create a public storage bucket named `avatars`

### Gemini API Setup
1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click **Get API Key** → copy into `.env`

### Run Locally

```bash
npm run dev
```

App will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
npm run preview   # test the production build locally
```

---

## 🔒 Firestore Security Rules

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## 🤖 AI Integration Details

FlowMind uses **Google Gemini 2.0 Flash** for all AI features:

- **Task Planning** — breaks a single goal description into structured subtasks with priority and time estimates
- **Daily Briefing** — generates a personalized morning summary based on the user's current tasks
- **Smart Scheduling** — converts a free-text description of commitments into a structured weekly schedule
- **Conversational Assistant (Flow)** — multi-turn chat with task/schedule creation via structured output parsing
- **Productivity Insights** — analyzes weekly stats and generates actionable, data-driven recommendations

All AI calls are wrapped with timeout handling and graceful fallbacks so the app remains usable even if the AI service is unavailable.

---

## 📱 Progressive Web App

FlowMind is installable as a PWA on both mobile and desktop, with offline-aware messaging and a custom app icon/manifest.

---

## 🏆 Hackathon Alignment

| Evaluation Focus | How FlowMind Delivers |
|---|---|
| Intelligent task prioritization | AI re-prioritization engine with reasoning |
| AI-powered scheduling | Natural-language → structured calendar via Gemini |
| Personalized recommendations | AI-generated insights based on real usage stats |
| Context-aware reminders | Deadline-proximity-based notification system |
| Calendar integration | Full calendar view + `.ics` export |
| Goal & habit tracking | Habit grid, streaks, achievements |
| Voice-enabled assistance | Web Speech API input/output throughout |
| Autonomous planning | One-line goal → full actionable plan, no manual breakdown needed |

---

## 👤 Author

**Abhinav** — Computer Science & Data Science student, Lokmanya Tilak College of Engineering (Mumbai University)

Built for the Vibe to Ship 2026 Hackathon (Coding Ninjas × Google for Developers)

---

## 📄 License

This project was built for hackathon submission purposes.
