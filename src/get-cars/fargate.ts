import { CarManager } from "../../tools/car-data/car-manager.js";
import { postCarMessage } from "../../tools/slack/post-carmessage.js";

const isDev = process.env.NODE_ENV === "dev";
const INTERVAL_SECONDS = parseInt(process.env.INTERVAL_SECONDS ?? "5", 10);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const manager = new CarManager();
  await manager.loadRecords();

  const shutdown = async () => {
    console.log("Saving records to DynamoDB...");
    await manager.saveRecords();
    console.log("Records saved. Exiting.");
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  do {
    try {
      console.log(`Starting execution at ${new Date().toISOString()}`);
      await manager.getCars();

      const results = await Promise.allSettled(
        manager.changes.map(async (car) => {
          const result = await postCarMessage(car);
          if (result?.ts) {
            manager.updateTs(result.carName, result.ts);
          }
        }),
      );

      const errors = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      if (errors.length > 0) {
        throw new Error(
          `${errors.length}件のエラーが発生: ${errors.map((e) => e.reason).join(", ")}`,
        );
      }
    } catch (e) {
      console.error("Unexpected error:", e);
    } finally {
      manager.changes = [];
    }

    if (isDev) break;

    await sleep(INTERVAL_SECONDS * 1000);
  } while (true);

  await manager.saveRecords();
}

main();
