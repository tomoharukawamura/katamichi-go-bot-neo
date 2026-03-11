import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import type { CarWithType } from "../types.js";

export class SnsRepository {
  private client: SNSClient;
  private topicArn: string;

  constructor() {
    this.client = new SNSClient({});
    this.topicArn = process.env.SNS_TOPIC_ARN ?? "";
  }

  async publishCarAlert(car: CarWithType): Promise<void> {
    const typeLabel = {
      new: "新着",
      updated: "更新",
      recovered: "受付再開",
      soldOut: "受付終了",
      search: "検索",
    }[car.type];

    const message = [
      `【${typeLabel}】${car.carName}`,
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
    ].join("\n");

    await this.client.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Subject: `【片道GO】${typeLabel} ${car.carName}`,
        Message: message,
      }),
    );
  }
}
