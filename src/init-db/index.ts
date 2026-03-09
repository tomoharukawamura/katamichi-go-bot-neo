import { CarManager } from "../../tools/car-data/car-manager.js";

export const handler = async () => {
  const manager = new CarManager();
  await manager.initDB();

  // その日の 07:00〜21:00 JST で get-cars を1分おきに実行するスケジュールを作成
  const now = new Date();
  const jstDateStr = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const scheduleName = `get-cars-${jstDateStr}`;
  const startDate = new Date(`${jstDateStr}T07:00:00+09:00`);
  const endDate = new Date(`${jstDateStr}T21:00:00+09:00`);

  return {
    statusCode: 200,
    message: "dynamodb initialized",
    schedulerProps: {
      name: scheduleName,
      start: startDate,
      end: endDate,
    },
  };
};
