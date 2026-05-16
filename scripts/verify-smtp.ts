import "dotenv/config";
import { verifySmtp } from "../src/lib/email";

(async () => {
  console.log("Host:", process.env.SMTP_HOST);
  console.log("Port:", process.env.SMTP_PORT);
  console.log("User:", process.env.SMTP_USER);
  const r = await verifySmtp();
  console.log("Result:", r);
  process.exit(r.connected ? 0 : 1);
})();
