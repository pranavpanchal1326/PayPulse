import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { AuthProvider } from "./auth/AuthContext";
import { ToastProvider } from "./components/system";
import { startApiMode } from "./api/mode";
import { router } from "./app/routes";
import "./styles/index.css";

/**
 * The mock worker, if the flag asks for one, is started **before** the first
 * render. `AuthProvider` calls `/auth/me` in its first effect to restore a
 * session; a worker still registering at that moment lets that call reach the
 * network, and the app boots signed-out for no visible reason.
 *
 * In `live` mode `startApiMode()` resolves immediately and imports nothing.
 */
startApiMode().then(() => {
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
});
