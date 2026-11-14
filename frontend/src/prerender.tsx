import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

// Only the public home page is pre-rendered. The analysis workspace stays client-side.
export const homeMarkup = renderToString(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);
