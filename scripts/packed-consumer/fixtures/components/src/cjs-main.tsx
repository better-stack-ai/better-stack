import { createRoot } from "react-dom/client";
import components from "./commonjs.cjs";
import "@btst/components/markdown/css";
import "@btst/components/ui/css";

createRoot(document.getElementById("root")!).render(
	<components.CommonJSComponents />,
);
