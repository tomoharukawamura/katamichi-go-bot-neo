import { CarManager } from "../../tools/car-data/car-manager.js";
import { CustomError } from "../../tools/error.js";
import { handleError } from "../../tools/error-handler.js";
import { postCarMessage } from "../../tools/slack/post-carmessage.js";
import type { Context } from "aws-lambda";

const EXECUTION_TIMES = process.env.EXECUTION_TIMES
  ? parseInt(process.env.EXECUTION_TIMES, 10)
  : 1;
const EXECUTION_INTERVAL_SECONDS = process.env.EXECUTION_INTERVAL_SECONDS
  ? parseInt(process.env.EXECUTION_INTERVAL_SECONDS, 10)
  : 60;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const manager = new CarManager();

// SNSへの送信失敗のみ失敗とみなす。
export const handler = async (_event: unknown, context: Context) => {
  console.log(`Request ID: ${context.awsRequestId}`);

  for (let i = 0; i < EXECUTION_TIMES; i++) {
    if (i > 0) {
      await sleep(EXECUTION_INTERVAL_SECONDS * 1000);
    }

    console.log(`Starting execution ${i + 1}/${EXECUTION_TIMES}...`);

    await manager.getCars();

    await Promise.allSettled(
      manager.changes.map(async (car) => {
        const result = await postCarMessage(car);

        if (result?.ts) {
          try {
            await manager.updateTs(result.carName, result.ts);
          } catch (e) {
            if (e instanceof CustomError) {
              await handleError(e, car);
            }
          }
        }
      }),
    );
  }
};
