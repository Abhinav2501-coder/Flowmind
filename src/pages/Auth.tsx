import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Eye, EyeOff, CheckCircle2, Check, Loader2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export function Auth() {
  const [isSignIn, setIsSignIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("Professional");

  const { login, signup, googleSignIn } = useAuth();
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignIn) {
        await login(email, password);
        toast.success("Signed in successfully");
      } else {
        await signup(email, password, name, role);
        toast.success("Account created successfully");
      }
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await googleSignIn();
      toast.success("Signed in with Google");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const GoogleLogo = () => (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className="w-5 h-5 mr-2"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );

  return (
    <div className="flex min-h-screen bg-background text-text font-sans">
      {/* Left Panel - Hidden on Mobile */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12">
        <motion.div
          className="absolute inset-0 z-0 bg-gradient-to-br from-primary to-[#050510]"
          animate={{
            backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          style={{ backgroundSize: "200% 200%" }}
        />

        <div className="relative z-10">
          <div className="text-3xl font-bold font-display text-white tracking-tight mb-2">
            FlowMind
          </div>
          <p className="text-white/80 text-lg">
            Your AI productivity companion
          </p>
        </div>

        <div className="relative z-10 mt-auto">
          <div className="space-y-6 mb-16">
            {[
              "Plan your week in 10 seconds with AI",
              "Smart scheduling based on your energy",
              "Voice commands for hands-free productivity",
            ].map((feature, i) => (
              <div key={i} className="flex items-center text-white/90">
                <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center mr-4 shrink-0">
                  <Check className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg">{feature}</span>
              </div>
            ))}
          </div>

          <motion.div
            className="bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-2xl max-w-sm"
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-success" />
              </div>
              <div>
                <h4 className="font-bold text-white font-display mb-1">
                  Task Completed
                </h4>
                <p className="text-white/70 text-sm">
                  "Finish Q3 OKR Planning" was marked as done. Your streak is
                  now 14 days!
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative">
        {loading && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-50 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
        )}

        <div className="w-full max-w-md">
          {/* Tabs */}
          <div className="flex border-b border-surface mb-8 relative">
            <button
              className={`flex-1 pb-4 text-lg font-medium transition-colors ${isSignIn ? "text-primary" : "text-muted hover:text-text"}`}
              onClick={() => setIsSignIn(true)}
            >
              Sign In
            </button>
            <button
              className={`flex-1 pb-4 text-lg font-medium transition-colors ${!isSignIn ? "text-primary" : "text-muted hover:text-text"}`}
              onClick={() => setIsSignIn(false)}
            >
              Sign Up
            </button>
            <motion.div
              className="absolute bottom-0 h-0.5 bg-primary rounded-full"
              initial={false}
              animate={{
                left: isSignIn ? "0%" : "50%",
                width: "50%",
              }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          </div>

          {/* Form */}
          <AnimatePresence mode="wait">
            <motion.form
              key={isSignIn ? "signin" : "signup"}
              initial={{ opacity: 0, x: isSignIn ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isSignIn ? 20 : -20 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleAuth}
              className="space-y-5"
            >
              {!isSignIn && (
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 bg-surface border border-surface rounded-xl focus:border-primary focus:outline-none transition-colors"
                    placeholder="John Doe"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-surface border border-surface rounded-xl focus:border-primary focus:outline-none transition-colors"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-muted">
                    Password
                  </label>
                  {isSignIn && (
                    <a
                      href="#"
                      className="text-sm text-primary hover:underline"
                    >
                      Forgot password?
                    </a>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-surface border border-surface rounded-xl focus:border-primary focus:outline-none transition-colors pr-12"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {!isSignIn && (
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">
                    I am a
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-4 py-3 bg-surface border border-surface rounded-xl focus:border-primary focus:outline-none transition-colors appearance-none"
                  >
                    <option value="Student">Student</option>
                    <option value="Professional">Professional</option>
                    <option value="Entrepreneur">Entrepreneur</option>
                  </select>
                </div>
              )}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-primary text-white font-medium rounded-xl transition-colors hover:bg-primary/90 mt-4 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isSignIn ? (
                  "Sign In"
                ) : (
                  "Create Account"
                )}
              </motion.button>
            </motion.form>
          </AnimatePresence>

          <div className="mt-8 flex items-center gap-4">
            <div className="flex-1 h-px bg-surface"></div>
            <span className="text-muted text-sm font-medium">
              or continue with
            </span>
            <div className="flex-1 h-px bg-surface"></div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full mt-8 py-4 bg-surface border border-surface hover:border-text/20 text-text font-medium rounded-xl transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <GoogleLogo />
            Google
          </motion.button>
        </div>
      </div>
    </div>
  );
}
