import {compressAdImage} from './utils'

jest.mock('jimp', () => {
  const actual = jest.requireActual('jimp')

  return {
    ...actual,
    Jimp: {
      read: jest.fn(
        async () => new actual.Jimp({width: 4, height: 2, color: 0xff0000ff})
      ),
    },
  }
})

const sourcePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAE0lEQVR4AWP8z8DwnwEJMDGgAQA/JwICmf9JwwAAAABJRU5ErkJggg==',
  'base64'
)

const sourceArrayBuffer = sourcePng.buffer.slice(
  sourcePng.byteOffset,
  sourcePng.byteOffset + sourcePng.byteLength
)

test('compressAdImage preserves aspect ratio and requested output format', async () => {
  const png = await compressAdImage(sourceArrayBuffer, {
    width: 2,
    height: 2,
    type: 'image/png',
  })

  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  )
  expect(png.readUInt32BE(16)).toBe(2)
  expect(png.readUInt32BE(20)).toBe(1)

  const jpeg = await compressAdImage(sourceArrayBuffer, {
    width: 2,
    height: 2,
    type: 'image/jpeg',
  })

  expect(jpeg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
  expect(jpeg.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]))
})
