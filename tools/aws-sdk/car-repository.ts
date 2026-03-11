import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ServiceException } from "@smithy/smithy-client";
import {
  DbReadError,
  DbUpdateError,
  TsSaveError,
  UnExpectedError,
} from "../error.js";
import type { CarDetail, CarRecord, CarStatus } from "../types.js";

export class CarRepository {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor() {
    const client = new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = "Cars";
  }

  async getAll(): Promise<Map<string, CarRecord>> {
    try {
      const result = await this.docClient.send(
        new ScanCommand({
          TableName: this.tableName,
        }),
      );

      const map = new Map<string, CarRecord>();
      for (const item of result.Items ?? []) {
        const record = item as CarRecord;
        map.set(record.carName, record);
      }
      return map;
    } catch (e) {
      if (e instanceof ServiceException) {
        throw new DbReadError("getAll", e);
      } else {
        throw new UnExpectedError(e);
      }
    }
  }

  async put(
    carName: string,
    status: CarStatus,
    data: CarDetail,
  ): Promise<void> {
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: { carName, status, data },
        }),
      );
    } catch (e) {
      if (e instanceof ServiceException) {
        throw new DbUpdateError(carName, e.name, e);
      } else {
        throw new UnExpectedError(e);
      }
    }
  }

  async updateStatus(carName: string, status: CarStatus): Promise<void> {
    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { carName },
          UpdateExpression: "SET #s = :status",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":status": status },
        }),
      );
    } catch (e) {
      if (e instanceof ServiceException) {
        throw new DbUpdateError(carName, e.name, e);
      } else {
        throw new UnExpectedError(e);
      }
    }
  }

  async updateTs(carName: string, ts: string): Promise<void> {
    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { carName },
          UpdateExpression: "SET #t = :ts",
          ExpressionAttributeNames: { "#t": "ts" },
          ExpressionAttributeValues: { ":ts": ts },
        }),
      );
    } catch (e) {
      if (e instanceof ServiceException) {
        throw new TsSaveError(carName, e.name, e);
      } else {
        throw new UnExpectedError(e);
      }
    }
  }

  async updateData(carName: string, data: CarDetail): Promise<void> {
    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { carName },
          UpdateExpression: "SET #d = :data",
          ExpressionAttributeNames: { "#d": "data" },
          ExpressionAttributeValues: { ":data": data },
        }),
      );
    } catch (e) {
      if (e instanceof ServiceException) {
        throw new DbUpdateError(carName, e.name, e);
      } else {
        throw new UnExpectedError(e);
      }
    }
  }

  async delete(carName: string): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { carName },
      }),
    );
  }

  async deleteAll(): Promise<void> {
    const existing = await this.getAll();
    for (const carName of existing.keys()) {
      await this.delete(carName);
    }
  }
}
