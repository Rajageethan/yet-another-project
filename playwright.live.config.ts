import { e2eConfig } from "./playwright.config";

// `npm run e2e:live`: the live smoke test against the real Groq mentor.
export default e2eConfig(true);
