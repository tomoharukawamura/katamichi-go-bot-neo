import { gunzipSync, gzipSync } from "node:zlib";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { DbReadError, DbUpdateError, UnExpectedError } from "../error.js";
import { ServiceException } from "@smithy/smithy-client";

export class HtmlCacheRepository {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor() {
    const client = new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = "HtmlCache";
  }

  async get(url: string): Promise<string | null> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { url },
        }),
      );
      const data = result.Item?.html;
      if (!data) return null;
      return gunzipSync(Buffer.from(data)).toString("utf-8");
    } catch (e) {
      if (e instanceof ServiceException) {
        throw new DbReadError(url, e);
      } else {
        throw new UnExpectedError(e);
      }
    }
  }

  async put(url: string, html: string): Promise<void> {
    try {
      const compressed = gzipSync(Buffer.from(html, "utf-8"));
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: { url, html: compressed },
        }),
      );
    } catch (e) {
      if (e instanceof ServiceException) {
        throw new DbUpdateError(url, e.name, e);
      } else {
        throw new UnExpectedError(e);
      }
    }
  }
}
