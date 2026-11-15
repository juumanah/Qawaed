import { createApp } from "./app";
void createApp()
  .then((app) => app.listen(Number(process.env.PORT ?? 4000), "0.0.0.0"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
