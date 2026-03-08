import { CarManager } from '../../tools/car-manager.js'

export const handler = async () => {
  const manager = new CarManager()
  await manager.initDB()

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'DB initialized' }),
  }
}
