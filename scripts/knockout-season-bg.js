const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

async function knockOut(src, dest, threshold = 235) {
  const image = sharp(src)
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const nearWhite = min > threshold
    const nearGrayPlate = max > 200 && max - min < 18 && min > 165
    if (nearWhite || nearGrayPlate) data[i + 3] = 0
  }
  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toFile(dest)
  console.log('wrote', path.basename(dest), info.width + 'x' + info.height)
}

async function main() {
  const dir = path.join(__dirname, '..', 'public', 'season')
  await knockOut(path.join(dir, 'tree.png'), path.join(dir, 'tree-cut.png'), 248)
  await knockOut(path.join(dir, 'candy-cane.png'), path.join(dir, 'candy-cane-cut.png'), 198)
  await knockOut(path.join(dir, 'snowflake-gold.png'), path.join(dir, 'snowflake-cut.png'), 245)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
