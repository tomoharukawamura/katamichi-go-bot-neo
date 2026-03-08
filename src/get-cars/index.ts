import { CarManager } from '../../tools/car-manager.js'
import { postCarMessage } from '../../tools/post-carmessage.js'

const manager = new CarManager()

export const handler = async () => {
  await manager.getCars()

  for (const car of manager.changes) {
    const result = await postCarMessage(car)

    // 新着投稿時、SlackメッセージのタイムスタンプをDBに保存
    if (result?.ts) {
      await manager.updateTs(result.carName, result.ts)
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify(manager.changes),
  }
}
