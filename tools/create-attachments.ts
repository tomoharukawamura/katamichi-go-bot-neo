import links from '../json/shops/link.json'
import kanaMap from '../json/charactors/kana.json'
import abolishedCars from '../json/cars/abolished-cars.json'
import specialIcons from '../json/decorators/car-icon.json'
import carColors from '../json/decorators/car-colors.json'
import cars from '../json/cars/toyota-cars.json'
import shopArea from '../json/shops/shop-area.json'
import type { CarType, CarWithType, ShopAreaEntry } from './types.js'

const typedKanaMap = kanaMap as Record<string, string>
const typedLinks = links as Record<string, string>
const typedAbolishedCars = abolishedCars as Record<string, boolean>
const typedSpecialIcons = specialIcons as Record<string, string>
const typedCarColors = carColors as Record<string, string>
const typedShopArea = shopArea as Record<string, Record<string, ShopAreaEntry>>

const KANA_REGEXP = new RegExp(`(${Object.keys(typedKanaMap).join('|')})`, 'g')
const CAR_REGEXP = new RegExp(`^(${cars.join('|')}).+?$`)
const COLORRA_SUFFIX_REG = /^(ツーリング|アクシオ|フィールダー)/
const HIECE_SUFFIX_REG = /^(グランドキャビン)/
const RANDCLUISER_SUFFIX_REG = /^(プラド)/
const FIELDER_TYPO_REG = /(フィルダー)/g
const ESQUIER_TYPO_REG = /(エクスワイア|エスクワィア)/g
const YARIS_TYPO_REG = /(ヤルス)/g

const checkCars = (rawName: string) => {
  const name = rawName
    .replace(' ', '')
    .replace('　', '')
    .replace(KANA_REGEXP, (match) => typedKanaMap[match])
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (str) => String.fromCharCode(str.charCodeAt(0) - 0xfee0))
    .replace('PHEV', 'PHV')
    .replace('α', 'アルファ')
    .replace('新型', '')
    .replace(FIELDER_TYPO_REG, 'フィールダー')
    .replace(ESQUIER_TYPO_REG, 'エスクァイア')
    .replace(YARIS_TYPO_REG, 'ヤリス')
    .replace(COLORRA_SUFFIX_REG, 'カローラ$1')
    .replace(HIECE_SUFFIX_REG, 'ハイエース$1')
    .replace(RANDCLUISER_SUFFIX_REG, 'ランドクルーザー$1')
    .replace(CAR_REGEXP, '$1')

  return {
    isAbolished: typedAbolishedCars[name] ?? false,
    icon: typedSpecialIcons[name] ?? '🚗',
    photo: null,
    color: typedCarColors[name] ?? '#36a64f',
  }
}

interface ShopData {
  link: string
  area: string
}

const extractShopData = (shopStr: string): ShopData => {
  const [apartment, shop] = shopStr.split(' ')
  const areaData = typedLinks[apartment]
  if (!areaData) {
    throw new Error(`Start area not found for shop: ${shopStr}`)
  }
  const [link, area] = areaData.split(',')

  const detailedArea = typedShopArea[link]?.[shop]?.name ?? null
  const isSingle = typedShopArea[link]?.[shop]?.single ?? false
  const areaName =
    (isSingle ? detailedArea! : area.concat(detailedArea ? `(${detailedArea})` : ''))

  return { link, area: areaName }
}

const convertPhoneNumber = (phone: string) => {
  const phoneNumberWithoutHyphen = phone.replace(/-/g, '')
  if (phoneNumberWithoutHyphen.length == 10) {
    return phoneNumberWithoutHyphen.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3')
  }
  return phone
}

const defineTitle = (type: CarType, icon: string) => {
  switch (type) {
    case 'new':
      return icon == '🚀' ? '着弾' : '新着'
    case 'updated':
      return '更新'
    case 'recovered':
      return '受付再開'
    case 'soldOut':
      return '受付終了'
    case 'search':
      return null
    default:
      throw new Error(`Unknown type: ${type}`)
  }
}

const shopListUrlPrefix = 'https://cp.toyota.jp/rentacar/shoplist/'

export const createAttachments = (car: CarWithType, idx = 0) => {
  const { area: startAreaName } = extractShopData(car.startShop)
  const { area: returnAreaName, link: returnAreaLink } = extractShopData(car.returnShop)
  const areaMessage = `${startAreaName}→${returnAreaName}`
  const returnShopCandidateLink = `${shopListUrlPrefix}${returnAreaLink}.html`
  const carData = checkCars(car.carName)
  const title = defineTitle(car.type, carData.icon)
  const basePreText =
    car.type != 'soldOut' && carData.icon ? `${carData.icon}${title}${carData.icon}` : `【${title}】`
  const pretext = (title ? basePreText : `${idx + 1}件目`).concat(
    carData.isAbolished && car.type != 'soldOut' ? ' 🚫導入終了車🚫' : '',
  )
  const color = car.type != 'soldOut' ? carData.color : '#d3d3d3'

  return {
    color,
    fallback: pretext,
    pretext,
    fields: [
      {
        title: '区間',
        value: areaMessage,
        short: false,
      },
      {
        title: '車両',
        value: car.carName,
        short: false,
      },
      {
        title: '出発店舗',
        value: car.startShop,
        short: false,
      },
      {
        title: '返却',
        value: car.returnShop.concat(
          car.type != 'soldOut' ? `（返却可能店舗は<${returnShopCandidateLink}|こちら>）` : '',
        ),
        short: false,
      },
      ...(car.type != 'soldOut'
        ? [
            {
              title: '車両条件',
              value: car.condition,
              short: false,
            },
            {
              title: '貸出期間',
              value: car.date,
              short: false,
            },
            {
              title: '予約電話番号',
              value: convertPhoneNumber(car.reservePhoneNumber),
              short: false,
            },
          ]
        : []),
    ],
  }
}
