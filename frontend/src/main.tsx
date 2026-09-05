import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { AuthProvider } from "./auth/AuthContext";
import { ToastProvider } from "./components/system";
import { router } from "./app/routes";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* One place makes every spring honour prefers-reduced-motion (§07.5). */}
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </MotionConfig>
  </React.StrictMode>,
);
