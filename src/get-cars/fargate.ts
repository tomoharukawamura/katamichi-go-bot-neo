import { CarManager } from "../../tools/car-data/car-manager.js";
import { CustomError } from "../../tools/error.js";
import { handleError } from "../../tools/error-handler.js";
import { postCarMessage } from "../../tools/slack/post-carmessage.js";

const isDev = process.env.NODE_ENV === "dev";
const INTERVAL_SECONDS = parseInt(process.env.INTERVAL_SECONDS ?? "5", 10);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const manager = new CarManager();

  do {
    try {
      console.log(`Starting execution at ${new Date().toISOString()}`);
      await manager.getCars();

      const results = await Promise.allSettled(
        manager.changes.map(async (car) => {
          const result = await postCarMessage(car);
          if (result?.ts) {
            try {
              await manager.updateTs(result.carName, result.ts);
            } catch (e) {
              if (e instanceof CustomError) await handleError(e, car);
            }
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
}

main();
