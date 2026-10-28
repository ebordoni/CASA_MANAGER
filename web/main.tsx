import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, createTheme, Modal, Drawer } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { Notifications } from "@mantine/notifications";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/it";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "@fontsource-variable/noto-sans";
import "./styles.css";
import { App } from "./App";
dayjs.extend(customParseFormat);
dayjs.locale("it");
const theme = createTheme({
  components: {
    Modal: Modal.extend({
      defaultProps: { closeButtonProps: { "aria-label": "Chiudi finestra" } },
    }),
    Drawer: Drawer.extend({
      defaultProps: { closeButtonProps: { "aria-label": "Chiudi dettaglio" } },
    }),
  },
  primaryColor: "forest",
  colors: {
    forest: [
      "#edf6f2",
      "#d9e9e1",
      "#b3d1c0",
      "#8bb99f",
      "#69a583",
      "#52986f",
      "#438d64",
      "#347b54",
      "#296d48",
      "#195e3c",
    ],
  },
  fontFamily: '"Noto Sans Variable", sans-serif',
  defaultRadius: "md",
  headings: {
    fontFamily: '"Noto Sans Variable", sans-serif',
    fontWeight: "400",
  },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme}>
      <DatesProvider settings={{ locale: "it", firstDayOfWeek: 1 }}>
        <Notifications position="top-right" />
        <App />
      </DatesProvider>
    </MantineProvider>
  </React.StrictMode>,
);
