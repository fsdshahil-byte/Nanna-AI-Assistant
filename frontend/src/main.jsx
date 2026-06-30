import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import "./nanna-os.css";
const queryClient = new QueryClient();
createRoot(document.getElementById("root")).render(<React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>);
