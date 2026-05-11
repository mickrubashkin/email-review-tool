import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./build-stamp.css";

import App from "./App.tsx";
import { theme } from "./theme";

const queryClient = new QueryClient();
const BUILD_STAMP = "2026-05-11-3";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme}>
        <Notifications position="top-right" />
        <App />
      </MantineProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

document.documentElement.dataset.reviewdeskBuild = BUILD_STAMP;
