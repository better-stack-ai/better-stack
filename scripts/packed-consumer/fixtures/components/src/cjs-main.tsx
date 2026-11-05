import { createRoot } from "react-dom/client";
import components from "./commonjs.cjs";
import "@btst/components/markdown/css";

createRoot(document.getElementById("root")!).render(
	<components.CommonJSComponents />,
);
