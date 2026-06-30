/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { motion, AnimatePresence } from "motion/react";
import { LandingPage } from "./components/LandingPage";
import { Auth } from "./pages/Auth";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { FocusModeProvider } from "./components/FocusMode";
import { ErrorBoundary } from "./components/ErrorBoundary";

const Dashboard = lazy(() =>
  import("./pages/Dashboard").then((module) => ({ default: module.Dashboard })),
);
const Tasks = lazy(() => import("./pages/Tasks"));
const CalendarPage = lazy(() => import("./pages/Calendar"));
const AiChat = lazy(() => import("./pages/AiChat"));
const Analytics = lazy(() =>
  import("./pages/Analytics").then((module) => ({ default: module.Analytics })),
);
const Settings = lazy(() => import("./pages/Settings"));

import { NotFound } from "./pages/NotFound";

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.2 }}
    className="h-full"
  >
    {children}
  </motion.div>
);

const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path="/"
          element={
            <PageWrapper>
              <LandingPage />
            </PageWrapper>
          }
        />
        <Route
          path="/auth"
          element={
            <PageWrapper>
              <Auth />
            </PageWrapper>
          }
        />

        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route
            path="/dashboard"
            element={
              <PageWrapper>
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="p-8">
                        <div className="animate-pulse bg-surface/50 h-64 rounded-xl"></div>
                      </div>
                    }
                  >
                    <Dashboard />
                  </Suspense>
                </ErrorBoundary>
              </PageWrapper>
            }
          />
          <Route
            path="/tasks"
            element={
              <PageWrapper>
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="p-8">
                        <div className="animate-pulse bg-surface/50 h-64 rounded-xl"></div>
                      </div>
                    }
                  >
                    <Tasks />
                  </Suspense>
                </ErrorBoundary>
              </PageWrapper>
            }
          />
          <Route
            path="/calendar"
            element={
              <PageWrapper>
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="p-8">
                        <div className="animate-pulse bg-surface/50 h-64 rounded-xl"></div>
                      </div>
                    }
                  >
                    <CalendarPage />
                  </Suspense>
                </ErrorBoundary>
              </PageWrapper>
            }
          />
          <Route
            path="/ai-chat"
            element={
              <PageWrapper>
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="p-8">
                        <div className="animate-pulse bg-surface/50 h-64 rounded-xl"></div>
                      </div>
                    }
                  >
                    <AiChat />
                  </Suspense>
                </ErrorBoundary>
              </PageWrapper>
            }
          />
          <Route
            path="/analytics"
            element={
              <PageWrapper>
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="p-8">
                        <div className="animate-pulse bg-surface/50 h-64 rounded-xl"></div>
                      </div>
                    }
                  >
                    <Analytics />
                  </Suspense>
                </ErrorBoundary>
              </PageWrapper>
            }
          />
          <Route
            path="/settings"
            element={
              <PageWrapper>
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="p-8">
                        <div className="animate-pulse bg-surface/50 h-64 rounded-xl"></div>
                      </div>
                    }
                  >
                    <Settings />
                  </Suspense>
                </ErrorBoundary>
              </PageWrapper>
            }
          />
        </Route>
        
        <Route path="*" element={<PageWrapper><NotFound /></PageWrapper>} />
      </Routes>
    </AnimatePresence>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <FocusModeProvider>
          <BrowserRouter>
            <AnimatedRoutes />
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-card)",
                },
              }}
            />
          </BrowserRouter>
        </FocusModeProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
