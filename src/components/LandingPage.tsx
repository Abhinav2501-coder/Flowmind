import { motion } from "motion/react";
import { Link } from "react-router-dom";
import {
  Brain,
  Calendar,
  Mic,
  Bell,
  TrendingUp,
  Zap,
  Star,
} from "lucide-react";
import { ParticleBackground } from "./ParticleBackground";
import { TypewriterText } from "./TypewriterText";

const features = [
  {
    icon: Brain,
    title: "AI Goal Planner",
    desc: "Describe any goal. Get a step-by-step action plan instantly.",
  },
  {
    icon: Calendar,
    title: "Smart Scheduling",
    desc: "AI fits tasks around your calendar and energy levels.",
  },
  {
    icon: Mic,
    title: "Voice Commands",
    desc: "Add tasks, ask questions, get updates — all by voice.",
  },
  {
    icon: Bell,
    title: "Deadline Guardian",
    desc: "Context-aware alerts before things go wrong.",
  },
  {
    icon: TrendingUp,
    title: "Habit Engine",
    desc: "Build streaks. Track progress. Compound your growth.",
  },
  {
    icon: Zap,
    title: "Focus Mode",
    desc: "Block distractions. Deep work sessions with ambient sounds.",
  },
];

const steps = [
  { num: "01", title: "Add your goals & tasks" },
  { num: "02", title: "AI builds your plan" },
  { num: "03", title: "Execute and track" },
];

const testimonials = [
  {
    quote:
      "FlowMind helped me submit all my assignments on time for the first time this semester.",
    author: "Priya S., Engineering Student",
  },
  {
    quote:
      "The AI scheduling is insane. It reorganized my whole week around a product launch.",
    author: "Rahul M., Startup Founder",
  },
  {
    quote:
      "I use the voice feature every morning to plan my day while getting ready.",
    author: "Aisha K., Marketing Manager",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-text overflow-x-hidden relative font-sans">
      <ParticleBackground />

      <div className="relative z-10">
        {/* Navbar */}
        <header className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="text-2xl font-bold font-display text-primary tracking-tight">
            FlowMind
          </div>
          <nav className="hidden md:flex gap-8 text-muted font-medium">
            <a href="#features" className="hover:text-text transition-colors">
              Features
            </a>
            <a
              href="#how-it-works"
              className="hover:text-text transition-colors"
            >
              How it works
            </a>
          </nav>
          <Link
            to="/dashboard"
            className="px-5 py-2 rounded-full bg-surface border border-surface hover:border-primary/50 text-text transition-colors font-medium"
          >
            Login
          </Link>
        </header>

        <main>
          {/* Hero Section */}
          <section className="max-w-7xl mx-auto px-6 pt-20 pb-32 flex flex-col items-center text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="font-display text-5xl md:text-7xl font-bold leading-tight mb-6"
            >
              Stop Managing Tasks.
              <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-br from-primary to-accent">
                Start Achieving Goals.
              </span>
            </motion.h1>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
            >
              <TypewriterText
                strings={[
                  "Plan your week in 10 seconds with AI",
                  "Never miss a deadline again",
                  "Turn goals into done tasks",
                  "Your AI chief of staff is here",
                ]}
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.8 }}
              className="mt-12 flex flex-col sm:flex-row gap-6 justify-center items-center"
            >
              <div className="relative group">
                <motion.div
                  className="absolute -inset-1 bg-primary rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"
                  animate={{ opacity: [0.2, 0.5, 0.2] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
                <Link to="/auth">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="relative px-8 py-4 bg-primary text-white font-medium rounded-full w-full sm:w-auto"
                  >
                    Get Started Free
                  </motion.button>
                </Link>
              </div>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  const el = document.getElementById('how-it-works');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-8 py-4 bg-transparent border border-muted hover:border-text text-text font-medium rounded-full transition-colors w-full sm:w-auto"
              >
                Watch Demo
              </motion.button>
            </motion.div>
          </section>

          {/* Features Section */}
          <section id="features" className="max-w-7xl mx-auto px-6 py-24">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold font-display">
                Everything you need to stay ahead
              </h2>
            </div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={{
                visible: { transition: { staggerChildren: 0.1 } },
              }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {features.map((f, i) => (
                <motion.div
                  key={i}
                  variants={{
                    hidden: { opacity: 0, y: 30 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.5 },
                    },
                  }}
                  whileHover={{ y: -4, borderColor: "rgba(124,110,240,0.6)" }}
                  className="p-8 rounded-2xl bg-[rgba(26,26,38,0.7)] border border-[rgba(124,110,240,0.2)] backdrop-blur-md flex flex-col items-start text-left transition-colors"
                >
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-6">
                    <f.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold font-display mb-3">
                    {f.title}
                  </h3>
                  <p className="text-muted leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </section>

          {/* How It Works Section */}
          <section
            id="how-it-works"
            className="max-w-7xl mx-auto px-6 py-24 relative"
          >
            <div className="text-center mb-20">
              <h2 className="text-3xl md:text-5xl font-bold font-display">
                How it works
              </h2>
            </div>

            <div className="relative flex flex-col md:flex-row justify-between items-center md:items-start gap-12 md:gap-4">
              {/* Connecting line for desktop */}
              <div className="hidden md:block absolute top-12 left-[10%] right-[10%] h-0 border-t-2 border-dashed border-surface z-0" />

              {steps.map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.6, delay: i * 0.2 }}
                  className="relative z-10 flex flex-col items-center text-center w-full md:w-1/3"
                >
                  <div className="w-24 h-24 rounded-full bg-card border-2 border-primary flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(124,110,240,0.2)]">
                    <span className="text-3xl font-bold font-display bg-clip-text text-transparent bg-gradient-to-br from-primary to-accent">
                      {step.num}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold font-display">
                    {step.title}
                  </h3>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Social Proof Section */}
          <section className="max-w-7xl mx-auto px-6 py-24">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {testimonials.map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="p-8 rounded-2xl bg-card border border-surface flex flex-col justify-between"
                  style={{
                    backgroundImage:
                      "linear-gradient(to bottom right, rgba(26,26,38,1), rgba(18,18,26,1))",
                  }}
                >
                  <div>
                    <div className="flex gap-1 mb-6">
                      {[...Array(5)].map((_, j) => (
                        <Star
                          key={j}
                          className="w-5 h-5 fill-accent text-accent"
                        />
                      ))}
                    </div>
                    <p className="text-text font-medium leading-relaxed mb-8">
                      "{t.quote}"
                    </p>
                  </div>
                  <p className="text-muted text-sm">{t.author}</p>
                </motion.div>
              ))}
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t border-surface mt-12 py-12">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">
            <div>
              <div className="text-2xl font-bold font-display text-primary tracking-tight mb-2">
                FlowMind
              </div>
              <p className="text-muted text-sm">Your AI chief of staff.</p>
            </div>
            <div className="flex gap-6 text-muted text-sm font-medium">
              <a href="#features" className="hover:text-text transition-colors">
                Features
              </a>
              <a href="#" className="hover:text-text transition-colors">
                Pricing
              </a>
              <a href="#" className="hover:text-text transition-colors">
                About
              </a>
            </div>
            <div className="text-muted text-sm">
              &copy; {new Date().getFullYear()} FlowMind.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
