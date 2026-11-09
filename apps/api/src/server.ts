import { buildApp } from "./app.js";
import { env } from "./env.js";

const app = await buildApp();

app
  .listen({ port: env.API_PORT, host: "0.0.0.0" })
  .then((address) => app.log.info(`HotelGuru API läuft auf ${address}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
