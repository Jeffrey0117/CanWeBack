const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const PORT = process.env.PORT || 3000
const orders = new Map()

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body)) }
      catch { resolve({}) }
    })
    req.on('error', reject)
  })
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

function serveStatic(res, filePath) {
  const fullPath = path.join(__dirname, 'public', filePath === '/' ? 'index.html' : filePath)
  const ext = path.extname(fullPath)
  const mime = MIME_TYPES[ext] || 'application/octet-stream'

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
      return
    }
    res.writeHead(200, { 'Content-Type': mime })
    res.end(data)
  })
}

function generateFortune(birthday) {
  const date = new Date(birthday)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const seed = month * 31 + day

  const elements = ['金', '木', '水', '火', '土']
  const element = elements[seed % 5]

  const zodiacAnimals = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬']
  const zodiac = zodiacAnimals[date.getFullYear() % 12]

  const constellations = [
    '摩羯座', '水瓶座', '雙魚座', '牡羊座', '金牛座', '雙子座',
    '巨蟹座', '獅子座', '處女座', '天秤座', '天蠍座', '射手座'
  ]
  const constellationDays = [20, 19, 21, 20, 21, 21, 23, 23, 23, 23, 22, 22]
  const constellationIdx = day < constellationDays[month - 1] ? month - 1 : month % 12
  const constellation = constellations[constellationIdx]

  const luckScores = {
    overall: 50 + (seed % 45),
    love: 40 + ((seed * 7) % 55),
    career: 45 + ((seed * 13) % 50),
    wealth: 35 + ((seed * 3) % 60),
    health: 55 + ((seed * 11) % 40),
  }

  const personalityTraits = [
    ['聰明機智', '善於溝通', '直覺敏銳', '適應力強'],
    ['踏實穩重', '意志堅定', '值得信賴', '耐心十足'],
    ['熱情洋溢', '充滿活力', '領導力強', '勇於冒險'],
    ['溫柔體貼', '富有同情心', '藝術天份高', '感受力強'],
    ['理性務實', '組織能力佳', '注重細節', '責任感強'],
  ]
  const traits = personalityTraits[seed % 5]

  const yearAdvice = [
    '今年是突破自我的關鍵年，把握上半年的機會，大膽行動。',
    '穩紮穩打的一年，不宜衝動投資，但感情運勢極佳。',
    '貴人運旺盛，多參加社交活動，意想不到的機會正在等你。',
    '適合學習新技能的一年，投資自己永遠不會錯。',
    '財運亨通，但要注意健康，適度休息才能走得更遠。',
    '桃花朵朵開，單身者有望脫單，有伴者感情加溫。',
    '事業轉型的好時機，勇敢跨出舒適圈，前方一片光明。',
  ]

  const loveAdvice = [
    '你的靈魂伴侶可能就在身邊，留意那個總是默默關心你的人。',
    '感情中需要更多耐心，真愛需要時間醞釀。',
    '今年有機會遇到命中注定的那個人，保持開放的心態。',
    '舊情人可能回頭找你，但要理性判斷是否值得重新開始。',
    '你的魅力指數爆表，但別忘了真誠才是最吸引人的特質。',
  ]

  const careerAdvice = [
    '職場上會遇到重要的轉折點，第三季是關鍵時期。',
    '你的才華即將被伯樂發現，耐心等待機會的到來。',
    '適合創業或發展副業，你的五行屬性非常適合獨立發展。',
    '與同事的合作關係是成功的關鍵，多傾聽少爭論。',
    '有望升職加薪，但需要先證明自己的實力。',
  ]

  const wealthAdvice = [
    '下半年有一筆意外之財，但不宜過度揮霍。',
    '投資運不錯，但建議以穩健型投資為主。',
    '今年的財運與你的社交圈息息相關，人脈就是錢脈。',
    '適合開始理財規劃，為未來打下穩固的經濟基礎。',
    '偏財運佳，但正財更為穩定，腳踏實地最重要。',
  ]

  const luckyItems = {
    color: ['紅色', '藍色', '綠色', '金色', '紫色', '白色', '橙色'][seed % 7],
    number: ((seed * 7) % 9) + 1,
    direction: ['東方', '南方', '西方', '北方', '東南', '西北'][seed % 6],
    flower: ['玫瑰', '百合', '向日葵', '蘭花', '牡丹', '桃花'][seed % 6],
    day: ['星期一', '星期三', '星期五', '星期六', '星期日'][seed % 5],
  }

  return {
    birthday, zodiac, constellation, element, traits,
    luckScores, luckyItems,
    yearAdvice: yearAdvice[seed % yearAdvice.length],
    loveAdvice: loveAdvice[seed % loveAdvice.length],
    careerAdvice: careerAdvice[seed % careerAdvice.length],
    wealthAdvice: wealthAdvice[seed % wealthAdvice.length],
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const pathname = url.pathname

  // API routes
  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, { status: 'ok', service: 'canweback' })
  }

  if (pathname === '/api/fortune' && req.method === 'POST') {
    const body = await parseBody(req)
    if (!body.birthday) {
      return sendJson(res, { error: '請提供生日' }, 400)
    }

    const fortune = generateFortune(body.birthday)
    const orderId = crypto.randomUUID()
    orders.set(orderId, { fortune, paid: false, createdAt: new Date().toISOString() })

    return sendJson(res, {
      orderId,
      preview: {
        zodiac: fortune.zodiac,
        constellation: fortune.constellation,
        element: fortune.element,
        traits: fortune.traits.slice(0, 2),
        overallLuck: fortune.luckScores.overall,
      },
    })
  }

  if (pathname.startsWith('/api/fortune/') && req.method === 'GET') {
    const orderId = pathname.split('/')[3]
    const order = orders.get(orderId)
    if (!order) return sendJson(res, { error: '找不到此報告' }, 404)
    if (!order.paid) return sendJson(res, { error: '請先完成付款', orderId }, 402)
    return sendJson(res, { fortune: order.fortune })
  }

  if (pathname === '/api/pay' && req.method === 'POST') {
    const body = await parseBody(req)
    const order = orders.get(body.orderId)
    if (!order) return sendJson(res, { error: '找不到此訂單' }, 404)

    // For now, auto-approve (test mode)
    // When LetMeUse billing is ready, integrate here
    order.paid = true
    return sendJson(res, {
      success: true,
      message: '付款成功（測試模式）',
      redirectUrl: `/report.html?id=${body.orderId}`,
    })
  }

  if (pathname === '/api/webhook/payment' && req.method === 'POST') {
    const body = await parseBody(req)
    const order = orders.get(body.orderId)
    if (order && body.status === 'paid') {
      order.paid = true
    }
    return sendJson(res, { received: true })
  }

  // Static files
  serveStatic(res, pathname)
})

server.listen(PORT, () => {
  console.log(`canweback running on port ${PORT}`)
})
