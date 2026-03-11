/** AWS SDK関連エラーの基底クラス */
export class CustomError extends Error {
  public service: string = "";

  constructor(message: string, name: string, cause: unknown) {
    super(message);
    this.name = name;
    this.cause = cause;
  }
}

/** DynamoDB関連エラーの基底クラス */
export class DynamoDbError extends CustomError {
  constructor(message: string, name: string, cause: unknown) {
    super(message, name, cause);
    this.service = "DynamoDB";
  }
}

/** DB読み取り失敗（getAll/get） */
export class DbReadError extends DynamoDbError {
  constructor(name: string, cause: unknown) {
    super("DB read failed", name, cause);
  }
}

/** DB更新失敗（registerCars 内の put/updateStatus/updateData） */
export class DbUpdateError extends DynamoDbError {
  constructor(
    public readonly carName: string,
    name: string,
    cause: unknown,
  ) {
    super(`DB update failed for "${carName}"`, name, cause);
  }
}

/** ts保存失敗（updateTs） */
export class TsSaveError extends DynamoDbError {
  constructor(
    public readonly carName: string,
    name: string,
    cause: unknown,
  ) {
    super(`ts save failed for "${carName}"`, name, cause);
  }
}

/** SNS関連エラー */
export class SnsPublishError extends CustomError {
  constructor(
    public readonly carName: string,
    name: string,
    cause: unknown,
  ) {
    super(`SNS publish failed for "${carName}"`, name, cause);
    this.service = "SNS";
  }
}

/** Slack投稿失敗（postCarMessage） */
export class SlackPostError extends CustomError {
  constructor(
    public readonly carName: string,
    name: string,
    cause: unknown,
  ) {
    super(`Slack post failed for "${carName}"`, name, cause);
    this.service = "Slack";
  }
}

/** スクレイピング失敗 */
export class ScrapingError extends CustomError {
  constructor(
    public readonly carName: string,
    name: string,
    cause: unknown,
  ) {
    super(`Scraping failed for "${carName}"`, name, cause);
    this.service = "Scraping";
  }
}

export class UnExpectedError extends CustomError {
  constructor(cause: unknown) {
    super(`An unexpected error occurred`, "UnexpectedError", cause);
  }
}
