import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { CustomError, SlackPostError } from "./error.js";
import type { CarWithType } from "./types.js";

const snsClient = new SNSClient({});
const topicArn = process.env.SNS_TOPIC_ARN ?? "";

/**
 * エラーキーを生成（service: name#carName）
 */
function buildErrorKey(error: CustomError): string {
  const carName =
    "carName" in error ? (error as { carName: string }).carName : "";
  const base = `${error.service}: ${error.name}`;
  return carName ? `${base}#${carName}` : base;
}

/**
 * エラーハンドリング関数
 * 1. consoleにエラーを出力
 * 2. SNSに通知（carデータがあれば含める）
 */
export async function handleError(
  error: CustomError,
  car?: CarWithType,
): Promise<void> {
  const errorKey = buildErrorKey(error);

  const topicArn =
    error instanceof SlackPostError
      ? (process.env.SNS_SLACK_TOPIC_ARN ?? "")
      : (process.env.SNS_TOPIC_ARN ?? "");
  if (!topicArn) {
    const message = `[${errorKey}] SNS_TOPIC_ARN or SNS_SLACK_TOPIC_ARN is not set. Cannot send error notification.`;
    throw new Error(message);
  }

  // 1. consoleにエラーを出力
  console.error(`[${errorKey}] ${error.message}`, error.cause);

  // 2. SNSに通知
  const messageParts = [
    `▼ エラー種別`,
    `  ${error.name}`,
    ``,
    `▼ サービス`,
    `  ${error.service}`,
    ``,
    `▼ メッセージ`,
    `  ${error.message}`,
    ``,
    `▼ 原因`,
    `  ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`,
  ];

  if (car) {
    const typeLabel = {
      new: "新着",
      updated: "更新",
      recovered: "受付再開",
      soldOut: "受付終了",
      search: "検索",
    }[car.type];

    messageParts.push(
      ``,
      `── 処理失敗データ ──`,
      ``,
      `▼ 種別`,
      `  ${typeLabel}`,
      ``,
      `▼ 区間`,
      `  ${car.startArea} → ${car.returnArea}`,
      ``,
      `▼ 店舗`,
      `  出発: ${car.startShop}`,
      `  返却: ${car.returnShop}`,
      ``,
      `▼ 車両条件`,
      `  ${car.condition}`,
      ``,
      `▼ 貸出期間`,
      `  ${car.date}`,
      ``,
      `▼ 予約電話番号`,
      `  ${car.reservePhoneNumber}`,
    );
  }

  await snsClient.send(
    new PublishCommand({
      TopicArn: topicArn,
      Subject: `【片道GO エラー通知】${errorKey}`,
      Message: messageParts.join("\n"),
    }),
  );
}
