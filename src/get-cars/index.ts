import { CarManager } from "../../tools/car-data/car-manager.js";
import { postCarMessage } from "../../tools/slack/post-carmessage.js";
import type { CarWithType } from "../../tools/types.js";

const EXECUTION_TIMES = process.env.EXECUTION_TIMES
  ? parseInt(process.env.EXECUTION_TIMES, 10)
  : 1;
const EXECUTION_INTERVAL_SECONDS = process.env.EXECUTION_INTERVAL_SECONDS
  ? parseInt(process.env.EXECUTION_INTERVAL_SECONDS, 10)
  : 45;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const manager = new CarManager();

export const handler = async () => {
  const allErrors: string[] = [];
  const allChanges: CarWithType[] = [];

  for (let i = 0; i < EXECUTION_TIMES; i++) {
    if (i > 0) {
      await sleep(EXECUTION_INTERVAL_SECONDS * 1000);
    }

    console.log(`Starting execution ${i + 1}/${EXECUTION_TIMES}...`);

    await manager.getCars();

    const results = await Promise.allSettled(
      manager.changes.map(async (car) => {
        const result = await postCarMessage(car);

        // 新着投稿時、SlackメッセージのタイムスタンプをDBに保存
        if (result?.ts) {
          await manager.updateTs(result.carName, result.ts);
        }
      }),
    );

    allChanges.push(...manager.changes);

    const errors = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    if (errors.length) {
      console.error(
        `[Run ${i + 1}/${EXECUTION_TIMES}] Failed to process some cars:`,
        errors.map((e) => e.reason),
      );
      allErrors.push(...errors.map((e) => String(e.reason)));
    }
  }

  return {
    statusCode: allErrors.length > 0 ? 207 : 200,
    body: JSON.stringify(allChanges),
  };
};
