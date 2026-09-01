import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { installMockModelContext } from "./webmcp/devMock";

installMockModelContext();

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
